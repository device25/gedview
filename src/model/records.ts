// Record views: IndiView, FamView, SourceView, and the whole-file builder.

import {child, childValue, children, pointerId} from '../gedcom/nodes';
import type {
  ChildFamilyLink,
  ChildLinkStatus,
  FamView,
  GedcomNode,
  IndiView,
  ParseResult,
  SourceView,
} from '../gedcom/types';
import {createContext, record, type ModelContext} from './context';
import {eventsOf, FAM_EVENT_TAGS, INDI_EVENT_TAGS, nonEventsOf} from './events';
import {nameOf} from './names';
import {
  associationsOf,
  citationsOf,
  dateOf,
  exidsOf,
  mediaLinksOf,
  notesOf,
  placeOf,
  restrictionsOf,
  uidsOf,
} from './structures';

const SEX_VALUES = ['M', 'F', 'X', 'U'] as const;
const CHILD_STATUS: readonly string[] = ['CHALLENGED', 'DISPROVEN', 'PROVEN'];

function extensionsOf(ctx: ModelContext, node: GedcomNode) {
  return node.children
    .filter((c) => c.tag.startsWith('_'))
    .map((c) => {
      const uri = ctx.parse.schema.get(c.tag);
      return uri === undefined
        ? {tag: c.tag, node: c}
        : {tag: c.tag, uri, node: c};
    });
}

function familyLinkOf(
  ctx: ModelContext,
  node: GedcomNode,
): ChildFamilyLink | undefined {
  const famId = pointerId(node);
  if (famId === undefined || !record(ctx, famId, 'FAM')) return undefined;
  const link: ChildFamilyLink = {famId, node, notes: notesOf(ctx, node)};
  const pedi = child(node, 'PEDI');
  if (pedi?.value) {
    link.pedigree = pedi.value.trim().toUpperCase();
    const phrase = childValue(pedi, 'PHRASE');
    if (phrase) link.pedigreePhrase = phrase;
  }
  const stat = child(node, 'STAT');
  if (stat?.value) {
    const status = stat.value.trim().toUpperCase();
    if (CHILD_STATUS.includes(status)) link.status = status as ChildLinkStatus;
    const phrase = childValue(stat, 'PHRASE');
    if (phrase) link.statusPhrase = phrase;
  }
  return link;
}

/** View of one INDI record. Links to families are as written in the INDI;
 *  buildViews() completes them from the FAM side. */
export function indiViewOf(ctx: ModelContext, node: GedcomNode): IndiView {
  const sex = childValue(node, 'SEX')?.trim().toUpperCase();
  const view: IndiView = {
    id: node.xref!,
    names: children(node, 'NAME').map((n) => nameOf(ctx, n)),
    famc: children(node, 'FAMC').flatMap((n) => familyLinkOf(ctx, n) ?? []),
    fams: children(node, 'FAMS')
      .map((n) => pointerId(n))
      .filter(
        (id): id is string => id !== undefined && !!record(ctx, id, 'FAM'),
      ),
    events: eventsOf(ctx, node, INDI_EVENT_TAGS),
    nonEvents: nonEventsOf(ctx, node),
    associations: associationsOf(ctx, node),
    citations: citationsOf(ctx, node),
    notes: notesOf(ctx, node),
    media: mediaLinksOf(ctx, node),
    exids: exidsOf(ctx, node),
    uids: uidsOf(node),
    restrictions: restrictionsOf(node),
    extensions: extensionsOf(ctx, node),
    node,
  };
  if (sex && (SEX_VALUES as readonly string[]).includes(sex)) {
    view.sex = sex as IndiView['sex'];
  }
  view.fams = [...new Set(view.fams)];
  return view;
}

/** View of one FAM record. */
export function famViewOf(ctx: ModelContext, node: GedcomNode): FamView {
  const partners: FamView['partners'] = [];
  for (const role of ['HUSB', 'WIFE'] as const) {
    const n = child(node, role);
    if (!n) continue;
    const id = pointerId(n);
    const p: FamView['partners'][number] = {role};
    if (id !== undefined && record(ctx, id, 'INDI')) p.indiId = id;
    const phrase = childValue(n, 'PHRASE');
    if (phrase) p.phrase = phrase;
    partners.push(p);
  }
  return {
    id: node.xref!,
    partners,
    children: children(node, 'CHIL').map((n) => {
      const id = pointerId(n);
      const c: FamView['children'][number] = {};
      if (id !== undefined && record(ctx, id, 'INDI')) c.indiId = id;
      const phrase = childValue(n, 'PHRASE');
      if (phrase) c.phrase = phrase;
      return c;
    }),
    events: eventsOf(ctx, node, FAM_EVENT_TAGS),
    nonEvents: nonEventsOf(ctx, node),
    associations: associationsOf(ctx, node),
    citations: citationsOf(ctx, node),
    notes: notesOf(ctx, node),
    media: mediaLinksOf(ctx, node),
    exids: exidsOf(ctx, node),
    uids: uidsOf(node),
    restrictions: restrictionsOf(node),
    extensions: extensionsOf(ctx, node),
    node,
  };
}

