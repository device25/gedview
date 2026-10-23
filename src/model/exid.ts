// External identifiers (EXID). The registry mirrors the exid-types of
// https://github.com/FamilySearch/GEDCOM-registries (uri/exid-types/): the
// EXID.TYPE URI, a label and, where the registry defines how an id turns
// into a web address, the URL prefix.

import type {ExternalId} from '../gedcom/types';

interface ExidType {
  label: string;
  /** The id is appended (percent-encoded) to this prefix. */
  urlPrefix?: string;
}

export const FAMILYSEARCH_PERSON_ID_TYPE =
  'https://gedcom.io/exid-type/FamilySearch-PersonId';

const REGISTRY: Record<string, ExidType> = {
  'https://gedcom.io/terms/v7/AFN': {label: 'Ancestral File Number'},
  'https://gedcom.io/terms/v7/RFN': {label: 'Record File Number'},
  'https://gedcom.io/terms/v7/RIN': {label: 'Record ID Number'},
  'https://www.billiongraves.com/cemetery/name/': {
    label: 'BillionGraves Cemetery ID',
    urlPrefix: 'https://www.billiongraves.com/cemetery/name/',
  },
  'https://www.billiongraves.com/grave/name/': {
    label: 'BillionGraves Grave ID',
    urlPrefix: 'https://www.billiongraves.com/grave/name/',
  },
  'https://gedcom.io/exid-type/FamilySearch-MemoryId': {
    label: 'FamilySearch Memory ID',
    urlPrefix: 'https://www.familysearch.org/en/memories/memory/',
  },
  [FAMILYSEARCH_PERSON_ID_TYPE]: {
    label: 'FamilySearch Person ID',
    urlPrefix:
      'https://www.familysearch.org/en/search/tree/results?q.personId=',
  },
  'https://gedcom.io/exid-type/FamilySearch-PlaceId': {
    label: 'FamilySearch Place ID',
    urlPrefix: 'https://www.familysearch.org/en/research/places/?focusedId=',
  },
  'https://gedcom.io/exid-type/FamilySearch-SourceDescriptionId': {
    label: 'FamilySearch Source Description ID',
    urlPrefix: 'https://www.familysearch.org/en/tree/sources/viewedit/',
  },
  'https://gedcom.io/exid-type/FamilySearch-UserId': {
    label: 'FamilySearch User ID',
  },
  'https://www.findagrave.com/cemetery/': {
    label: 'FindAGrave Cemetery ID',
    urlPrefix: 'https://www.findagrave.com/cemetery/',
  },
  'https://www.findagrave.com/memorial/': {
    label: 'FindAGrave Memorial ID',
    urlPrefix: 'https://www.findagrave.com/memorial/',
  },
  'https://gov.genealogy.net/': {
    label: 'GOV Historic Gazetteer ID',
    urlPrefix: 'https://gov.genealogy.net/item/show/',
  },
  'https://www.wikitree.com/wiki/': {
    label: 'WikiTree Person ID',
    urlPrefix: 'https://www.wikitree.com/wiki/',
  },
};

/** Registry lookup. The fragment (RFN/RIN carry the resource after #) and a
 *  trailing difference between http and https are ignored. */
export function exidType(type: string | undefined): ExidType | undefined {
  if (!type) return undefined;
  const bare = type.trim().split('#')[0]!;
  return (
    REGISTRY[bare] ??
    REGISTRY[bare.replace(/^http:/i, 'https:')] ??
    REGISTRY[bare.endsWith('/') ? bare.slice(0, -1) : `${bare}/`]
  );
}

/** Builds an ExternalId, resolving label and URL for known types. An unknown
 *  type (or none) gives no label and no URL. */
export function makeExternalId(value: string, type?: string): ExternalId {
  const result: ExternalId = {value};
  if (type) result.type = type;
  const known = exidType(type);
  if (known) {
    result.label = known.label;
    if (known.urlPrefix) {
      result.url = known.urlPrefix + encodeURIComponent(value.trim());
    }
  }
  return result;
}

/** All registered types, for UI pickers and tests. */
export function knownExidTypes(): Array<{type: string} & ExidType> {
  return Object.entries(REGISTRY).map(([type, t]) => ({type, ...t}));
}
