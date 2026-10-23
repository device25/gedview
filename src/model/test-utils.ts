// Helpers for tests: build a LoadedTree from inline GEDCOM text.

import {parseGedcom} from '../gedcom/parse';
import type {ChartSettings, LoadedTree, MediaMap} from '../gedcom/types';
import {treeFromParse} from './tree';

/** A GEDCOM 7.0 document around `body` lines. */
export const doc7 = (...body: string[]) =>
  ['0 HEAD', '1 GEDC', '2 VERS 7.0', ...body, '0 TRLR'].join('\n');

/** A GEDCOM 5.5.1 document around `body` lines. */
export const doc5 = (...body: string[]) =>
  [
    '0 HEAD',
    '1 GEDC',
    '2 VERS 5.5.1',
    '2 FORM LINEAGE-LINKED',
    '1 CHAR UTF-8',
    ...body,
    '0 TRLR',
  ].join('\n');

export function treeOf(text: string, media: MediaMap = new Map()): LoadedTree {
  return treeFromParse(
    {kind: 'file', name: 'test.ged'},
    parseGedcom(text),
    media,
  );
}

export const SETTINGS: ChartSettings = {
  sexColors: true,
  showIds: true,
  dashChallenged: true,
  disproven: 'hide',
  dateStyle: 'source',
  hideRestricted: false,
  loadRemoteMedia: true,
  cardColor: 'none',
};
