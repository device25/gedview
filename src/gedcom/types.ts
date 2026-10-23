// Gedview data contracts between the GEDCOM parsing layer (src/gedcom),
// the model views (src/model) and the UI. Changing a type here needs the
// lead's review: every part of the app is written against this file.
//
// Principle: the raw node tree (GedcomNode) is the source of truth and keeps
// every structure, including unknown extensions. Everything else is a typed
// *view* over that tree, computed by pure functions. GEDCOM 5.5.1 files are
// normalised into the same tree shape on load (see ParseResult).

/** One GEDCOM line with its substructures. */
export interface GedcomNode {
  /** Tag as written, e.g. "INDI", "BIRT", "_FSFTID". */
  tag: string;
  /** Cross-reference id WITHOUT @, only on records ("I1"). */
  xref?: string;
  /** Line value. For pointers: the target id WITHOUT @, see `pointer`. */
  value?: string;
  /** True when `value` is a pointer (written as @ID@ in the file).
   *  For @VOID@ the value is VOID_POINTER and pointer is true. */
  pointer?: boolean;
  children: GedcomNode[];
  /** 1-based line number in the source file. */
  line: number;
}

// ---------------------------------------------------------------- file level

export type GedcomMajorVersion = '5' | '7' | 'unknown';

export interface GedcomVersion {
  /** HEAD.GEDC.VERS verbatim, e.g. "7.0", "7.0.18", "5.5.1". */
  raw?: string;
  major: GedcomMajorVersion;
}

export type ParseWarningCode =
  | 'CONC_IN_V7' // CONC is not allowed in 7.0; merged anyway
  | 'BAD_LINE' // line that does not match the grammar; skipped
  | 'LEVEL_JUMP' // level increases by more than one
  | 'UNDEFINED_XREF' // pointer to a record that does not exist
  | 'UNDOCUMENTED_EXTENSION' // _TAG without HEAD.SCHMA entry (allowed, informative)
  | 'BAD_DATE'
  | 'BAD_AGE'
  // Added after the first contract (additive):
  | 'TAB_DELIMITER' // tab used where a space delimiter belongs; tolerated
  | 'LEADING_WHITESPACE' // whitespace before the level; tolerated
  | 'DUPLICATE_XREF' // two records with the same id; the first one wins
  | 'NO_XREF' // INDI/FAM record without an id; it cannot be shown
  | 'ENCODING' // bytes were not UTF-8; decoded as windows-1252
  | 'TOO_MANY_WARNINGS'; // the list was cut; the message says how many

export interface ParseWarning {
  code: ParseWarningCode;
  /** 1-based line number in the source file, when known. */
  line?: number;
  message: string;
}

export interface ParseResult {
  version: GedcomVersion;
  /** Top-level records including HEAD and TRLR. CONT (and, leniently,
   *  CONC) are merged into `value` with "\n" and are NOT children; a leading
   *  "@@" is un-doubled. 5.5.1 is normalised to the same shape. */
  records: GedcomNode[];
  /** Records by xref id. */
  byId: Map<string, GedcomNode>;
  /** HEAD.SCHMA.TAG: extension tag -> URI. */
  schema: Map<string, string>;
  /** HEAD.PLAC.FORM split on ",", trimmed; [] when absent. */
  placeForm: string[];
  /** HEAD.LANG, if any (BCP 47). */
  language?: string;
  warnings: ParseWarning[];
}

/** `value` of a pointer node written as @VOID@ ("no record" in 7.0). */
export const VOID_POINTER = 'VOID';

// ---------------------------------------------------------------------- dates

/** Calendar keyword (7.0) or escape (5.5.1 @#D…@), normalised to 7.0 names.
 *  Extension calendars are kept as their _TAG. */
export type Calendar = 'GREGORIAN' | 'JULIAN' | 'FRENCH_R' | 'HEBREW' | string;

export interface CalendarDate {
  calendar: Calendar;
  year: number;
  /** Month tag as written: JAN…DEC, VEND…COMP, TSH…ELL, or an extension. */
  month?: string;
  /** 1-based month index within the calendar (1..12 / 1..13). */
  monthIndex?: number;
  day?: number;
  /** Year is Before Common Era. */
  bce: boolean;
  /** 5.5.1 dual year "1699/00" — the part after the slash, verbatim. */
  dualYear?: string;
  /** Extension epoch tag ("_EPOCH"); `bce` covers the standard BCE. */
  epoch?: string;
}

export type DateQualifier = 'ABT' | 'CAL' | 'EST';

