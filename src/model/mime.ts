// Media types for files, from FORM payloads and from file names.

/** 5.5.1 FORM words (and common extensions) -> media type. */
const BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  mp4: 'video/mp4',
  txt: 'text/plain',
  htm: 'text/html',
  html: 'text/html',
};

/** FORM payload to a media type: 7.0 values already are one; 5.5.1 uses an
 *  extension word ("jpg"). Unknown words give undefined. */
export function mimeFromForm(form: string | undefined): string | undefined {
  const value = form?.trim();
  if (!value) return undefined;
  if (value.includes('/')) return value;
  return BY_EXTENSION[value.toLowerCase().replace(/^\./, '')];
}

/** Media type guessed from the extension of a file name or URL, if known. */
export function guessMime(path: string): string | undefined {
  const clean = path.split(/[?#]/)[0]!;
  const dot = clean.lastIndexOf('.');
  if (dot < 0 || clean.lastIndexOf('/') > dot) return undefined;
  return BY_EXTENSION[clean.slice(dot + 1).toLowerCase()];
}
