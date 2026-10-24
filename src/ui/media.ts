// A person's media as the cards and the viewer show them: what each file
// is, where it can be shown from, and whether it is a linked file that is
// not loaded while «images by link» is off.

import type {
  EventDetail,
  IndiView,
  LoadedTree,
  MediaFile,
  MediaLink,
} from '../gedcom/types';
import {yearOf} from '../model/bounds';
import {isImageFile, mediaUrl} from '../load';
import {cropBox} from '../chart/photo';

export interface MediaEntry {
  media: MediaLink;
  file: MediaFile;
  title: string;
  /** Where it can be shown from; none for a linked file not loaded. */
  src?: string;
  /** A link to another site (http or https). */
  remote: boolean;
  /** That site, for saying where files would come from. */
  host?: string;
  image: boolean;
  /** The year: of the event the file is linked under, else in its title. */
  year?: number;
  /** Place in the file, for files without a year and for the portrait. */
  order: number;
}

const isRestricted = (r: readonly string[]) =>
  r.includes('CONFIDENTIAL') || r.includes('PRIVACY');

/** A readable name for a file without a title: its decoded file name. */
export function fileLabel(path: string): string {
  const name = path.split(/[?#]/)[0]!.split(/[\\/]/).pop() || path;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/** Where the file can be shown from: a bundled blob, or a link in the file. */
export function resolveMedia(
  tree: LoadedTree,
  path: string,
  allowRemote: boolean,
): {src?: string; remote: boolean; host?: string} {
  const url = mediaUrl(tree.media, path);
  if (!url) return {remote: false};
  const remote = /^https?:/i.test(url);
  let host: string | undefined;
  if (remote) {
    try {
      host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      host = undefined;
    }
  }
  return remote && !allowRemote ? {remote, host} : {src: url, remote, host};
}

/** The first year written in a title: «1955 г.», «23.01.2019», «1975–1985». */
export function titleYear(title: string): number | undefined {
  const m = /(?<!\d)(1[5-9]\d\d|20\d\d)(?!\d)/.exec(title);
  return m ? Number(m[1]) : undefined;
}

/**
 * The person's media: linked to them, and to their events and their
 * families' events (a wedding photo under MARR), restricted ones left out
 * if `hide`. In order of years — the event's, else one in the title —
 * then those without a year, in file order.
 */
export function mediaEntries(
  tree: LoadedTree,
  indi: IndiView,
  {hide, allowRemote}: {hide: boolean; allowRemote: boolean},
): MediaEntry[] {
  if (hide && isRestricted(indi.restrictions)) return [];
  const shown = (e: EventDetail) => !(hide && isRestricted(e.restrictions));
  const fromEvents = (events: EventDetail[]) =>
    events
      .filter(shown)
      .flatMap((e) => e.media.map((media) => ({media, year: yearOf(e.date)})));
  const links: Array<{media: MediaLink; year?: number}> = [
    ...indi.media.map((media) => ({media})),
    ...fromEvents(indi.events),
    ...indi.fams.flatMap((id) => {
      const fam = tree.fams.get(id);
      return fam && !(hide && isRestricted(fam.restrictions))
        ? fromEvents(fam.events)
        : [];
    }),
  ];
  // One file linked twice (to the person and to an event) is shown once,
  // with the event's year.
  const seen = new Map<string, {media: MediaLink; year?: number}>();
  const unique = links.filter((l) => {
    const key = l.media.objectId;
    if (!key) return true;
    const first = seen.get(key);
    if (first) {
      first.year ??= l.year;
      return false;
    }
    seen.set(key, l);
    return true;
  });
  const entries = unique.flatMap(({media, year}, order) => {
    const file = media.files[0];
    if (!file || (hide && isRestricted(media.restrictions))) return [];
    const {src, remote, host} = resolveMedia(tree, file.path, allowRemote);
    const title = media.title ?? file.title ?? fileLabel(file.path);
    return [
      {
        media,
        file,
        title,
        src,
        remote,
        host,
        image: isImageFile(file),
        year: year ?? titleYear(title),
        order,
      },
    ];
  });
  return entries.sort(
    (a, b) => (a.year ?? Infinity) - (b.year ?? Infinity) || a.order - b.order,
  );
}

/** The sites of the linked files that are not loaded, without repeats. */
export function blockedHosts(entries: MediaEntry[]): string[] {
  return [
    ...new Set(
      entries.flatMap((e) => (e.remote && !e.src && e.host ? [e.host] : [])),
    ),
  ];
}

/** The portrait: the first image that can be shown, and its place. */
export function portraitOf(
  entries: MediaEntry[],
): {entry: MediaEntry; index: number} | undefined {
  // The first image in the file (GEDCOM's preferred one), wherever the
  // years put it.
  let index = -1;
  entries.forEach((e, i) => {
    if (e.image && e.src && (index === -1 || e.order < entries[index]!.order))
      index = i;
  });
  return index === -1 ? undefined : {entry: entries[index]!, index};
}

/** The crop as an SVG viewBox, when it can be worked out without the image. */
export function cropViewBox(media: MediaLink): string | undefined {
  const box = cropBox(media.crop);
  return box ? box.join(' ') : undefined;
}