export type DateValue =
  | {kind: 'exact'; date: CalendarDate; qualifier?: DateQualifier}
  | {
      kind: 'range';
      /** BET has both ends; BEF sets only `to`; AFT sets only `from`. */
      type: 'BET' | 'BEF' | 'AFT';
      from?: CalendarDate;
      to?: CalendarDate;
    }
  | {kind: 'period'; from?: CalendarDate; to?: CalendarDate} // FROM/TO
  | {kind: 'empty'} // DATE with no payload (7.0 allows it with PHRASE)
  | {kind: 'unparsed'}; // invalid text; shown verbatim

export interface ParsedDate {
  raw: string;
  value: DateValue;
  /** DATE.PHRASE (7.0) or 5.5.1 INT (…)/(…) text. */
  phrase?: string;
  /** DATE.TIME, verbatim. */
  time?: string;
}

/** Julian Day Number of a calendar date (for sorting and conversion);
 *  undefined when day/month are missing. */
export type ToJdn = (d: CalendarDate) => number | undefined;

// ----------------------------------------------------------------------- age

export interface ParsedAge {
  raw: string;
  /** '<' or '>' bound, if present. */
  bound?: '<' | '>';
  years?: number;
  months?: number;
  weeks?: number; // 7.0 only
  days?: number;
  phrase?: string; // AGE.PHRASE
}

// --------------------------------------------------------------------- names

export type NameType =
  | 'AKA'
  | 'BIRTH'
  | 'IMMIGRANT'
  | 'MAIDEN'
  | 'MARRIED'
  | 'PROFESSIONAL'
  | 'OTHER'
  | string; // 5.5.1 free text, normalised to upper case

export interface NamePieces {
  npfx?: string;
  givn?: string;
  nick?: string;
  spfx?: string;
  surn?: string;
  nsfx?: string;
}

export interface PersonName {
  /** NAME payload with slashes, verbatim. */
  raw: string;
  /** Display form: slashes removed, whitespace collapsed. */
  display: string;
  /** Text between slashes. */
  surname?: string;
  type?: NameType;
  typePhrase?: string;
  pieces: NamePieces;
  /** NAME.TRAN — each with its LANG. */
  translations: Array<{
    raw: string;
    display: string;
    lang?: string;
    pieces: NamePieces;
  }>;
  node: GedcomNode;
  /** NAME.SOUR and NAME.NOTE (additive; always set by the loader). */
  citations?: Citation[];
  notes?: NoteText[];
}

// ------------------------------------------------------- family links (FAMC)

export type Pedigree =
  'ADOPTED' | 'BIRTH' | 'FOSTER' | 'SEALING' | 'OTHER' | string;
export type ChildLinkStatus = 'CHALLENGED' | 'DISPROVEN' | 'PROVEN';

export interface ChildFamilyLink {
  famId: string; // without @
  pedigree?: Pedigree;
  pedigreePhrase?: string;
  status?: ChildLinkStatus; // FAMC.STAT
  statusPhrase?: string; // FAMC.STAT.PHRASE
  node: GedcomNode;
  /** FAMC.NOTE (additive). */
  notes?: NoteText[];
}

// ---------------------------------------------------------- associations

/** ROLE enumeration of 7.0 (plus extensions verbatim). */
export type Role =
  | 'CHIL'
  | 'CLERGY'
  | 'FATH'
  | 'FRIEND'
  | 'GODP'
  | 'HUSB'
  | 'MOTH'
  | 'MULTIPLE'
  | 'NGHBR'
  | 'OFFICIATOR'
  | 'PARENT'
  | 'SPOU'
  | 'WIFE'
  | 'WITN'
  | 'OTHER'
  | string;

export interface Association {
  /** Target individual id (without @); undefined for @VOID@. */
  indiId?: string;
  /** ASSO.PHRASE — the person's description when there is no record. */
  phrase?: string;
  role?: Role; // 5.5.1 RELA free text goes to rolePhrase, role undefined
  rolePhrase?: string;
  notes: NoteText[];
  citations: Citation[];
  node: GedcomNode;
}

// ------------------------------------------------------------------ sources

/** QUAY 0..3 as in GEDCOM 5.5.1/7.0. */
export type Quality = 0 | 1 | 2 | 3;

export interface Citation {
  /** SOUR record id; undefined for @VOID@ or 5.5.1 inline source. */
  sourceId?: string;
  /** Inline 5.5.1 source text, or 7.0 @VOID@ with PAGE only. */
  inlineText?: string;
  page?: string;
  quality?: Quality;
  data?: {date?: ParsedDate; texts: NoteText[]};
  event?: {type: string; phrase?: string; role?: Role; rolePhrase?: string};
  media: MediaLink[];
  notes: NoteText[];
  node: GedcomNode;
}

// -------------------------------------------------------------------- notes

export type NoteMime = 'text/plain' | 'text/html' | string;

export interface NoteText {
  text: string; // full text, CONT/CONC already joined
  mime: NoteMime; // default text/plain
  lang?: string;
  translations: Array<{text: string; mime: NoteMime; lang?: string}>;
  /** SNOTE record id when it came from a shared note. */
  sharedNoteId?: string;
  citations: Citation[];
}

