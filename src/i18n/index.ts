import {createIntl, type IntlShape} from 'react-intl';

type Messages = Record<string, string>;

// Every src/i18n/<code>.json is a language: drop in a file to add one.
const files = import.meta.glob<Messages>('./*.json', {
  eager: true,
  import: 'default',
});

const byCode: Record<string, Messages> = {};
for (const [path, messages] of Object.entries(files)) {
  const code = /\.\/(.+)\.json$/.exec(path)?.[1];
  if (code) byCode[code] = messages;
}

export const FALLBACK_LANG = 'en';

const fallback = byCode[FALLBACK_LANG] ?? {};

export interface LanguageInfo {
  code: string;
  /** Name in the language itself. */
  name: string;
  /** Two-letter label for the rail button. */
  short: string;
  /** Share of English keys that this language translates, 0..1. */
  coverage: number;
}

/** Design order: Russian, English, then the others by code. */
const FIRST = ['ru', 'en'];
function byDesignOrder(a: {code: string}, b: {code: string}): number {
  const rank = (code: string) => {
    const i = FIRST.indexOf(code);
    return i < 0 ? FIRST.length : i;
  };
  return rank(a.code) - rank(b.code) || a.code.localeCompare(b.code);
}

export const languages: LanguageInfo[] = Object.entries(byCode)
  .map(([code, messages]) => {
    const keys = Object.keys(fallback);
    const done = keys.filter((k) => k in messages).length;
    return {
      code,
      name: messages['meta.name'] ?? code,
      short: messages['meta.short'] ?? code.toUpperCase(),
      coverage: keys.length ? done / keys.length : 1,
    };
  })
  .sort(byDesignOrder);

export const availableCodes = languages.map((l) => l.code);

export function isAvailable(code: string | null | undefined): code is string {
  return !!code && availableCodes.includes(code);
}

/** Picks the first browser language we have a translation for. */
export function detectLanguage(preferred: readonly string[]): string {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (isAvailable(base)) return base;
  }
  return FALLBACK_LANG;
}

/** Messages of a language with English filling the gaps. */
export function messagesFor(code: string): Messages {
  return {...fallback, ...byCode[code]};
}

export function getMessagesOf(code: string): Messages {
  return byCode[code] ?? {};
}

const intls = new Map<string, IntlShape>();

/** Non-React intl for helpers such as formatDate. */
export function getIntl(code: string): IntlShape {
  let intl = intls.get(code);
  if (!intl) {
    intl = createIntl({
      locale: code,
      defaultLocale: FALLBACK_LANG,
      messages: messagesFor(code),
      onError: () => {},
    });
    intls.set(code, intl);
  }
  return intl;
}
