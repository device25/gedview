import {describe, expect, it} from 'vitest';
import {langFit, localName, nameForms, pickVariant, variantsOf} from './lang';
import {mockTree} from './mock/mockTree';

describe('langFit', () => {
  it('matches exactly or by BCP 47 prefix, case-insensitively', () => {
    expect(langFit('ru', 'ru')).toBe(2);
    expect(langFit('RU', 'ru')).toBe(2);
    expect(langFit('en-US', 'en')).toBe(1);
    expect(langFit('en', 'en-GB')).toBe(1);
    expect(langFit('ru-Latn', 'ru')).toBe(1);
    expect(langFit('english', 'en')).toBe(0);
    expect(langFit('de', 'en')).toBe(0);
    expect(langFit(undefined, 'en')).toBe(0);
  });
});

describe('pickVariant', () => {
  const note = (lang?: string) => ({text: 'x', mime: 'text/plain', lang});

  it('keeps the original when it is already in the UI language', () => {
    const v = variantsOf(note('ru'), [note('en')]);
    expect(pickVariant(v, 'ru')).toBe(0);
  });

  it('takes the translation in the UI language', () => {
    const v = variantsOf(note('ru'), [note('de'), note('en')]);
    expect(pickVariant(v, 'en')).toBe(2);
  });

  it('prefers an exact match over a prefix match', () => {
    const v = variantsOf(note('ru'), [note('en-US'), note('en')]);
    expect(pickVariant(v, 'en')).toBe(2);
    expect(pickVariant(variantsOf(note('ru'), [note('en-US')]), 'en')).toBe(1);
  });

  it('falls back to the original when nothing fits', () => {
    const v = variantsOf(note('ru'), [note('de')]);
    expect(pickVariant(v, 'en')).toBe(0);
    expect(pickVariant(variantsOf(note(), []), 'en')).toBe(0);
  });

  it('uses the file language for an original without LANG', () => {
    const v = variantsOf(note(), [note('en')], 'ru');
    expect(v[0]?.lang).toBe('ru');
    expect(pickVariant(v, 'ru')).toBe(0);
    expect(pickVariant(v, 'en')).toBe(1);
  });
});

describe('names', () => {
  const ivan = mockTree.indis.get('I1')!;

  it('shows the NAME.TRAN form in the UI language', () => {
    expect(localName(ivan, 'ru')).toBe('Иван Петрович Соколов');
    expect(localName(ivan, 'en')).toBe('Ivan Petrovich Sokolov');
    expect(localName(ivan, 'de')).toBe('Иван Петрович Соколов');
  });

  it('keeps the original when the file language is the UI language', () => {
    expect(localName(ivan, 'en', 'en')).toBe('Иван Петрович Соколов');
  });

  it('lists the original first, then the translations', () => {
    const forms = nameForms(ivan.names[0]!, 'ru');
    expect(forms.map((f) => [f.lang, f.original])).toEqual([
      ['ru', true],
      ['en', false],
    ]);
  });
});
