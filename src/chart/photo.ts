// The small portrait drawn on a person's box: the first image of the person
// that can be shown, cropped as GEDCOM 7.0 CROP says.

import type {Crop, IndiView, LoadedTree, MediaLink} from '../gedcom/types';
import {isPortraitFile, mediaUrl} from '../load';

export interface Photo {
  src: string;
  /** CROP in pixels of the original image; missing sides are filled in once
   *  the image size is known. */
  crop?: Crop;
}

const isRestricted = (r: readonly string[]) =>
  r.includes('CONFIDENTIAL') || r.includes('PRIVACY');

/**
 * The person's portrait: the first OBJE (the most preferred one in GEDCOM)
 * whose first file is a photo (not a scanned document) we may show — bundled with the tree, or a
 * linked http(s) image when `allowRemote` is on. Restricted media are
 * skipped when `hideRestricted` is on.
 */
export function photoOf(
  indi: IndiView | undefined,
  tree: LoadedTree,
  {
    allowRemote,
    hideRestricted,
  }: {allowRemote: boolean; hideRestricted: boolean},
): Photo | undefined {
  if (!indi) return undefined;
  if (hideRestricted && isRestricted(indi.restrictions)) return undefined;
  for (const media of indi.media) {
    const photo = usable(media, tree, allowRemote, hideRestricted);
    if (photo) return photo;
  }
  return undefined;
}

function usable(
  media: MediaLink,
  tree: LoadedTree,
  allowRemote: boolean,
  hideRestricted: boolean,
): Photo | undefined {
  if (hideRestricted && isRestricted(media.restrictions)) return undefined;
  const file = media.files[0];
  if (!file || !isPortraitFile(file)) return undefined;
  const src = mediaUrl(tree.media, file.path);
  if (!src) return undefined;
  if (/^https?:/i.test(src) && !allowRemote) return undefined;
  return media.crop ? {src, crop: media.crop} : {src};
}

/**
 * The region of the image to show, in image pixels, or undefined when the
 * whole image is used. Needs the image size only when the crop leaves the
 * width or height out (they then run to the right and bottom edges).
 */
export function cropBox(
  crop: Crop | undefined,
  size?: {width: number; height: number},
): [number, number, number, number] | undefined {
  if (!crop) return undefined;
  const left = crop.left ?? 0;
  const top = crop.top ?? 0;
  const width = crop.width ?? (size ? size.width - left : undefined);
  const height = crop.height ?? (size ? size.height - top : undefined);
  if (width === undefined || height === undefined) return undefined;
  if (width <= 0 || height <= 0) return undefined;
  return [left, top, width, height];
}
