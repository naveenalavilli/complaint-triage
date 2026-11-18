import { Injectable, signal } from '@angular/core';
import { EDUCATION_CODE } from '../data/sample-data';
import { CodeSuggestion, ComplaintCase, EducationCodeChunk, TriageResult } from '../models';

@Injectable({ providedIn: 'root' })
export class AiTriageService {
  readonly state = signal<'idle' | 'loading' | 'ready' | 'fallback' | 'error'>('idle');
  readonly progress = signal('');
  private extractorPromise?: Promise<any>;

  async triage(item: ComplaintCase): Promise<TriageResult> {
    this.state.set('loading');
    this.progress.set('Loading the free MiniLM model from Hugging Face…');
    const text = `${item.description}\n${item.extractedText ?? ''}`.trim();
    let ranked: Array<{ chunk: EducationCodeChunk; score: number }>;
    let model = 'Xenova/all-MiniLM-L6-v2 (browser, free)';

    try {
      ranked = await this.semanticRank(text);
      this.state.set('ready');
    } catch (error) {
      console.warn('Hugging Face model unavailable; using deterministic retrieval.', error);
      ranked = this.lexicalRank(text);
      model = 'Deterministic keyword retrieval fallback';
      this.state.set('fallback');
    }

    this.progress.set('Validating citations and risk rules…');
    const top = ranked.slice(0, 2);
    const lower = text.toLowerCase();
    const categories = this.categories(lower);
    const missingFields = [
      !item.teacherName ? 'teacherName' : '',
      !item.school ? 'school' : '',
      !item.incidentDate ? 'incidentDate' : '',
    ].filter(Boolean);
    const highRisk = /violence|weapon|abuse|assault|threat|self-harm|confidential|privacy|student information/.test(lower);
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
    const confidenceBase = top[0]?.score ?? 0.45;
    const confidence = Math.max(0.62, Math.min(0.96, 0.66 + confidenceBase * 0.28 - missingFields.length * 0.04));
    const primary = top[0]?.chunk;
    const summary = `${item.requesterName || 'The requester'} alleges ${this.summaryPhrase(categories)}. ${
      missingFields.length
        ? `The reviewer should obtain ${missingFields.map(this.humanField).join(', ')} before final routing.`
        : `The record is complete enough for a reviewer to compare the submission with ${primary?.section ?? 'the cited demo policy'}.`
    }`;
    this.progress.set('Draft ready for human review.');
    return {
      riskLevel,
      confidence: Math.round(confidence * 100) / 100,
      allegationCategories: categories,
      missingFields,
      aiSummary: summary,
      suggestedCodes: suggestions,
      recommendedTeam: primary?.team ?? 'District Support',
      model,
    };
  }

  private async semanticRank(text: string): Promise<Array<{ chunk: EducationCodeChunk; score: number }>> {
    const extractor = await this.extractor();
    const embed = async (value: string): Promise<number[]> => {
      const tensor = await extractor(value, { pooling: 'mean', normalize: true });
      const nested = tensor.tolist() as number[][];
      return Array.isArray(nested[0]) ? nested[0] : (nested as unknown as number[]);
    };
    const queryVector = await embed(text.slice(0, 4000));
    const ranked = [] as Array<{ chunk: EducationCodeChunk; score: number }>;
    for (let index = 0; index < EDUCATION_CODE.length; index += 1) {
      this.progress.set(`Comparing policy section ${index + 1} of ${EDUCATION_CODE.length}…`);
      const chunk = EDUCATION_CODE[index];
      const vector = await embed(`${chunk.section} ${chunk.title}. ${chunk.text}`);
      ranked.push({ chunk, score: this.dot(queryVector, vector) });
    }
    return ranked.sort((a, b) => b.score - a.score);
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
    const words = new Set(text.toLowerCase().match(/[a-z]{3,}/g) ?? []);
    return EDUCATION_CODE.map((chunk) => {
      const terms = [...chunk.keywords, ...chunk.title.toLowerCase().split(/\W+/)].filter(Boolean);
      const hits = terms.reduce((sum, term) => sum + (text.toLowerCase().includes(term) || words.has(term) ? 1 : 0), 0);
      return { chunk, score: Math.min(0.95, 0.35 + hits * 0.11) };
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
    return ({ teacherName: 'the teacher name', school: 'the school', incidentDate: 'the incident date' } as Record<string, string>)[field] ?? field;
  }

  private dot(a: number[], b: number[]): number {
    const length = Math.min(a.length, b.length);
    let value = 0;
    for (let index = 0; index < length; index += 1) value += a[index] * b[index];
    return value;
  }
}