/** View of one SOUR record. */
export function sourceViewOf(ctx: ModelContext, node: GedcomNode): SourceView {
  const view: SourceView = {
    id: node.xref!,
    events: [],
    repositories: [],
    notes: notesOf(ctx, node),
    media: mediaLinksOf(ctx, node),
    exids: exidsOf(ctx, node),
    uids: uidsOf(node),
    restrictions: restrictionsOf(node),
    node,
  };
  for (const [tag, key] of [
    ['TITL', 'title'],
    ['AUTH', 'author'],
    ['ABBR', 'abbreviation'],
    ['PUBL', 'publication'],
  ] as const) {
    const v = childValue(node, tag);
    if (v) view[key] = v;
  }
  const text = child(node, 'TEXT');
  if (text) {
    view.text = {
      text: text.value ?? '',
      mime: childValue(text, 'MIME') || 'text/plain',
      translations: [],
      citations: [],
    };
    const lang = childValue(text, 'LANG');
    if (lang) view.text.lang = lang;
  }
  const data = child(node, 'DATA');
  if (data) {
    const agency = childValue(data, 'AGNC');
    if (agency) view.agency = agency;
    for (const even of children(data, 'EVEN')) {
      const entry: SourceView['events'][number] = {
        types: (even.value ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      };
      const date = dateOf(child(even, 'DATE'));
      if (date) entry.date = date;
      const plac = child(even, 'PLAC');
      if (plac) entry.place = placeOf(ctx, plac);
      view.events.push(entry);
    }
    view.notes.push(...notesOf(ctx, data));
  }
  for (const repo of children(node, 'REPO')) {
    const id = pointerId(repo);
    const rec = record(ctx, id, 'REPO');
    const entry: SourceView['repositories'][number] = {
      callNumbers: children(repo, 'CALN')
        .filter((c) => c.value)
        .map((c) => {
          const call: SourceView['repositories'][number]['callNumbers'][number] =
            {
              value: c.value!,
            };
          const medi = child(c, 'MEDI');
          if (medi?.value) call.medium = medi.value.trim().toUpperCase();
          return call;
        }),
      notes: notesOf(ctx, repo),
    };
    if (id !== undefined && rec) {
      entry.repoId = id;
      const name = childValue(rec, 'NAME');
      if (name) entry.name = name;
      const address = addressOf(child(rec, 'ADDR'));
      if (address) entry.address = address;
      const websites = children(rec, 'WWW')
        .map((w) => w.value?.trim())
        .filter((w): w is string => !!w);
      if (websites.length) entry.websites = websites;
      const repoNotes = notesOf(ctx, rec);
      if (repoNotes.length) entry.repoNotes = repoNotes;
    }
    view.repositories.push(entry);
  }
  return view;
}

export interface BuiltViews {
  indis: Map<string, IndiView>;
  fams: Map<string, FamView>;
  sources: Map<string, SourceView>;
  /** "famId|indiId" -> status, for links that carry FAMC.STAT. */
  childLinkStatus: Map<string, {status: ChildLinkStatus; phrase?: string}>;
}

/** Builds the views of every INDI, FAM and SOUR record and makes the links
 *  between persons and families agree from both sides (a CHIL without the
 *  child's FAMC, a FAMS without HUSB/WIFE, ...). */
export function buildViews(parse: ParseResult): BuiltViews {
  const ctx = createContext(parse);
  const indis = new Map<string, IndiView>();
  const fams = new Map<string, FamView>();
  const sources = new Map<string, SourceView>();

  for (const rec of parse.records) {
    if (rec.xref === undefined) continue;
    if (rec.tag === 'INDI') indis.set(rec.xref, indiViewOf(ctx, rec));
    else if (rec.tag === 'FAM') fams.set(rec.xref, famViewOf(ctx, rec));
    else if (rec.tag === 'SOUR') sources.set(rec.xref, sourceViewOf(ctx, rec));
  }

  for (const fam of fams.values()) {
    for (const p of fam.partners) {
      const indi = p.indiId ? indis.get(p.indiId) : undefined;
      if (indi && !indi.fams.includes(fam.id)) indi.fams.push(fam.id);
    }
    for (const [i, c] of fam.children.entries()) {
      const indi = c.indiId ? indis.get(c.indiId) : undefined;
      if (indi && !indi.famc.some((l) => l.famId === fam.id)) {
        const chilNode = children(fam.node, 'CHIL')[i]!;
        indi.famc.push({famId: fam.id, node: chilNode});
      }
    }
  }

  const childLinkStatus: BuiltViews['childLinkStatus'] = new Map();
  // Pairs (family, child) that have at least one link that is not DISPROVEN.
  const live = new Set<string>();
  for (const indi of indis.values()) {
    for (const link of indi.famc) {
      if (link.status !== 'DISPROVEN') live.add(`${link.famId}|${indi.id}`);
    }
  }
  for (const indi of indis.values()) {
    for (const link of indi.famc) {
      const fam = fams.get(link.famId)!;
      // A disproven link is deliberately not listed among the children.
      if (
        link.status !== 'DISPROVEN' &&
        !fam.children.some((c) => c.indiId === indi.id)
      ) {
        fam.children.push({indiId: indi.id});
      }
      const key = `${fam.id}|${indi.id}`;
      // Two links to the same family: a disproven one does not outweigh
      // another one.
      if (link.status && !(link.status === 'DISPROVEN' && live.has(key))) {
        if (!childLinkStatus.has(key)) {
          const entry: {status: ChildLinkStatus; phrase?: string} = {
            status: link.status,
          };
          if (link.statusPhrase) entry.phrase = link.statusPhrase;
          childLinkStatus.set(key, entry);
        }
      }
    }
  }
  return {indis, fams, sources, childLinkStatus};
}

/** An ADDR as one text: its own lines, then ADR1–3, CITY, STAE, POST, CTRY
 *  that are not already written in it. */
function addressOf(addr: GedcomNode | undefined): string | undefined {
  if (!addr) return undefined;
  const lines = (addr.value ?? '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const tag of ['ADR1', 'ADR2', 'ADR3', 'CITY', 'STAE', 'POST', 'CTRY']) {
    const v = childValue(addr, tag)?.trim();
    if (v && !lines.some((l) => l.includes(v))) lines.push(v);
  }
  return lines.length ? lines.join(', ') : undefined;
}
