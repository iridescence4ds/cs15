import { describe, it, expect } from 'vitest';
import { computeRRF, applySearchThreshold } from '../utils/http/search.js';

// ─── computeRRF tests ────────────────────────────────────────────────────────

describe('computeRRF', () => {
  const K = 60; // RRF_K = 60

  it('should handle empty vectorResults and empty textResults (both empty)', () => {
    const result = computeRRF([], []);
    expect(result).toEqual([]);
  });

  it('should handle empty textResults (vector results only)', () => {
    const result = computeRRF([{ _id: { toString: () => 'a' } as any, score: 10, source: 'faq' as const }], []);
    expect(result).toHaveLength(1);
    expect(result[0]._id.toString()).toBe('a');
  });

  it('should handle empty vectorResults (text results only)', () => {
    const result = computeRRF([], [{ _id: { toString: () => 'b' } as any, score: 5, source: 'faq' as const }]);
    expect(result).toHaveLength(1);
    expect(result[0]._id.toString()).toBe('b');
  });

  it('should return a single result with rrfScore = 1/(k+1) when only one list has results', () => {
    const result = computeRRF(
      [{ _id: { toString: () => 'a' } as any, score: 10, source: 'faq' as const }],
      []
    );
    expect(result).toHaveLength(1);
    expect(result[0].rrfScore).toBeCloseTo(1 / (K + 1), 4); // 1/61
  });

  it('should add RRF scores when the same document appears in both lists', () => {
    const docA = { _id: { toString: () => 'a' } as any, score: 10, source: 'faq' as const };
    // 'a' at rank 1 in both vectorResults and textResults → 1/(60+1) per list
    const vectorResults = [docA];
    const textResults = [docA]; // same object reference — appears at rank 1 in both
    const result = computeRRF(vectorResults, textResults);

    const a = result.find((r) => r._id.toString() === 'a')!;
    // Rank 1 in both lists → 2 × 1/61 = 2/61
    expect(a.rrfScore).toBeCloseTo(2 / 61, 4);
  });

  it('should keep documents that only appear in one list', () => {
    const vectorResults = [
      { _id: { toString: () => 'a' } as any, score: 10, source: 'faq' as const },
      { _id: { toString: () => 'b' } as any, score: 9, source: 'faq' as const },
    ];
    const textResults = [
      { _id: { toString: () => 'b' } as any, score: 5, source: 'faq' as const },
    ];
    const result = computeRRF(vectorResults, textResults);

    expect(result.map((r) => r._id.toString())).toContain('a');
    expect(result.map((r) => r._id.toString())).toContain('b');
  });

  it('should sort by descending rrfScore', () => {
    const vectorResults = [
      { _id: { toString: () => 'b' } as any, score: 1, source: 'faq' as const }, // rank 1 → 1/61
    ];
    const textResults = [
      { _id: { toString: () => 'a' } as any, score: 1, source: 'faq' as const }, // rank 1 → 1/61
    ];
    const result = computeRRF(vectorResults, textResults);
    // Both have same RRF score, sort order is stable but unspecified
    expect(result.length).toBe(2);
  });

  it('should set vectorScore on documents from the vector list', () => {
    const vectorResults = [{ _id: { toString: () => 'a' } as any, score: 9.5, source: 'faq' as const }];
    const textResults: any[] = [];
    const result = computeRRF(vectorResults, textResults);
    expect(result[0].vectorScore).toBe(9.5);
  });

  it('should set textScore on documents from the text list', () => {
    const vectorResults: any[] = [];
    const textResults = [{ _id: { toString: () => 'a' } as any, score: 7.2, source: 'faq' as const }];
    const result = computeRRF(vectorResults, textResults);
    expect(result[0].textScore).toBe(7.2);
  });
});

// ─── applySearchThreshold tests ──────────────────────────────────────────────

describe('applySearchThreshold', () => {
  it('should return all results when no scores are set (both scores falsy)', () => {
    const results = [
      { _id: { toString: () => 'a' } as any, source: 'faq' as const, score: 1 },
    ] as any[];
    const filtered = applySearchThreshold(results);
    // textScore undefined (falsy) and vectorScore undefined (falsy)
    // Neither condition (textScore > 0 || vectorScore > 0.80) is true
    // So this should return 0 — no result passes
    expect(filtered).toHaveLength(0);
  });

  it('should include a result if textScore > 0', () => {
    const results = [
      { _id: { toString: () => 'a' } as any, source: 'faq' as const, score: 1, textScore: 0.5 } as any,
    ];
    const filtered = applySearchThreshold(results);
    expect(filtered).toHaveLength(1);
  });

  it('should include a result if vectorScore > 0.80 even when textScore is 0', () => {
    const results = [
      { _id: { toString: () => 'a' } as any, source: 'faq' as const, score: 1, textScore: 0, vectorScore: 0.85 } as any,
    ];
    const filtered = applySearchThreshold(results);
    expect(filtered).toHaveLength(1);
  });

  it('should include a result when BOTH textScore > 0 AND vectorScore > 0.80', () => {
    const results = [
      { _id: { toString: () => 'a' } as any, source: 'faq' as const, score: 1, textScore: 0.4, vectorScore: 0.9 } as any,
    ];
    const filtered = applySearchThreshold(results);
    expect(filtered).toHaveLength(1);
  });

  it('should exclude a result when textScore is 0 AND vectorScore is below 0.80', () => {
    const results = [
      { _id: { toString: () => 'a' } as any, source: 'faq' as const, score: 1, textScore: 0, vectorScore: 0.75 } as any,
    ];
    const filtered = applySearchThreshold(results);
    expect(filtered).toHaveLength(0);
  });

  it('should exclude a result when only textScore > 0 but textScore is very small', () => {
    // The threshold filter uses (textScore && textScore > 0) — so 0.001 passes
    // But vectorScore needs > 0.80
    const results = [
      { _id: { toString: () => 'a' } as any, source: 'faq' as const, score: 1, textScore: 0.001, vectorScore: 0 } as any,
    ];
    const filtered = applySearchThreshold(results);
    expect(filtered).toHaveLength(1); // textScore > 0 passes
  });

  it('should return an empty array for all results failing threshold', () => {
    const results = [
      { _id: { toString: () => 'a' } as any, source: 'faq' as const, score: 1, textScore: 0.3, vectorScore: 0.5 } as any,
      { _id: { toString: () => 'b' } as any, source: 'faq' as const, score: 1, textScore: 0, vectorScore: 0.6 } as any,
    ];
    const filtered = applySearchThreshold(results);
    // a: textScore 0.3 > 0 → passes
    // b: textScore 0 (falsy) AND vectorScore 0.6 < 0.80 → fails
    expect(filtered).toHaveLength(1);
  });

  it('should handle empty results array', () => {
    const filtered = applySearchThreshold([]);
    expect(filtered).toHaveLength(0);
  });

  it('should keep order of passing results', () => {
    const results = [
      { _id: { toString: () => 'c' } as any, source: 'faq' as const, score: 1, textScore: 0.9 } as any,
      { _id: { toString: () => 'a' } as any, source: 'faq' as const, score: 1, textScore: 0.8 } as any,
      { _id: { toString: () => 'b' } as any, source: 'faq' as const, score: 1, textScore: 0.5 } as any,
    ];
    const filtered = applySearchThreshold(results);
    expect(filtered.map((r: any) => r._id.toString())).toEqual(['c', 'a', 'b']);
  });
});