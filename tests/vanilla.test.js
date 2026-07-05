import { describe, it, expect } from 'vitest';
import { parseReleases } from '../src/main/vanilla';

describe('parseReleases', () => {
  it('оставляет только релизы и находит последний', () => {
    const data = {
      latest: { release: '1.21.4', snapshot: '25w01a' },
      versions: [
        { id: '25w01a', type: 'snapshot' },
        { id: '1.21.4', type: 'release' },
        { id: '1.21.3', type: 'release' },
        { id: '24w40a', type: 'snapshot' },
        { id: '1.20.1', type: 'release' }
      ]
    };
    expect(parseReleases(data)).toEqual({
      latest: '1.21.4',
      releases: ['1.21.4', '1.21.3', '1.20.1']
    });
  });
  it('не падает на пустых данных', () => {
    expect(parseReleases({})).toEqual({ latest: null, releases: [] });
  });
});
