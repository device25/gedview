import type {IndiView, PersonName} from '../gedcom/types';

/** How well a BCP 47 tag fits the UI language: 2 exact, 1 by prefix, 0 no. */
export function langFit(tag: string | undefined, ui: string): 0 | 1 | 2 {
  if (!tag) return 0;
  const a = tag.toLowerCase();
  const b = ui.toLowerCase();
  if (a === b) return 2;
  return a.startsWith(`${b}-`) || b.startsWith(`${a}-`) ? 1 : 0;
}

export interface Variant<T> {
  value: T;
  lang?: string;
  /** True for the text as written, false for a TRAN entry. */
  original: boolean;
}

/** The original first, then its translations in file order. */
export function variantsOf<T extends {lang?: string}>(
  original: T,
  translations: readonly T[],
  originalLang?: string,
): Array<Variant<T>> {
  return [
    {value: original, lang: original.lang ?? originalLang, original: true},
    ...translations.map((value) => ({
      value,
      lang: value.lang,
      original: false,
    })),
  ];
}

/**
 * Index of the variant to show first: the original when it already is in the
 * UI language, else the translation that fits the UI language best, else the
 * original.
 */
export function pickVariant(
  variants: ReadonlyArray<{lang?: string}>,
  ui: string,
): number {
  const first = variants[0];
  if (!first || langFit(first.lang, ui) > 0) return 0;
  let best = 0;
  let bestFit = 0;
  variants.forEach((v, i) => {
    const fit = langFit(v.lang, ui);
    if (i > 0 && fit > bestFit) {
      best = i;
      bestFit = fit;
    }
  });
  return best;
}

export interface NameForm {
  display: string;
  lang?: string;
  original: boolean;
}

/** All written forms of a NAME: the original, then NAME.TRAN entries. */
export function nameForms(name: PersonName, fileLang?: string): NameForm[] {
  return [
    {display: name.display, lang: fileLang, original: true},
    ...name.translations.map((t) => ({
      display: t.display,
      lang: t.lang,
      original: false,
    })),
  ];
}

/** Name of a person in the UI language when a NAME.TRAN provides it. */
export function localName(
  indi: IndiView | undefined,
  ui: string,
  fileLang?: string,
): string {
  const name = indi?.names[0];
  if (!name) return indi?.id ?? '';
  const forms = nameForms(name, fileLang);
  return forms[pickVariant(forms, ui)]?.display || name.display || indi.id;
}
