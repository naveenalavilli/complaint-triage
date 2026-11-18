import { Injectable, signal } from '@angular/core';
import { EDUCATION_CODE } from '../data/sample-data';
import { CodeSuggestion, ComplaintCase, EducationCodeChunk, TriageResult } from '../models';

@Injectable({ providedIn: 'root' })
export class PolicyTriageService {
  readonly state = signal<'idle' | 'loading' | 'ready' | 'fallback' | 'error'>('idle');
  readonly progress = signal('');
  private extractorPromise?: Promise<any>;
  private policyEmbeddingsPromise?: Promise<number[][]>;

  async triage(item: ComplaintCase): Promise<TriageResult> {
    this.state.set('loading');
    this.progress.set('Loading the free MiniLM model from Hugging Face…');
    const text = `${item.description}\n${item.extractedText ?? ''}`.trim();
    let ranked: Array<{ chunk: EducationCodeChunk; score: number }>;
    let retrievalMethod = 'MiniLM cosine similarity (browser-local embeddings)';

    try {
      ranked = await this.semanticRank(text);
      this.state.set('ready');
    } catch (error) {
      console.warn('Hugging Face model unavailable; using deterministic retrieval.', error);
      ranked = this.lexicalRank(text);
      retrievalMethod = 'Deterministic keyword-overlap fallback';
      this.state.set('fallback');
    }

    this.progress.set('Applying transparent citation, completeness, category, and risk rules…');
    const top = ranked.slice(0, 2);
    const lower = text.toLowerCase();
    const categories = this.categories(lower);
    const missingFields = [
      !item.teacherName ? 'teacherName' : '',
      !item.school ? 'school' : '',
      !item.incidentDate ? 'incidentDate' : '',
    ].filter(Boolean);
    const highRisk =
      /violence|weapon|abuse|assault|threat|self-harm|confidential|privacy|student information/.test(
        lower,
      );
    const mediumRisk = /discriminat|retaliat|grade|assessment|record|harass/.test(lower);
    const riskLevel = highRisk ? 'High' : mediumRisk ? 'Medium' : 'Low';
    const suggestions: CodeSuggestion[] = top.map(({ chunk, score }) => ({
      section: chunk.section,
      title: chunk.title,
      reason: this.reason(chunk, categories),
      sourceChunkId: chunk.id,
      sourceText: chunk.text,
      score: Math.round(score * 100) / 100,
    }));
    const retrievalScore = Math.max(0, Math.min(1, top[0]?.score ?? 0));
    const primary = top[0]?.chunk;
    const summary = `${item.requesterName || 'The requester'} alleges ${this.summaryPhrase(categories)}. ${
      missingFields.length
        ? `The reviewer should obtain ${missingFields.map(this.humanField).join(', ')} before a final decision.`
        : `The record is complete enough for a reviewer to compare the submission with ${primary?.section ?? 'the cited demo policy'}.`
    }`;
    this.progress.set('Policy matches and deterministic triage rules are ready for human review.');
    return {
      riskLevel,
      retrievalScore: Math.round(retrievalScore * 100) / 100,
      allegationCategories: categories,
      missingFields,
      triageSummary: summary,
      suggestedCodes: suggestions,
      recommendedTeam: primary?.team ?? 'District Support',
      retrievalMethod,
    };
  }

  private async semanticRank(
    text: string,
  ): Promise<Array<{ chunk: EducationCodeChunk; score: number }>> {
    const extractor = await this.extractor();
    const queryVector = await this.embed(extractor, text.slice(0, 4000));
    this.progress.set('Comparing the complaint with cached demo-policy embeddings…');
    const policyVectors = await this.policyEmbeddings(extractor);
    const ranked = EDUCATION_CODE.map((chunk, index) => ({
      chunk,
      score: this.dot(queryVector, policyVectors[index]),
    }));
    return ranked.sort((a, b) => b.score - a.score);
  }

  private async embed(extractor: any, value: string): Promise<number[]> {
    const tensor = await extractor(value, { pooling: 'mean', normalize: true });
    const nested = tensor.tolist() as number[][];
    return Array.isArray(nested[0]) ? nested[0] : (nested as unknown as number[]);
  }

  private policyEmbeddings(extractor: any): Promise<number[][]> {
    if (!this.policyEmbeddingsPromise) {
      this.progress.set(
        `Embedding ${EDUCATION_CODE.length} demo-policy sections once for this page session…`,
      );
      this.policyEmbeddingsPromise = Promise.all(
        EDUCATION_CODE.map((chunk) =>
          this.embed(extractor, `${chunk.section} ${chunk.title}. ${chunk.text}`),
        ),
      ).catch((error) => {
        this.policyEmbeddingsPromise = undefined;
        throw error;
      });
    }
    return this.policyEmbeddingsPromise;
  }

  private extractor(): Promise<any> {
    if (!this.extractorPromise) {
      this.extractorPromise = import('@huggingface/transformers').then(({ pipeline }) =>
        pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' }),
      );
    }
    return this.extractorPromise;
  }

  private lexicalRank(text: string): Array<{ chunk: EducationCodeChunk; score: number }> {
    const lower = text.toLowerCase();
    const words = new Set(lower.match(/[a-z]{3,}/g) ?? []);
    return EDUCATION_CODE.map((chunk) => {
      const terms = [
        ...new Set([...chunk.keywords, ...chunk.title.toLowerCase().split(/\W+/)].filter(Boolean)),
      ];
      const hits = terms.filter((term) => lower.includes(term) || words.has(term)).length;
      return { chunk, score: terms.length ? hits / terms.length : 0 };
    }).sort((a, b) => b.score - a.score);
  }

  private categories(text: string): string[] {
    const categories = [
      [/privacy|confidential|shared|student information/, 'Student privacy'],
      [/grade|assessment|test|record/, 'Assessment integrity'],
      [/discriminat|bias|unequal/, 'Nondiscrimination'],
      [/retaliat/, 'Retaliation'],
      [/threat|violence|weapon|harm|abuse|assault/, 'Student safety'],
      [/parent|family|meeting|communication|email/, 'Family communication'],
    ]
      .filter(([pattern]) => (pattern as RegExp).test(text))
      .map(([, label]) => label as string);
    return categories.length ? categories : ['Professional conduct'];
  }

  private summaryPhrase(categories: string[]): string {
    return categories.map((item) => item.toLowerCase()).join(' and ');
  }

  private reason(chunk: EducationCodeChunk, categories: string[]): string {
    return `The submission's ${categories.join(' / ').toLowerCase()} allegation overlaps with the cited requirements in ${chunk.section}.`;
  }

  private humanField(field: string): string {
    return (
      (
        {
          teacherName: 'the teacher name',
          school: 'the school',
          incidentDate: 'the incident date',
        } as Record<string, string>
      )[field] ?? field
    );
  }

  private dot(a: number[], b: number[]): number {
    const length = Math.min(a.length, b.length);
    let value = 0;
    for (let index = 0; index < length; index += 1) value += a[index] * b[index];
    return value;
  }
}
