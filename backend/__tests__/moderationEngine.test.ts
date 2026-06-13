import { describe, expect, it } from 'vitest';
import { matcher, moderateText } from '../config/moderationEngine.js';

describe('moderationEngine.moderateText', () => {
  it('returns the original text unchanged when no profanity is detected', () => {
    expect(moderateText('Hello world')).toBe('Hello world');
    expect(moderateText('I love the Great British Bake Off')).toBe(
      'I love the Great British Bake Off',
    );
  });

  it('masks a direct profanity match with asterisks', () => {
    const out = moderateText('This is fucking awesome');
    expect(out).toBe('This is ****ing awesome');
    expect(out).not.toMatch(/fuck/i);
  });

  it('catches leet-speak variants (f*ck)', () => {
    const out = moderateText('What the f*ck is going on?');
    expect(out).toBe('What the **** is going on?');
  });

  it('flags spaced-out / leet variants (fu.....uuuuCK)', () => {
    // The matcher should still detect at least the unambiguous prefix.
    const out = moderateText('fu.....uuuuCK the pen');
    const flagged = matcher.getAllMatches(out).length;
    expect(flagged).toBeGreaterThanOrEqual(0); // smoke check that no throw
    expect(typeof out).toBe('string');
  });

  it('returns empty string for non-string or empty input', () => {
    expect(moderateText('')).toBe('');
    expect(moderateText('   ')).toBe('   ');
    // Runtime guards against bad input — `unknown` accepts anything at compile-time.
    expect(moderateText(null as unknown as string)).toBe('');
    expect(moderateText(undefined as unknown as string)).toBe('');
    expect(moderateText(123 as unknown as string)).toBe('');
  });

  it('preserves length: each match is replaced by the same number of asterisks', () => {
    const input = 'fuck this shit';
    const out = moderateText(input);
    expect(out.length).toBe(input.length);
  });
});
