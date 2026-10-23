// Data checks for «Требует внимания»: each check lists the people it is
// about, with the fact that raised the question. Contradictions use only
// dates that are certain (approximate ones prove nothing); the other checks
// point at things worth a look and at gaps.

import {gregorianToJdn, julianToJdn} from '../gedcom/calendar';
import type {
  EventDetail,
  FamView,
  IndiView,
  LoadedTree,
  ParsedDate,
} from '../gedcom/types';
import {certainlyBefore, dateBounds, type Bounds} from './bounds';

export type CheckGroup = 'contradiction' | 'review' | 'gap';

export type CheckId =
  | 'birthAfterDeath'
  | 'eventBeforeBirth'
  | 'childAfterMother'
  | 'marriageAfterDeath'
  | 'challenged'
  | 'motherAge'
  | 'fatherDeath'
  | 'remarriage'
  | 'over110'
  | 'julianAfter1918'
  | 'noSources'
  | 'noBirthDate'
  | 'unconnected';

export const CHECK_GROUPS: Record<CheckId, CheckGroup> = {
  birthAfterDeath: 'contradiction',
  eventBeforeBirth: 'contradiction',
  childAfterMother: 'contradiction',
  marriageAfterDeath: 'contradiction',
  challenged: 'review',
  motherAge: 'review',
  fatherDeath: 'review',
  remarriage: 'review',
  over110: 'review',
  julianAfter1918: 'review',
  noSources: 'gap',
  noBirthDate: 'gap',
  unconnected: 'gap',
};

/** One person a check is about, and the facts involved (event tags, family
 *  ids) for the list to explain. */
export interface Finding {
  id: string;
  /** The events the finding compares, for the message. */
  events: Array<{who: string; tag: string; date?: ParsedDate}>;
}

export type CheckResults = Record<CheckId, Finding[]>;

const BIRTH = ['BIRT', 'CHR', 'BAPM'];
const DEATH = ['DEAT', 'BURI', 'CREM'];
/** Russia moved to the Gregorian calendar after 31 January 1918 (Julian). */
const SWITCH_JDN = julianToJdn(1918, 1, 31);

function event(indi: IndiView | undefined, tags: string[]) {
  if (!indi) return undefined;
  for (const tag of tags) {
    const e = indi.events.find((ev) => ev.tag === tag && ev.date);
    if (e) return e;
  }
  return undefined;
}

const bounds = (e?: EventDetail): Bounds | undefined => dateBounds(e?.date);

function partner(
  tree: LoadedTree,
  fam: FamView | undefined,
  pick: (i: IndiView, role: 'HUSB' | 'WIFE') => boolean,
): IndiView | undefined {
  for (const p of fam?.partners ?? []) {
    const i = p.indiId ? tree.indis.get(p.indiId) : undefined;
    if (i && pick(i, p.role)) return i;
  }
  return undefined;
}

const motherOf = (tree: LoadedTree, fam?: FamView) =>
  partner(
    tree,
    fam,
    (i, role) => i.sex === 'F' || (i.sex === undefined && role === 'WIFE'),
  );
const fatherOf = (tree: LoadedTree, fam?: FamView) =>
  partner(
    tree,
    fam,
    (i, role) => i.sex === 'M' || (i.sex === undefined && role === 'HUSB'),
  );

/** People outside the largest group connected by family links. */
function outsideMainPart(tree: LoadedTree): string[] {
  const links = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    links.set(a, [...(links.get(a) ?? []), b]);
    links.set(b, [...(links.get(b) ?? []), a]);
  };
  for (const fam of tree.fams.values()) {
    const members = [
      ...fam.partners.flatMap((p) => (p.indiId ? [p.indiId] : [])),
      ...fam.children.flatMap((c) => (c.indiId ? [c.indiId] : [])),
    ].filter((id) => tree.indis.has(id));
    for (let i = 1; i < members.length; i++) link(members[0]!, members[i]!);
  }
  const part = new Map<string, number>();
  const sizes: number[] = [];
  for (const start of tree.indis.keys()) {
    if (part.has(start)) continue;
    const n = sizes.length;
    let size = 0;
    const stack = [start];
    part.set(start, n);
    while (stack.length) {
      const id = stack.pop()!;
      size++;
      for (const next of links.get(id) ?? []) {
        if (!part.has(next)) {
          part.set(next, n);
          stack.push(next);
        }
      }
    }
    sizes.push(size);
  }
  if (sizes.length < 2) return [];
  const main = sizes.indexOf(Math.max(...sizes));
  return [...part].filter(([, n]) => n !== main).map(([id]) => id);
}

function hasCitation(indi: IndiView): boolean {
  return (
    indi.citations.length > 0 || indi.events.some((e) => e.citations.length > 0)
  );
}

