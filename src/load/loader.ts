// Loading a tree from picked files or from a URL.

import type {
  LoadedTree,
  LoadInput,
  LoadTree,
  MediaMap,
  TreeSource,
} from '../gedcom/types';
import {guessMime} from '../model/mime';
import {treeFromBytes} from '../model/tree';
import {loadError} from './errors';
import {looksLikeZip, unpackGedzip} from './zip';

/** Largest file fetched from a URL, or picked as the tree itself. */
export const MAX_URL_BYTES = 200 * 1024 * 1024;
/** Largest .ged / .gdz picked from disk, and the sum of picked files. */
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
  const makeUrl = (bytes: Uint8Array, name: string): string => {
    const blob = new Blob([bytes as BlobPart], {
      type: guessMime(name) ?? 'application/octet-stream',
    });
    return (deps.createObjectUrl ?? ((b) => URL.createObjectURL(b)))(blob);
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

  function fromZip(name: string, bytes: Uint8Array): LoadedTree {
    const zip = unpackGedzip(bytes);
    const media: MediaMap = new Map();
    for (const [path, data] of zip.files) media.set(path, makeUrl(data, path));
    return finish({kind: 'gedzip', name}, zip.gedcom, media);
  }

  async function fromFiles(files: File[], signal?: AbortSignal) {
    if (files.length === 0) throw loadError('NOT_GEDCOM', 'No file was given');
    const total = files.reduce((sum, f) => sum + f.size, 0);
    if (total > MAX_FILE_BYTES) {
      throw loadError('TOO_LARGE', 'The files are too large');
    }
    const relative = (f: File) =>
      (f as File & {webkitRelativePath?: string}).webkitRelativePath || f.name;

    const zip = files.find((f) => ZIP_EXT.test(f.name));
    if (zip) {
      signal?.throwIfAborted();
      return fromZip(zip.name, new Uint8Array(await zip.arrayBuffer()));
    }
    // One file of any name is tried as GEDCOM; with several, the .ged is it.
    const ged = files.find((f) => GEDCOM_EXT.test(f.name)) ?? files[0]!;
    signal?.throwIfAborted();
    const bytes = new Uint8Array(await ged.arrayBuffer());
    if (looksLikeZip(bytes)) return fromZip(ged.name, bytes);

    // Loose media: by path relative to the .ged and by file name alone.
    const media: MediaMap = new Map();
    const gedPath = relative(ged);
    const dir = gedPath.includes('/')
      ? gedPath.slice(0, gedPath.lastIndexOf('/') + 1)
      : '';
    for (const f of files) {
      if (f === ged) continue;
      signal?.throwIfAborted();
      const url = makeUrl(new Uint8Array(await f.arrayBuffer()), f.name);
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
      return fromZip(name, bytes);
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
