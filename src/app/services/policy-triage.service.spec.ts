import { EDUCATION_CODE, SAMPLE_CASES } from '../data/sample-data';
import { PolicyTriageService } from './policy-triage.service';

describe('PolicyTriageService', () => {
  let service: PolicyTriageService;

  beforeEach(() => {
    service = new PolicyTriageService();
  });

  it('reports the actual retrieval score and labels deterministic outputs honestly', async () => {
    spyOn(service as any, 'semanticRank').and.resolveTo([
      { chunk: EDUCATION_CODE[4], score: 0.89 },
      { chunk: EDUCATION_CODE[0], score: 0.52 },
    ]);

    const result = await service.triage({
      ...SAMPLE_CASES[0],
      description: 'A spreadsheet containing confidential student information was shared by email.',
    });

    expect(result.retrievalScore).toBe(0.89);
    expect(result.riskLevel).toBe('High');
    expect(result.allegationCategories).toContain('Student privacy');
    expect(result.suggestedCodes[0].sourceChunkId).toBe('demo-520');
    expect(result.retrievalMethod).toContain('MiniLM cosine similarity');
    expect((result as any).confidence).toBeUndefined();
  });

  it('uses transparent keyword overlap when MiniLM is unavailable', async () => {
    spyOn(service as any, 'semanticRank').and.callFake(async () => {
      throw new Error('offline');
    });

    const result = await service.triage({
      ...SAMPLE_CASES[0],
      description:
        'The family sent repeated emails requesting a parent meeting and received no response.',
    });

    expect(result.retrievalMethod).toBe('Deterministic keyword-overlap fallback');
    expect(result.retrievalScore).toBeGreaterThan(0);
    expect(result.allegationCategories).toContain('Family communication');
    expect(result.suggestedCodes[0].sourceChunkId).toBe('demo-412');
  });

  it('embeds bundled policy sections once and reuses them across triage runs', async () => {
    const extractor = jasmine.createSpy('extractor').and.callFake(async () => ({
      tolist: () => [[1, 0]],
    }));
    spyOn(service as any, 'extractor').and.resolveTo(extractor);

    await (service as any).semanticRank('first complaint');
    await (service as any).semanticRank('second complaint');

    expect(extractor).toHaveBeenCalledTimes(EDUCATION_CODE.length + 2);
  });
});
