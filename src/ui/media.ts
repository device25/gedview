// A person's media as the cards and the viewer show them: what each file
// is, where it can be shown from, and whether it is a linked file that is
// not loaded while «images by link» is off.

import type {IndiView, LoadedTree, MediaFile, MediaLink} from '../gedcom/types';
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

/** The person's media in file order, restricted ones left out if `hide`. */
export function mediaEntries(
  tree: LoadedTree,
  indi: IndiView,
  {hide, allowRemote}: {hide: boolean; allowRemote: boolean},
): MediaEntry[] {
  if (hide && isRestricted(indi.restrictions)) return [];
  return indi.media.flatMap((media) => {
    const file = media.files[0];
    if (!file || (hide && isRestricted(media.restrictions))) return [];
    const {src, remote, host} = resolveMedia(tree, file.path, allowRemote);
    return [
      {
        media,
        file,
        title: media.title ?? file.title ?? fileLabel(file.path),
        src,
        remote,
        host,
        image: isImageFile(file),
      },
    ];
  });
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
  const index = entries.findIndex((e) => e.image && e.src);
  return index === -1 ? undefined : {entry: entries[index]!, index};
}

/** The crop as an SVG viewBox, when it can be worked out without the image. */
export function cropViewBox(media: MediaLink): string | undefined {
  const box = cropBox(media.crop);
  return box ? box.join(' ') : undefined;
}
