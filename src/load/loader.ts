// Loading a tree from picked files or from a URL.

import type {
  LoadedTree,
  LoadInput,
  LoadTree,
  MediaMap,
  TreeSource,
} from '../gedcom/types';
import {guessMime} from '../model/mime';
import {decodeFilePath} from '../model/mediaUrl';
import {linkMedia, mediaPaths, treeFromBytes} from '../model/tree';
import {loadError} from './errors';
import {isIgnored, looksLikeZip, pickDataset, readGedzip} from './zip';

/** Largest file fetched from a URL, or picked as the tree itself. */
export const MAX_URL_BYTES = 200 * 1024 * 1024;
/** Largest .ged read from disk. Archives and media are not read into
 *  memory (see zip.ts), so their size does not count. */
export const MAX_FILE_BYTES = 1024 * 1024 * 1024;

export interface LoaderDeps {
  /** Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Defaults to URL.createObjectURL; inject for tests without DOM. */
  createObjectUrl?: (blob: Blob) => string;
  /** Size limit for downloads; defaults to MAX_URL_BYTES (200 MB). */
  maxUrlBytes?: number;
}

const GEDCOM_EXT = /\.ged$/i;
const ZIP_EXT = /\.(gdz|zip)$/i;

function createLoader(deps: LoaderDeps) {
  const maxUrlBytes = deps.maxUrlBytes ?? MAX_URL_BYTES;
  /** A blob URL for a file without copying it: a picked File or a slice
   *  of an archive is read from disk when it is shown. */
  const makeUrl = (blob: Blob, name: string): string => {
    const typed = blob.type
      ? blob
      : blob.slice(0, blob.size, guessMime(name) ?? 'application/octet-stream');
    return (deps.createObjectUrl ?? ((b) => URL.createObjectURL(b)))(typed);
  };

  function finish(
    source: TreeSource,
    bytes: Uint8Array,
    media: MediaMap,
  ): LoadedTree {
    const tree = treeFromBytes(source, bytes, media);
    if (!tree.parse.records.some((r) => r.tag === 'HEAD')) {
      throw loadError('NOT_GEDCOM', 'This is not a GEDCOM file');
    }
    if (tree.indis.size === 0) {
      throw loadError('EMPTY', 'The file has no individuals');
    }
    return tree;
  }

  async function fromZip(name: string, blob: Blob): Promise<LoadedTree> {
    const archive = await readGedzip(blob);
    const tree = finish({kind: 'gedzip', name}, archive.gedcom, new Map());
    // Only the files the tree refers to are opened: by path, ignoring case,
    // or by file name alone (as lookupMedia finds them).
    const key = (s: string) => decodeFilePath(s).normalize('NFC').toLowerCase();
    const base = (s: string) => s.slice(s.lastIndexOf('/') + 1);
    const refs = mediaPaths(tree.parse).filter(
      (p) => !/^[a-z][a-z0-9+.-]*:/i.test(p),
    );
    const names = new Set(refs.map((p) => base(key(p))));
    if (names.size === 0) return tree;
    const files = await archive.open((entry) => names.has(base(key(entry))));
    const urls = new Map<Blob, string>();
    for (const [path, data] of files) {
      // A file listed under two paths gets one URL.
      const url = urls.get(data) ?? makeUrl(data, path);
      urls.set(data, url);
      tree.media.set(path, url);
    }
    linkMedia(tree.parse, tree.media);
    return tree;
  }

  async function fromFiles(files: File[], signal?: AbortSignal) {
    if (files.length === 0) throw loadError('NOT_GEDCOM', 'No file was given');
    const relative = (f: File) =>
      (
        (f as File & {relativePath?: string}).relativePath ||
        (f as File & {webkitRelativePath?: string}).webkitRelativePath ||
        f.name
      ).replace(/\\/g, '/');
    // A picked folder: its hidden folders (.git…) and macOS junk are not
    // part of the tree.
    const picked = files.filter(
      (f) => files.length === 1 || !isIgnored(relative(f)),
    );

    const zip = picked.find((f) => ZIP_EXT.test(f.name));
    if (zip) {
      signal?.throwIfAborted();
      return fromZip(zip.name, zip);
    }
    // One file of any name is tried as GEDCOM; with several, the .ged (the
    // one nearest the top of a folder).
    const gedName = pickDataset(
      picked.filter((f) => GEDCOM_EXT.test(f.name)).map(relative),
    );
    const ged =
      picked.find((f) => gedName !== undefined && relative(f) === gedName) ??
      picked.find((f) => GEDCOM_EXT.test(f.name)) ??
      picked[0]!;
    if (ged.size > MAX_FILE_BYTES) {
      throw loadError('TOO_LARGE', 'The file is too large');
    }
    signal?.throwIfAborted();
    const head = new Uint8Array(await ged.slice(0, 4).arrayBuffer());
    if (looksLikeZip(head)) return fromZip(ged.name, ged);
    const bytes = new Uint8Array(await ged.arrayBuffer());

    // Loose media: by path relative to the .ged and by file name alone;
    // each File is shown straight from disk, never copied.
    const media: MediaMap = new Map();
    const gedPath = relative(ged);
    const dir = gedPath.includes('/')
      ? gedPath.slice(0, gedPath.lastIndexOf('/') + 1)
      : '';
    for (const f of picked) {
      if (f === ged) continue;
      signal?.throwIfAborted();
      const url = makeUrl(f, f.name);
      const path = relative(f);
      const inside =
        dir && path.startsWith(dir) ? path.slice(dir.length) : path;
      media.set(inside, url);
      if (!media.has(f.name)) media.set(f.name, url);
    }
    return finish({kind: 'file', name: ged.name}, bytes, media);
  }

  async function readLimited(
    response: Response,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    const declared = Number(response.headers.get('content-length'));
    if (declared > maxUrlBytes) {
      void response.body?.cancel();
      throw loadError('TOO_LARGE', 'The file is too large');
    }
    if (!response.body) {
      const buffer = new Uint8Array(await response.arrayBuffer());
      if (buffer.length > maxUrlBytes) {
        throw loadError('TOO_LARGE', 'The file is too large');
      }
      return buffer;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      signal?.throwIfAborted();
      const {done, value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxUrlBytes) {
        void reader.cancel();
        throw loadError('TOO_LARGE', 'The file is too large');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  }

  async function fromUrl(url: string, signal?: AbortSignal) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (cause) {
      throw loadError('NETWORK', 'The address is not a valid URL', cause);
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw loadError('NETWORK', 'Only http and https addresses can be loaded');
    }
    let response: Response;
    try {
      response = await (deps.fetch ?? fetch)(parsed.href, {
        signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch (cause) {
      if (signal?.aborted) throw cause;
      throw loadError('NETWORK', 'The file could not be fetched', cause);
    }
    if (!response.ok) {
      throw loadError('NETWORK', `The server answered ${response.status}`);
    }
    let bytes: Uint8Array;
    try {
      bytes = await readLimited(response, signal);
    } catch (cause) {
      if (signal?.aborted || (cause as {code?: string}).code === 'TOO_LARGE') {
        throw cause;
      }
      throw loadError('NETWORK', 'The download was interrupted', cause);
    }
    const last = parsed.pathname.split('/').filter(Boolean).pop();
    let name = parsed.hostname;
    if (last) {
      try {
        name = decodeURIComponent(last);
      } catch {
        name = last;
      }
    }
    if (looksLikeZip(bytes) || ZIP_EXT.test(parsed.pathname)) {
      return fromZip(name, new Blob([bytes as BlobPart]));
    }
    return finish({kind: 'url', name}, bytes, new Map());
  }

  const loadTree: LoadTree = async (input: LoadInput, signal) => {
    signal?.throwIfAborted();
    return input.kind === 'url'
      ? fromUrl(input.url, signal)
      : fromFiles(input.files, signal);
  };
  return loadTree;
}

/** Creates a `LoadTree` with injectable fetch and blob-URL creation. */
export function createLoadTree(deps: LoaderDeps = {}): LoadTree {
  return createLoader(deps);
}

/** The loader the app uses. Throws LoadError (see src/gedcom/types.ts). */
export const loadTree: LoadTree = createLoadTree();

/** Releases the blob URLs of a tree's media when the tree is closed. */
export function revokeTreeMedia(media: MediaMap): void {
  for (const url of new Set(media.values())) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
}
