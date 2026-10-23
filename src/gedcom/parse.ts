// GEDCOM line parser: text -> record tree (ParseResult), for FamilySearch
// GEDCOM 7.0 and 5.5.x. Never throws on bad input; problems become
// ParseWarnings.

import {isValidAge} from './age';
import {parseDate} from './date';
import {child, children, splitList, walk} from './nodes';
import type {
  GedcomMajorVersion,
  GedcomNode,
  GedcomVersion,
  ParseResult,
  ParseWarning,
  ParseWarningCode,
} from './types';
import {VOID_POINTER} from './types';

/** Deepest nesting accepted. Real files stay below 10; the cap keeps the
 *  recursive model code safe against hostile input. */
const MAX_LEVEL = 64;
/** Warnings kept; the rest are summarised in one final warning. */
const MAX_WARNINGS = 2000;

interface RawLine {
  level: number;
  xref?: string;
  tag: string;
  /** Value exactly as written after the single delimiter. */
  value?: string;
  line: number;
}

const LINE_RE =
  /^([ \t\u00a0]*)(\d+)([ \t]+)(?:@([^@\s]+)@([ \t]+))?([A-Za-z0-9_]+)(?:([ \t])(.*))?$/s;

/** `@ID@` that is not a 5.5.1 date escape such as @#DJULIAN@. */
const POINTER_RE = /^@([^@\s#][^@\s]*)@$/;

export function versionOf(raw: string | undefined): GedcomVersion {
  const m = raw && /^\s*(\d+)/.exec(raw);
  const major: GedcomMajorVersion = m
    ? m[1] === '7'
      ? '7'
      : m[1] === '5'
        ? '5'
        : 'unknown'
    : 'unknown';
  return raw === undefined ? {major} : {raw, major};
}

class Warnings {
  readonly list: ParseWarning[] = [];
  private suppressed = 0;

  add(code: ParseWarningCode, line: number | undefined, message: string) {
    if (this.list.length >= MAX_WARNINGS) {
      this.suppressed++;
      return;
    }
    this.list.push(
      line === undefined ? {code, message} : {code, line, message},
    );
  }

  /** Warnings in file order (those without a line last). */
  finish(): ParseWarning[] {
    const at = (w: ParseWarning) => w.line ?? Number.MAX_SAFE_INTEGER;
    this.list.sort((a, b) => at(a) - at(b));
    if (this.suppressed > 0) {
      this.list.push({
        code: 'TOO_MANY_WARNINGS',
        message: `${this.suppressed} more warnings are not listed`,
      });
    }
    return this.list;
  }
}

/** Splits text into lines, drops what is not a GEDCOM line. */
function tokenise(text: string, warnings: Warnings): RawLine[] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines: RawLine[] = [];
  const source = body.split(/\r\n|\r|\n/);
  for (let i = 0; i < source.length; i++) {
    const lineNo = i + 1;
    const text = source[i]!;
    if (text.trim() === '') continue;
    const m = LINE_RE.exec(text);
    if (!m) {
      warnings.add('BAD_LINE', lineNo, `Not a GEDCOM line: ${clip(text)}`);
      continue;
    }
    const level = Number(m[2]);
    if (level > MAX_LEVEL) {
      warnings.add(
        'BAD_LINE',
        lineNo,
        `Level ${level} is too deep; line skipped`,
      );
      continue;
    }
    if (m[1]) {
      warnings.add('LEADING_WHITESPACE', lineNo, 'Whitespace before the level');
    }
    if (m[3]!.includes('\t') || m[5]?.includes('\t') || m[7] === '\t') {
      warnings.add('TAB_DELIMITER', lineNo, 'Tab used as a delimiter');
    }
    const line: RawLine = {level, tag: m[6]!, line: lineNo};
    if (m[4] !== undefined) line.xref = m[4];
    if (m[8] !== undefined) line.value = m[8];
    lines.push(line);
  }
  return lines;
}

function clip(text: string): string {
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

/** HEAD.GEDC.VERS, found on the raw lines because the rules for the rest of
 *  the file depend on it. */
function findVersion(lines: RawLine[]): GedcomVersion {
  let inHead = false;
  let inGedc = false;
  let hasLegacyHeader = false;
  for (const l of lines) {
    if (l.level === 0) {
      if (inHead) break; // end of HEAD without a version
      inHead = l.tag === 'HEAD';
      inGedc = false;
    } else if (inHead) {
      if (l.level === 1) {
        inGedc = l.tag === 'GEDC';
        if (l.tag === 'CHAR') hasLegacyHeader = true;
      } else if (l.level === 2 && inGedc) {
        if (l.tag === 'VERS' && l.value !== undefined) {
          return versionOf(l.value.trim());
        }
        if (l.tag === 'FORM') hasLegacyHeader = true;
      }
    }
  }
  // No version, but the header has 5.x-only structures.
  return hasLegacyHeader ? {major: '5'} : {major: 'unknown'};
}

function unescape(value: string, major: GedcomMajorVersion): string {
  if (major === '5') return value.replace(/@@/g, '@');
  return value.startsWith('@@') ? value.slice(1) : value;
}

/** Builds the tree. CONT and CONC lines are folded into their parent's
 *  value. */
function buildTree(
  lines: RawLine[],
  major: GedcomMajorVersion,
  warnings: Warnings,
): GedcomNode[] {
  const records: GedcomNode[] = [];
  // stack[k] = latest node at level k
  const stack: GedcomNode[] = [];
  let previousLevel = 0;
  let warnedConc = false;

  for (const l of lines) {
    let level = l.level;
    if (level > previousLevel + 1 && stack.length > 0) {
      warnings.add(
        'LEVEL_JUMP',
        l.line,
        `Level ${level} follows level ${previousLevel}; read as ${previousLevel + 1}`,
      );
      level = previousLevel + 1;
    }
    if (level > 0 && stack.length === 0) {
      warnings.add('BAD_LINE', l.line, 'Line before the first record; skipped');
      continue;
    }
    const parent = level > 0 ? stack[level - 1] : undefined;
    if (level > 0 && !parent) {
      warnings.add('BAD_LINE', l.line, 'Line without a parent; skipped');
      continue;
    }
    previousLevel = level;

    if (level > 0 && (l.tag === 'CONT' || l.tag === 'CONC') && !l.xref) {
      if (l.tag === 'CONC' && major === '7' && !warnedConc) {
        warnedConc = true;
        warnings.add(
          'CONC_IN_V7',
          l.line,
          'CONC is not allowed in GEDCOM 7.0; lines merged anyway',
        );
      }
      const piece = unescape(l.value ?? '', major);
      parent!.value =
        l.tag === 'CONT'
          ? `${parent!.value ?? ''}\n${piece}`
          : `${parent!.value ?? ''}${piece}`;
      // Nothing may hang below a continuation line.
      stack.length = level;
      stack[level] = {tag: l.tag, children: [], line: l.line};
      continue;
    }

    const node: GedcomNode = {tag: l.tag, children: [], line: l.line};
    if (l.xref !== undefined) node.xref = l.xref;
    if (l.value !== undefined) {
      const isBlank = l.value.trim() === '';
      if (!isBlank) {
        const pointer = POINTER_RE.exec(l.value);
        if (pointer) {
          node.value = pointer[1]!; // "VOID" for @VOID@
          node.pointer = true;
        } else {
          node.value = unescape(l.value, major);
        }
      }
    }

    if (level === 0) records.push(node);
    else parent!.children.push(node);
    stack.length = level;
    stack[level] = node;
  }
  return records;
}

function checkPointers(
  records: GedcomNode[],
  byId: Map<string, GedcomNode>,
  warnings: Warnings,
) {
  for (const record of records) {
    walk(record, (n) => {
      if (n.pointer && n.value !== VOID_POINTER && !byId.has(n.value!)) {
        warnings.add(
          'UNDEFINED_XREF',
          n.line,
          `${n.tag} points to @${n.value}@, which is not defined`,
        );
      }
    });
  }
}

const DATE_TAGS = new Set(['DATE', 'SDATE']);

/** Warnings about extension tags, dates and ages. Extension structures are
 *  not looked into: their payload types are not ours to judge. */
function checkValues(
  records: GedcomNode[],
  schema: Map<string, string>,
  major: GedcomMajorVersion,
  warnings: Warnings,
) {
  const seenExtensions = new Set<string>();
  const visit = (n: GedcomNode): boolean => {
    if (n.tag.startsWith('_')) {
      if (major !== '5' && !schema.has(n.tag) && !seenExtensions.has(n.tag)) {
        seenExtensions.add(n.tag);
        warnings.add(
          'UNDOCUMENTED_EXTENSION',
          n.line,
          `Extension tag ${n.tag} has no HEAD.SCHMA entry`,
        );
      }
      return false;
    }
    if (n.pointer) return true;
    if (DATE_TAGS.has(n.tag) && n.value !== undefined) {
      const date = parseDate(n.value);
      if (date.value.kind === 'unparsed') {
        warnings.add('BAD_DATE', n.line, `Cannot read date "${clip(n.value)}"`);
      }
    } else if (n.tag === 'AGE' && n.value !== undefined) {
      if (!isValidAge(n.value)) {
        warnings.add('BAD_AGE', n.line, `Cannot read age "${clip(n.value)}"`);
      }
    }
    return true;
  };
  for (const record of records) {
    const stack: GedcomNode[] = [record];
    while (stack.length > 0) {
      const n = stack.pop()!;
      if (!visit(n)) {
        // Still report extension tags nested in extensions? Only the first
        // level is informative; skip the subtree.
        continue;
      }
      for (let i = n.children.length - 1; i >= 0; i--) {
        stack.push(n.children[i]!);
      }
    }
  }
}

/** Parses GEDCOM text. The text must already be decoded (see
 *  decodeGedcomBytes); a leading BOM is ignored. */
export function parseGedcom(text: string): ParseResult {
  const warnings = new Warnings();
  const lines = tokenise(text, warnings);
  const version = findVersion(lines);
  const records = buildTree(lines, version.major, warnings);

  const byId = new Map<string, GedcomNode>();
  for (const r of records) {
    if (r.xref === undefined) continue;
    if (byId.has(r.xref)) {
      warnings.add(
        'DUPLICATE_XREF',
        r.line,
        `Cross-reference @${r.xref}@ is defined more than once`,
      );
      continue;
    }
    byId.set(r.xref, r);
  }

  const head = records.find((r) => r.tag === 'HEAD');
  const schema = new Map<string, string>();
  let placeForm: string[] = [];
  let language: string | undefined;
  if (head) {
    const schma = child(head, 'SCHMA');
    for (const t of schma ? children(schma, 'TAG') : []) {
      const m = /^(\S+)\s+(\S.*)$/.exec(t.value ?? '');
      if (m && !schema.has(m[1]!)) schema.set(m[1]!, m[2]!.trim());
    }
    const plac = child(head, 'PLAC');
    const form = plac && child(plac, 'FORM');
    if (form?.value) placeForm = splitList(form.value);
    language = child(head, 'LANG')?.value;
  }

  checkPointers(records, byId, warnings);
  checkValues(records, schema, version.major, warnings);

  const result: ParseResult = {
    version,
    records,
    byId,
    schema,
    placeForm,
    warnings: warnings.finish(),
  };
  if (language !== undefined) result.language = language;
  return result;
}