/** Runs every check. `today` is a Julian Day Number (for «старше 110 лет»). */
export function runChecks(tree: LoadedTree, today: number): CheckResults {
  const out = Object.fromEntries(
    (Object.keys(CHECK_GROUPS) as CheckId[]).map((k) => [k, []]),
  ) as unknown as CheckResults;
  const add = (check: CheckId, f: Finding) => out[check].push(f);

  for (const indi of tree.indis.values()) {
    const birth = event(indi, ['BIRT']);
    const born = bounds(birth);
    const death = event(indi, DEATH);
    const died = bounds(death);

    if (certainlyBefore(died, born)) {
      add('birthAfterDeath', {
        id: indi.id,
        events: [
          {who: indi.id, tag: birth!.tag, date: birth!.date},
          {who: indi.id, tag: death!.tag, date: death!.date},
        ],
      });
    }
    // Any other event (a baptism, a census…) before the birth.
    const early = indi.events.find(
      (e) =>
        e !== birth &&
        e.tag !== 'BIRT' &&
        // A death before the birth is the check above.
        !DEATH.includes(e.tag) &&
        certainlyBefore(bounds(e), born),
    );
    if (early) {
      add('eventBeforeBirth', {
        id: indi.id,
        events: [
          {who: indi.id, tag: early.tag, date: early.date},
          {who: indi.id, tag: birth!.tag, date: birth!.date},
        ],
      });
    }

    for (const link of indi.famc) {
      const fam = tree.fams.get(link.famId);
      const mother = motherOf(tree, fam);
      const mDeath = event(mother, ['DEAT']);
      if (mother && certainlyBefore(bounds(mDeath), born)) {
        add('childAfterMother', {
          id: indi.id,
          events: [
            {who: indi.id, tag: birth!.tag, date: birth!.date},
            {who: mother.id, tag: 'DEAT', date: mDeath!.date},
          ],
        });
      }
      // The mother's age at the birth, from certain years only.
      const mBirth = bounds(event(mother, ['BIRT']));
      if (mother && born?.lo !== undefined && mBirth?.hi !== undefined) {
        const youngest = (born.lo - mBirth.hi) / 365.25;
        const oldest =
          born.hi !== undefined && mBirth.lo !== undefined
            ? (born.hi - mBirth.lo) / 365.25
            : undefined;
        if ((oldest !== undefined && oldest < 13) || youngest > 55) {
          add('motherAge', {
            id: indi.id,
            events: [
              {who: indi.id, tag: 'BIRT', date: birth!.date},
              {
                who: mother.id,
                tag: 'BIRT',
                date: event(mother, ['BIRT'])!.date,
              },
            ],
          });
        }
      }
      const father = fatherOf(tree, fam);
      const fDeath = bounds(event(father, ['DEAT']));
      if (
        father &&
        fDeath?.hi !== undefined &&
        born?.lo !== undefined &&
        born.lo > fDeath.hi + 280
      ) {
        add('fatherDeath', {
          id: indi.id,
          events: [
            {who: indi.id, tag: 'BIRT', date: birth!.date},
            {who: father.id, tag: 'DEAT', date: event(father, ['DEAT'])!.date},
          ],
        });
      }
      if (link.status === 'CHALLENGED')
        add('challenged', {id: indi.id, events: []});
    }

    // Marriages after a partner's death; a new marriage while the earlier
    // spouse lives and no divorce is recorded.
    const marriages = indi.fams
      .map((id) => tree.fams.get(id))
      .filter((f): f is FamView => !!f)
      .map((fam) => ({fam, marr: fam.events.find((e) => e.tag === 'MARR')}));
    for (const {marr} of marriages) {
      if (marr && certainlyBefore(died, bounds(marr))) {
        add('marriageAfterDeath', {
          id: indi.id,
          events: [
            {who: indi.id, tag: 'MARR', date: marr.date},
            {who: indi.id, tag: death!.tag, date: death!.date},
          ],
        });
      }
    }
    for (const a of marriages) {
      for (const b of marriages) {
        if (a === b || !a.marr || !b.marr) continue;
        if (!certainlyBefore(bounds(a.marr), bounds(b.marr))) continue;
        if (a.fam.events.some((e) => e.tag === 'DIV' || e.tag === 'ANUL'))
          continue;
        const spouse = partner(tree, a.fam, (i) => i.id !== indi.id);
        const sDeath = event(spouse, DEATH);
        if (spouse && certainlyBefore(bounds(b.marr), bounds(sDeath))) {
          add('remarriage', {
            id: indi.id,
            events: [
              {who: indi.id, tag: 'MARR', date: b.marr.date},
              {who: spouse.id, tag: sDeath!.tag, date: sDeath!.date},
            ],
          });
        }
      }
    }

    // Older than 110 with no death recorded.
    if (
      !indi.events.some((e) => DEATH.includes(e.tag)) &&
      born?.hi !== undefined &&
      today - born.hi > 110 * 365.25
    ) {
      add('over110', {
        id: indi.id,
        events: [{who: indi.id, tag: 'BIRT', date: birth!.date}],
      });
    }

    // A Julian date after Russia's switch.
    const julian = indi.events.find((e) => {
      const v = e.date?.value;
      const d = v?.kind === 'exact' ? v.date : undefined;
      if (d?.calendar !== 'JULIAN') return false;
      const b = dateBounds(e.date);
      return b?.lo !== undefined && b.lo > SWITCH_JDN;
    });
    if (julian) {
      add('julianAfter1918', {
        id: indi.id,
        events: [{who: indi.id, tag: julian.tag, date: julian.date}],
      });
    }

    if (!hasCitation(indi)) add('noSources', {id: indi.id, events: []});
    if (!event(indi, BIRTH)) add('noBirthDate', {id: indi.id, events: []});
  }
  for (const id of outsideMainPart(tree)) add('unconnected', {id, events: []});
  return out;
}

/** Today's Julian Day Number. */
export function todayJdn(now = new Date()): number {
  return gregorianToJdn(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Distinct places of the tree that have no coordinates. */
export function placesWithoutCoordinates(tree: LoadedTree): string[] {
  const all = new Map<string, boolean>();
  const visit = (events: EventDetail[]) => {
    for (const e of events) {
      if (!e.place?.raw) continue;
      const has =
        e.place.latitude !== undefined && e.place.longitude !== undefined;
      all.set(e.place.raw, (all.get(e.place.raw) ?? false) || has);
    }
  };
  for (const i of tree.indis.values()) visit(i.events);
  for (const f of tree.fams.values()) visit(f.events);
  return [...all].filter(([, has]) => !has).map(([raw]) => raw);
}
