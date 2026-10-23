// Parsed file -> LoadedTree (the object the UI works with).

import {decodeGedcomBytes} from '../gedcom/decode';
import {walk} from '../gedcom/nodes';
import {parseGedcom} from '../gedcom/parse';
import type {
  LoadedTree,
  MediaMap,
  ParseResult,
  TreeSource,
} from '../gedcom/types';
import {decodeFilePath, lookupMedia} from './mediaUrl';
import {buildViews} from './records';

/** FILE and FILE.TRAN references of the whole file, as written. */
export function mediaPaths(parse: ParseResult): string[] {
  const paths = new Set<string>();
  for (const record of parse.records) {
    walk(record, (n, parent) => {
      if (!n.value) return;
      if (n.tag === 'FILE' && parent?.tag === 'OBJE') paths.add(n.value);
      else if (n.tag === 'TRAN' && parent?.tag === 'FILE') paths.add(n.value);
    });
  }
  return [...paths];
}

/** Adds to `media` an entry for every FILE reference that matches a bundled
 *  file, under the reference's own (percent-decoded) spelling, so that a
 *  plain `media.get(decodeFilePath(path))` finds it. */
export function linkMedia(parse: ParseResult, media: MediaMap): void {
  if (media.size === 0) return;
  for (const path of mediaPaths(parse)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) continue; // remote URL
    const decoded = decodeFilePath(path);
    if (media.has(decoded)) continue;
    const url = lookupMedia(media, path);
    if (url !== undefined) media.set(decoded, url);
  }
}

/** Builds all views of a parsed file. */
export function treeFromParse(
  source: TreeSource,
  parse: ParseResult,
  media: MediaMap = new Map(),
): LoadedTree {
  linkMedia(parse, media);
  const {indis, fams, sources, childLinkStatus} = buildViews(parse);
  return {source, parse, media, indis, fams, sources, childLinkStatus};
}

/** Decodes and parses bytes and builds the tree. Does not throw for files
 *  without people; the loader decides about that. */
export function treeFromBytes(
  source: TreeSource,
  bytes: Uint8Array,
  media: MediaMap = new Map(),
): LoadedTree {
  const decoded = decodeGedcomBytes(bytes);
  const parse = parseGedcom(decoded.text);
  if (decoded.fallback) {
    parse.warnings.unshift({
      code: 'ENCODING',
      message: 'The file is not valid UTF-8; read as windows-1252',
    });
  }
  return treeFromParse(source, parse, media);
}
