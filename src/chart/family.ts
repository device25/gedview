// What the chart writes under a couple (the family box) and which of a
// person's marriages a box is.

import type {EventDetail, FamView, IndiView, LoadedTree} from '../gedcom/types';
import {displayName, formatDate, formatPlace, yearOnly} from '../ui/format';
import type {RendererContext} from './renderer';

export interface FamilyBox {
  /** First line, after the ⚭ sign when `married`. */
  line1: string;
  line2?: string;
  /** The ⚭ sign goes before line 1 (a marriage record exists). */
  married: boolean;
  /** Spoken form of the whole box. */
  label: string;
}

const isRestricted = (r: readonly string[]) =>
  r.includes('CONFIDENTIAL') || r.includes('PRIVACY');

/** Smallest jurisdiction of a place: «Старица» of «Старица, Тверская губерния». */
function shortPlace(e: EventDetail | undefined): string {
  if (!e?.place) return '';
  return formatPlace(e.place).split(', ')[0] ?? '';
}

/**
 * The family box: «⚭ 1912» with the place under it; a divorce or an
 * annulment in words on the second line; «Помолвка 1907» or «Не в браке»
 * when there is no marriage record. Nothing when the file says nothing.
 */
export function familyBox(
  ctx: Pick<RendererContext, 'tree' | 'settings' | 'intl'>,
  famId: string,
): FamilyBox | undefined {
  const {tree, settings, intl} = ctx;
  const fam = tree.fams.get(famId);
  if (!fam) return undefined;
  if (settings.hideRestricted && isRestricted(fam.restrictions))
    return undefined;
  const events = settings.hideRestricted
    ? fam.events.filter((e) => !isRestricted(e.restrictions))
    : fam.events;
  const o = {locale: intl.locale, style: settings.dateStyle};
  const year = (e: EventDetail | undefined) => formatDate(yearOnly(e?.date), o);
  const t = (id: string, values?: Record<string, string>) =>
    intl.formatMessage({id}, values);
  const marr = events.find((e) => e.tag === 'MARR');
  const div = events.find((e) => e.tag === 'DIV');
  const anul = events.find((e) => e.tag === 'ANUL');
  const enga = events.find((e) => e.tag === 'ENGA');
  const names = partnerNames(tree, fam, intl.locale);

  let box: Omit<FamilyBox, 'label'> | undefined;
  const ended = div
    ? t('family.divorce', {year: year(div)}).trim()
    : anul
      ? t('family.annulled', {year: year(anul)}).trim()
      : undefined;
  if (marr) {
    const when = year(marr) || t('family.marriage');
    const where = shortPlace(marr);
    box = ended
      ? {married: true, line1: where ? `${when}, ${where}` : when, line2: ended}
      : {married: true, line1: when, ...(where ? {line2: where} : {})};
  } else if (ended) {
    box = {married: false, line1: ended};
  } else if (enga) {
    box = {
      married: false,
      line1: t('family.engaged', {year: year(enga)}).trim(),
    };
  } else if (fam.nonEvents.some((n) => n.tag === 'MARR')) {
    box = {married: false, line1: t('family.notMarried')};
  }
  if (!box) return undefined;
  const text = [box.line1, box.line2].filter(Boolean).join(', ');
  const label = box.married
    ? t('family.label', {names, text})
    : t('family.labelOther', {names, text});
  return {...box, label};
}

function partnerNames(tree: LoadedTree, fam: FamView, locale: string): string {
  const names = fam.partners.flatMap((p) =>
    p.indiId ? [displayName(tree.indis.get(p.indiId), p.indiId)] : [],
  );
  return new Intl.ListFormat(locale, {type: 'conjunction'}).format(names);
}

/** Year of a family's marriage, for ordering; undefined when unknown. */
function marriageYear(fam: FamView | undefined): number | undefined {
  const v = fam?.events.find((e) => e.tag === 'MARR')?.date?.value;
  if (!v) return undefined;
  if (v.kind === 'exact') return v.date.year;
  if (v.kind === 'range' || v.kind === 'period') return (v.from ?? v.to)?.year;
  return undefined;
}

/**
 * Which marriage of the person `famId` is (1-based), counting only the
 * families that are drawn; undefined when the person has one. Dated
 * marriages are ordered by year; undated ones keep the file's order.
 */
export function marriageOrder(
  tree: LoadedTree,
  indi: IndiView,
  famId: string,
  drawn: (famId: string) => boolean,
): number | undefined {
  const fams = indi.fams.filter((f) => tree.fams.has(f) && drawn(f));
  if (fams.length < 2) return undefined;
  const sorted = fams
    .map((id, i) => ({id, i, y: marriageYear(tree.fams.get(id))}))
    .sort((a, b) =>
      a.y !== undefined && b.y !== undefined
        ? a.y - b.y || a.i - b.i
        : a.i - b.i,
    );
  const n = sorted.findIndex((f) => f.id === famId);
  return n < 0 ? undefined : n + 1;
}
