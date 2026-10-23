// GEDCOM Age payloads: 7.0 `[< | >] 10y 2m 3w 1d` and the 5.5.1 phrases
// CHILD, INFANT, STILLBORN (which become `phrase`).

import type {ParsedAge} from './types';

const LEGACY_PHRASES = ['CHILD', 'INFANT', 'STILLBORN'];

const UNIT = {y: 'years', m: 'months', w: 'weeks', d: 'days'} as const;

/** Parses a duration; undefined when the text is not made of `<n>y/m/w/d`
 *  parts. `ordered` tells whether the units come in the grammar's order
 *  (years, months, weeks, days) — out-of-order input is still understood. */
function parseLoose(
  raw: string,
): {age: ParsedAge; ordered: boolean} | undefined {
  let text = raw.trim();
  const age: ParsedAge = {raw};
  if (text.startsWith('<') || text.startsWith('>')) {
    age.bound = text[0] as '<' | '>';
    text = text.slice(1).trim();
  }
  if (text === '') return age.bound ? undefined : {age, ordered: true};
  let lastUnit = -1;
  let ordered = true;
  for (const part of text.split(/\s+/)) {
    const m = /^(\d+)([ymwd])$/i.exec(part);
    if (!m) return undefined;
    const unit = m[2]!.toLowerCase() as keyof typeof UNIT;
    const order = 'ymwd'.indexOf(unit);
    const key = UNIT[unit];
    if (age[key] !== undefined) return undefined; // repeated unit
    if (order < lastUnit) ordered = false;
    lastUnit = order;
    age[key] = Number(m[1]);
  }
  return {age, ordered};
}

/** Parses an AGE payload. `phrase` is the AGE.PHRASE substructure. Never
 *  throws: a payload that is not an Age keeps `raw` and, without a PHRASE,
 *  becomes the phrase so that it can still be shown. */
export function parseAge(raw: string, phrase?: string): ParsedAge {
  const trimmed = raw.trim();
  if (LEGACY_PHRASES.includes(trimmed.toUpperCase())) {
    return {raw, phrase: phrase ?? trimmed};
  }
  const loose = parseLoose(raw);
  if (loose) {
    if (phrase) loose.age.phrase = phrase;
    return loose.age;
  }
  return {raw, phrase: phrase ?? (trimmed || undefined)};
}

/** True when `raw` is a well-formed Age payload (7.0 grammar or a 5.5.1
 *  phrase). */
export function isValidAge(raw: string): boolean {
  if (LEGACY_PHRASES.includes(raw.trim().toUpperCase())) return true;
  const loose = parseLoose(raw);
  return loose !== undefined && loose.ordered;
}
