import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const FIXTURES = join(import.meta.dirname, '../../tests/fixtures/gedcom70');

describe('official FamilySearch fixtures', () => {
  it('are downloaded by `npm run fixtures`', () => {
    const text = readFileSync(join(FIXTURES, 'maximal70.ged'), 'utf8');
    const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    expect(body.startsWith('0 HEAD')).toBe(true);
  });
});
