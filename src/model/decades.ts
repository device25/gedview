// Card colour by decade of birth: the year shown on the card (birth, else
// christening; "about 1862" counts), placed on one scale for the whole
// file, so a person keeps their colour however the chart moves.

import type {ChartSettings, IndiView, LoadedTree} from '../gedcom/types';
import {yearOf} from './bounds';

const BIRTH = ['BIRT', 'CHR', 'BAPM'];

/** Stops of the scale, from the oldest decade to the youngest: CSS
 *  variables `--decade-0` … `--decade-7` (light and dark themes). */
export const DECADE_STOPS = 8;

const isRestricted = (r: readonly string[]) =>
  r.includes('CONFIDENTIAL') || r.includes('PRIVACY');

/** The birth year the card shows; none when it is hidden or unknown. */
export function birthYear(
  indi: IndiView,
  settings: Pick<ChartSettings, 'hideRestricted'>,
): number | undefined {
  if (settings.hideRestricted && isRestricted(indi.restrictions)) return;
  for (const tag of BIRTH) {
    const e = indi.events.find(
      (ev) =>
        ev.tag === tag &&
        ev.date &&
        !(settings.hideRestricted && isRestricted(ev.restrictions)),
    );
    const y = yearOf(e?.date);
    if (y !== undefined) return y;
  }
  return undefined;
}

export interface DecadeScale {
  /** First and last decade with a birth year, e.g. 1840 and 2020. */
  first: number;
  last: number;
}

export function decadeScale(
  tree: LoadedTree,
  settings: Pick<ChartSettings, 'hideRestricted'>,
): DecadeScale | undefined {
  let first = Infinity;
  let last = -Infinity;
  for (const indi of tree.indis.values()) {
    const y = birthYear(indi, settings);
    if (y === undefined) continue;
    const d = Math.floor(y / 10) * 10;
    first = Math.min(first, d);
    last = Math.max(last, d);
  }
  return Number.isFinite(first) ? {first, last} : undefined;
}

/** The card's fill for a birth year: a mix of the two nearest stops. */
export function decadeFill(year: number, scale: DecadeScale): string {
  const d = Math.floor(year / 10) * 10;
  const span = scale.last - scale.first;
  const at = span > 0 ? ((d - scale.first) / span) * (DECADE_STOPS - 1) : 0;
  const i = Math.min(DECADE_STOPS - 2, Math.floor(at));
  const share = Math.round((1 - (at - i)) * 100);
  return share >= 100
    ? `var(--decade-${i})`
    : share <= 0
      ? `var(--decade-${i + 1})`
      : `color-mix(in oklab, var(--decade-${i}) ${share}%, var(--decade-${i + 1}))`;
}