// -------------------------------------------------------------------- media

export interface MediaFile {
  /** FILE payload verbatim (URL reference, may be relative / percent-encoded). */
  path: string;
  /** FILE.FORM — 7.0 MIME type; 5.5.1 extension word mapped to MIME when known. */
  mime?: string;
  /** FILE.FORM.MEDI (+ PHRASE). */
  medium?: string;
  mediumPhrase?: string;
  title?: string; // FILE.TITL
  /** FILE.TRAN — alternative versions of the file (e.g. thumbnails, transcripts). */
  translations: Array<{path: string; mime?: string}>;
}

/** Crop in percent of the image (7.0 CROP). */
export interface Crop {
  top?: number;
  left?: number;
  height?: number;
  width?: number;
}

export interface MediaLink {
  /** OBJE record id; undefined for 5.5.1 inline OBJE. */
  objectId?: string;
  files: MediaFile[];
  /** OBJE link TITL (overrides record title). */
  title?: string;
  crop?: Crop;
  restrictions: Restriction[];
}

// ---------------------------------------------------------------- places

export interface Place {
  raw: string;
  /** Jurisdictions as listed, smallest first. */
  parts: string[];
  /** PLAC.FORM if present, else HEAD.PLAC.FORM. */
  form: string[];
  lang?: string;
  translations: Array<{raw: string; parts: string[]; lang?: string}>;
  latitude?: number; // MAP.LATI, N positive
  longitude?: number; // MAP.LONG, E positive
  exids: ExternalId[];
  notes: NoteText[];
}

// ------------------------------------------------------- external ids

export interface ExternalId {
  value: string;
  /** EXID.TYPE URI; undefined is deprecated but allowed. */
  type?: string;
  /** Resolved from the GEDCOM-registries exid-types list, when known. */
  label?: string;
  /** Clickable URL built from the registry's pattern, when known. */
  url?: string;
}

/** 5.5.1 _FSFTID, _FIND, WWW, etc. may be mapped to ExternalId too. */

// -------------------------------------------------------- events, misc

export type Restriction = 'CONFIDENTIAL' | 'LOCKED' | 'PRIVACY';

export interface EventDetail {
  tag: string; // BIRT, BAPM, CHR, CENS, EVEN, FACT, …
  /** Payload: "Y" for occurred-unknown-details, or fact value. */
  value?: string;
  type?: string; // EVEN/FACT TYPE
  date?: ParsedDate;
  /** SDATE — use for ordering when present. */
  sortDate?: ParsedDate;
  place?: Place;
  age?: ParsedAge; // INDI event AGE / FAM event HUSB.AGE, WIFE.AGE
  husbandAge?: ParsedAge;
  wifeAge?: ParsedAge;
  cause?: string;
  agency?: string;
  religion?: string;
  associations: Association[];
  citations: Citation[];
  notes: NoteText[];
  media: MediaLink[];
  restrictions: Restriction[];
  uids: string[];
  node: GedcomNode;
  // --- additive fields (rarely needed; the raw `node` has everything) ---
  /** BIRT/CHR/ADOP FAMC: the family the event relates the child to. */
  famId?: string;
  /** ADOP.FAMC.ADOP: who adopted (HUSB, WIFE, BOTH). */
  adoptedBy?: string;
  /** ADDR, with line breaks. */
  address?: string;
  /** PHON, EMAIL, FAX, WWW in file order. */
  contacts?: Array<{kind: 'PHON' | 'EMAIL' | 'FAX' | 'WWW'; value: string}>;
  /** TEMP of a Latter-day Saint ordinance. */
  temple?: string;
  /** STAT of a Latter-day Saint ordinance. */
  status?: string;
}

/** INDI.NO / FAM.NO: an event that did NOT happen. */
export interface NonEvent {
  tag: string;
  date?: ParsedDate; // the period it did not happen in
  notes: NoteText[];
  citations: Citation[];
}

export interface IndiView {
  id: string;
  names: PersonName[];
  sex?: 'M' | 'F' | 'X' | 'U';
  famc: ChildFamilyLink[];
  fams: string[];
  events: EventDetail[]; // sorted by SDATE ?? DATE, stable
  nonEvents: NonEvent[];
  associations: Association[]; // INDI.ASSO
  citations: Citation[];
  notes: NoteText[];
  media: MediaLink[];
  exids: ExternalId[];
  uids: string[];
  restrictions: Restriction[];
  /** Extension structures (tag starting with "_") with SCHMA URI if declared. */
  extensions: Array<{tag: string; uri?: string; node: GedcomNode}>;
  /** The INDI record itself (additive; always set by the loader). */
  node?: GedcomNode;
}

