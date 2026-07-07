import { describe, it, expect } from 'vitest';
import { requiredJavaMajor } from '../src/main/java';

describe('requiredJavaMajor', () => {
  it.each([
    ['1.12.2', 8],
    ['1.16.5', 8],
    ['1.17', 17],
    ['1.18.2', 17],
    ['1.20.1', 17],
    ['1.20.4', 17],
    ['1.20.5', 21],
    ['1.21', 21],
    ['1.21.4', 21],
    ['25.1', 21],
    ['26.2', 25],
    ['27.1', 25]
  ])('%s → Java %i', (mc, major) => {
    expect(requiredJavaMajor(mc)).toBe(major);
  });
});