// ------------------------------------------------------- loaded tree

/** A source the tree came from, for display only (no file names in logs). */
export type TreeSource = {kind: 'file' | 'url' | 'gedzip'; name: string};

/** Media files bundled with the tree (GEDZIP or picked alongside the .ged):
 *  FILE path as written in the GEDCOM (percent-decoded, case kept) -> blob URL. */
export type MediaMap = Map<string, string>;

/** What the loader hands to the UI. Produced by `loadTree()` in src/load. */
export interface LoadedTree {
  source: TreeSource;
  parse: ParseResult;
  media: MediaMap;
  indis: Map<string, IndiView>;
  fams: Map<string, FamView>;
  /** "famId|indiId" -> status, for chart link styling. */
  childLinkStatus: Map<string, {status: ChildLinkStatus; phrase?: string}>;
  /** SOUR records by id (additive; always set by the loader). */
  sources?: Map<string, SourceView>;
}

export interface FamView {
  id: string;
  /** HUSB / WIFE as written (7.0 does not imply sex). */
  partners: Array<{role: 'HUSB' | 'WIFE'; indiId?: string; phrase?: string}>;
  /** CHIL in file order, with CHIL.PHRASE. */
  children: Array<{indiId?: string; phrase?: string}>;
  events: EventDetail[];
  nonEvents: NonEvent[];
  associations: Association[];
  citations: Citation[];
  notes: NoteText[];
  media: MediaLink[];
  exids: ExternalId[];
  uids: string[];
  restrictions: Restriction[];
  /** Extension structures directly under the FAM (additive). */
  extensions?: Array<{tag: string; uri?: string; node: GedcomNode}>;
  node: GedcomNode;
}

/** A SOUR record, for the sources list and for resolving citations
 *  (additive; the loader fills LoadedTree.sources). */
export interface SourceView {
  id: string;
  title?: string;
  author?: string;
  abbreviation?: string;
  publication?: string;
  /** SOUR.TEXT: text from the source. */
  text?: NoteText;
  /** SOUR.DATA.AGNC. */
  agency?: string;
  /** SOUR.DATA.EVEN: what the source records, when and where. */
  events: Array<{types: string[]; date?: ParsedDate; place?: Place}>;
  repositories: Array<{
    repoId?: string;
    /** REPO.NAME. */
    name?: string;
    callNumbers: Array<{value: string; medium?: string}>;
    notes: NoteText[];
  }>;
  notes: NoteText[];
  media: MediaLink[];
  exids: ExternalId[];
  uids: string[];
  restrictions: Restriction[];
  node: GedcomNode;
}

// ------------------------------------------------- loader and chart API

export type LoadInput =
  /** One .ged/.gdz/.zip, or a .ged plus loose media files picked together. */
  | {kind: 'files'; files: File[]}
  /** Fetched by the browser directly (no proxy); .ged or .gdz. */
  | {kind: 'url'; url: string};

/** Implemented in src/load (part A). Throws LoadError. */
export type LoadTree = (
  input: LoadInput,
  signal?: AbortSignal,
) => Promise<LoadedTree>;

export type LoadErrorCode =
  | 'NOT_GEDCOM' // no HEAD / unreadable
  | 'NO_GEDCOM_IN_ZIP'
  | 'NETWORK' // fetch failed, incl. CORS
  | 'TOO_LARGE'
  | 'EMPTY'; // no INDI records

export interface LoadError extends Error {
  code: LoadErrorCode;
}

export type ChartView = 'hourglass' | 'relatives' | 'fancy';

/** How to show dates before the Gregorian switch (Russia: 1918). */
export type DateStyle = 'source' | 'both' | 'gregorian';

export interface ChartSettings {
  sexColors: boolean;
  showIds: boolean;
  /** Draw FAMC.STAT CHALLENGED links dashed. */
  dashChallenged: boolean;
  /** FAMC.STAT DISPROVEN links: not drawn, or drawn dotted. */
  disproven: 'hide' | 'dotted';
  dateStyle: DateStyle;
  /** Hide details of records/events with RESN CONFIDENTIAL or PRIVACY. */
  hideRestricted: boolean;
  /** Load http(s) media referenced by the file (contacts that host). */
  loadRemoteMedia: boolean;
}

/** Props of the chart component (part C). */
export interface ChartProps {
  tree: LoadedTree;
  view: ChartView;
  selectedId: string;
  onSelect: (indiId: string) => void;
  settings: ChartSettings;
  /** Zoom factor (1 = 100%), owned by the app store. */
  zoom: number;
  /** Reports zoom changes made inside the chart (wheel, pinch). */
  onZoomChange: (zoom: number) => void;
  /** Incremented to ask the chart to fit the whole tree into view. */
  fitRequest: number;
}
