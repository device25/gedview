import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {strToU8, zipSync} from 'fflate';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {mediaUrl} from '../model/mediaUrl';
import {createLoadTree, isLoadError, revokeTreeMedia} from './index';
import {looksLikeZip, unpackGedzip} from './zip';

const GED = (...body: string[]) =>
  ['0 HEAD', '1 GEDC', '2 VERS 7.0', ...body, '0 TRLR'].join('\n');
const WITH_PERSON = GED(
  '0 @I1@ INDI',
  '1 NAME Иван /Соколов/',
  '1 OBJE @O1@',
  '0 @O1@ OBJE',
  '1 FILE media/CharlotteBront%C3%AB.jpg',
  '2 FORM image/jpeg',
  '1 FILE media/second.png',
  '1 FILE other/ПОРТРЕТ.JPG',
);

const created: Blob[] = [];
const load = createLoadTree({
  createObjectUrl: (blob) => {
    created.push(blob);
    return `blob:test/${created.length}`;
  },
});
afterEach(() => {
  created.length = 0;
  vi.restoreAllMocks();
});

const file = (
  name: string,
  content: string | Uint8Array,
  relativePath?: string,
) => {
  const f = new File(
    [typeof content === 'string' ? strToU8(content) : (content as BlobPart)],
    name,
  );
  if (relativePath)
    Object.defineProperty(f, 'webkitRelativePath', {value: relativePath});
  return f;
};
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    expect(isLoadError(e), String(e)).toBe(true);
    return (e as {code: string}).code;
  }
  throw new Error('did not fail');
};

describe('files', () => {
  it('loads a .ged', async () => {
    const tree = await load({
      kind: 'files',
      files: [file('family.ged', WITH_PERSON)],
    });
    expect(tree.source).toEqual({kind: 'file', name: 'family.ged'});
    expect(tree.indis.get('I1')!.names[0]!.display).toBe('Иван Соколов');
    expect(tree.media.size).toBe(0);
  });

  it('loads files in other encodings', async () => {
    const text = GED('0 @I1@ INDI', '1 NAME Ёжик /Тёмный/');
    const bom8 = Uint8Array.from([0xef, 0xbb, 0xbf, ...strToU8(text)]);
    expect(
      (await load({kind: 'files', files: [file('a.ged', bom8)]})).indis.get(
        'I1',
      )!.names[0]!.display,
    ).toBe('Ёжик Тёмный');

    const utf16 = (be: boolean) => {
      const out: number[] = be ? [0xfe, 0xff] : [0xff, 0xfe];
      for (const ch of text) {
        const c = ch.charCodeAt(0);
        out.push(...(be ? [c >> 8, c & 255] : [c & 255, c >> 8]));
      }
      return Uint8Array.from(out);
    };
    for (const be of [false, true]) {
      const tree = await load({
        kind: 'files',
        files: [file('a.ged', utf16(be))],
      });
      expect(tree.indis.get('I1')!.names[0]!.display).toBe('Ёжик Тёмный');
    }
  });

  it('warns when it had to guess a legacy encoding', async () => {
    const head = strToU8(GED('0 @I1@ INDI', '1 NAME Ren'));
    const tail = strToU8(' /X/');
    // splice a Latin-1 "é" into the NAME line, before the trailer
    const cut = head.length - '\n0 TRLR'.length;
    const bytes = Uint8Array.from([
      ...head.slice(0, cut),
      0xe9,
      ...tail,
      ...head.slice(cut),
    ]);
    const tree = await load({kind: 'files', files: [file('a.ged', bytes)]});
    expect(tree.parse.warnings[0]!.code).toBe('ENCODING');
    expect(tree.indis.get('I1')!.names[0]!.raw).toBe('René /X/');
  });

  it('takes the .ged among loose media and finds the media by relative path and by name', async () => {
    const files = [
      file('photo.jpg', 'jpg-bytes', 'tree/media/CharlotteBrontë.jpg'),
      file('family.ged', WITH_PERSON, 'tree/family.ged'),
      file('second.png', 'png-bytes', 'tree/media/second.png'),
      file('портрет.jpg', 'x', 'tree/elsewhere/портрет.jpg'),
    ];
    const tree = await load({kind: 'files', files});
    expect(tree.source.name).toBe('family.ged');
    expect(mediaUrl(tree.media, 'media/second.png')).toMatch(/^blob:test\//);
    expect(mediaUrl(tree.media, 'media/second.png')).toBe(
      tree.media.get('media/second.png'),
    );
    // the percent-encoded reference finds the file by its path inside the folder
    expect(mediaUrl(tree.media, 'media/CharlotteBront%C3%AB.jpg')).toBe(
      tree.media.get('media/CharlotteBrontë.jpg'),
    );
    // case-insensitive, other folder
    expect(mediaUrl(tree.media, 'other/ПОРТРЕТ.JPG')).toMatch(/^blob:test\//);
    expect(created.map((b) => b.type).sort()).toEqual([
      'image/jpeg',
      'image/jpeg',
      'image/png',
    ]);
  });

  it('loose files without folders: matched by file name', async () => {
    const files = [
      file('family.ged', WITH_PERSON),
      file('CharlotteBrontë.jpg', 'x'),
      file('second.png', 'y'),
    ];
    const tree = await load({kind: 'files', files});
    expect(mediaUrl(tree.media, 'media/CharlotteBront%C3%AB.jpg')).toBe(
      tree.media.get('CharlotteBrontë.jpg'),
    );
    expect(mediaUrl(tree.media, 'media/second.png')).toBeDefined();
  });

  it('opens a GEDZIP picked together with other files', async () => {
    const zip = zipSync({'gedcom.ged': strToU8(WITH_PERSON)});
    const tree = await load({
      kind: 'files',
      files: [file('x.png', 'x'), file('tree.gdz', zip)],
    });
    expect(tree.source).toEqual({kind: 'gedzip', name: 'tree.gdz'});
  });

  it('opens a zip that was given a .ged name', async () => {
    const zip = zipSync({'gedcom.ged': strToU8(WITH_PERSON)});
    const tree = await load({kind: 'files', files: [file('tree.ged', zip)]});
    expect(tree.source.kind).toBe('gedzip');
  });

  it('reports errors with the codes of the contract', async () => {
    expect(await failure(load({kind: 'files', files: []}))).toBe('NOT_GEDCOM');
    expect(
      await failure(load({kind: 'files', files: [file('a.ged', 'hello')]})),
    ).toBe('NOT_GEDCOM');
    expect(
      await failure(
        load({
          kind: 'files',
          files: [file('a.ged', '<html><body>404</body></html>')],
        }),
      ),
    ).toBe('NOT_GEDCOM');
    expect(
      await failure(
        load({
          kind: 'files',
          files: [
            file(
              'a.ged',
              Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]),
            ),
          ],
        }),
      ),
    ).toBe('NOT_GEDCOM');
    expect(
      await failure(load({kind: 'files', files: [file('a.ged', GED())]})),
    ).toBe('EMPTY');
    expect(
      await failure(
        load({kind: 'files', files: [file('a.ged', GED('0 @F1@ FAM'))]}),
      ),
    ).toBe('EMPTY');
  });

  it('can be aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      load(
        {kind: 'files', files: [file('a.ged', WITH_PERSON)]},
        controller.signal,
      ),
    ).rejects.toMatchObject({name: 'AbortError'});
  });
});

describe('GEDZIP', () => {
  const entries = (extra: Record<string, Uint8Array> = {}) => ({
    'gedcom.ged': strToU8(WITH_PERSON),
    'media/CharlotteBrontë.jpg': strToU8('JPEG'),
    'media/second.png': strToU8('PNG'),
    'other/портрет.jpg': strToU8('JPG2'),
    ...extra,
  });

  it('puts every other entry in the media map under its zip path', async () => {
    const tree = await load({
      kind: 'files',
      files: [file('t.gdz', zipSync(entries()))],
    });
    // the zip paths, plus the spelling of the FILE reference that only matched
    // ignoring case
    expect([...tree.media.keys()].sort()).toEqual([
      'media/CharlotteBrontë.jpg',
      'media/second.png',
      'other/ПОРТРЕТ.JPG',
      'other/портрет.jpg',
    ]);
    expect(created.map((b) => b.size).sort()).toEqual([3, 4, 4]);
  });

  it('matches percent-encoded FILE references to zip entries, then ignoring case', async () => {
    const tree = await load({
      kind: 'files',
      files: [file('t.gdz', zipSync(entries()))],
    });
    const exact = tree.media.get('media/CharlotteBrontë.jpg')!;
    expect(mediaUrl(tree.media, 'media/CharlotteBront%C3%AB.jpg')).toBe(exact);
    expect(mediaUrl(tree.media, 'other/ПОРТРЕТ.JPG')).toBe(
      tree.media.get('other/портрет.jpg'),
    );
    // the reference is also stored under its own decoded spelling
    expect(tree.media.get('other/ПОРТРЕТ.JPG')).toBe(
      tree.media.get('other/портрет.jpg'),
    );
  });

  it('prefers a case-sensitive match', async () => {
    const zip = zipSync(
      entries({
        'media/second.PNG': strToU8('UPPER'),
        'media/Second.png': strToU8('MIXED'),
      }),
    );
    const tree = await load({kind: 'files', files: [file('t.gdz', zip)]});
    expect(mediaUrl(tree.media, 'media/second.png')).toBe(
      tree.media.get('media/second.png'),
    );
    expect(mediaUrl(tree.media, 'media/Second.png')).toBe(
      tree.media.get('media/Second.png'),
    );
    expect(mediaUrl(tree.media, 'media/SECOND.png')).toBeDefined(); // no exact case: any of them
  });

  it('turns backslashes of 5.5.1 paths into slashes', async () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 5.5.1',
      '0 @I1@ INDI',
      '1 OBJE',
      '2 FILE media\\second.png',
      '3 FORM png',
      '0 TRLR',
    ].join('\n');
    const tree = await load({
      kind: 'files',
      files: [
        file(
          't.zip',
          zipSync({
            'gedcom.ged': strToU8(text),
            'media/second.png': strToU8('PNG'),
          }),
        ),
      ],
    });
    expect(mediaUrl(tree.media, 'media\\second.png')).toBe(
      tree.media.get('media/second.png'),
    );
  });

  it('reads zip names that are UTF-8 without the UTF-8 flag', async () => {
    const zip = zipSync(entries());
    // clear general purpose flag bit 11 in every local and central header
    for (let i = 0; i + 4 < zip.length; i++) {
      const local =
        zip[i] === 0x50 &&
        zip[i + 1] === 0x4b &&
        zip[i + 2] === 3 &&
        zip[i + 3] === 4;
      const central =
        zip[i] === 0x50 &&
        zip[i + 1] === 0x4b &&
        zip[i + 2] === 1 &&
        zip[i + 3] === 2;
      if (local) zip[i + 7] = zip[i + 7]! & ~0x08;
      if (central) zip[i + 9] = zip[i + 9]! & ~0x08;
    }
    const unpacked = unpackGedzip(zip);
    expect([...unpacked.files.keys()]).toContain('media/CharlotteBrontë.jpg');
    const tree = await load({kind: 'files', files: [file('t.gdz', zip)]});
    expect(
      mediaUrl(tree.media, 'media/CharlotteBront%C3%AB.jpg'),
    ).toBeDefined();
  });

  it('finds the dataset: gedcom.ged, else the only .ged, else the only one at the root', () => {
    const ged = strToU8(WITH_PERSON);
    expect(
      unpackGedzip(zipSync({'gedcom.ged': ged, 'other.ged': ged})).gedcomName,
    ).toBe('gedcom.ged');
    expect(unpackGedzip(zipSync({'GEDCOM.GED': ged})).gedcomName).toBe(
      'GEDCOM.GED',
    );
    expect(
      unpackGedzip(zipSync({'tree/my.ged': ged, 'media/a.jpg': ged}))
        .gedcomName,
    ).toBe('tree/my.ged');
    expect(
      unpackGedzip(zipSync({'my.ged': ged, 'old/backup.ged': ged})).gedcomName,
    ).toBe('my.ged');
    expect(() => unpackGedzip(zipSync({'a.ged': ged, 'b.ged': ged}))).toThrow(
      /no gedcom\.ged/,
    );
  });

  it('ignores directories and the junk of macOS', () => {
    const unpacked = unpackGedzip(
      zipSync({
        'gedcom.ged': strToU8(WITH_PERSON),
        '__MACOSX/._gedcom.ged': strToU8('x'),
        'media/.DS_Store': strToU8('x'),
        'media/a.jpg': strToU8('x'),
      }),
    );
    expect([...unpacked.files.keys()]).toEqual(['media/a.jpg']);
  });

  it('reports archives without a dataset and damaged archives', async () => {
    expect(
      await failure(
        load({
          kind: 'files',
          files: [file('t.gdz', zipSync({'media/a.jpg': strToU8('x')}))],
        }),
      ),
    ).toBe('NO_GEDCOM_IN_ZIP');
    expect(
      await failure(
        load({
          kind: 'files',
          files: [
            file(
              't.gdz',
              zipSync({'a.ged': strToU8(GED()), 'b.ged': strToU8(GED())}),
            ),
          ],
        }),
      ),
    ).toBe('NO_GEDCOM_IN_ZIP');
    expect(
      await failure(
        load({
          kind: 'files',
          files: [file('t.gdz', 'PK\x03\x04 this is not a zip')],
        }),
      ),
    ).toBe('NOT_GEDCOM');
    expect(
      await failure(
        load({
          kind: 'files',
          files: [file('t.gdz', zipSync({'gedcom.ged': strToU8(GED())}))],
        }),
      ),
    ).toBe('EMPTY');
  });

  it('recognises zip data', () => {
    expect(looksLikeZip(zipSync({a: strToU8('x')}))).toBe(true);
    expect(looksLikeZip(strToU8('0 HEAD'))).toBe(false);
  });
});

describe('URL', () => {
  const respond = (body: string | Uint8Array, init: ResponseInit = {}) =>
    new Response(
      (typeof body === 'string' ? strToU8(body) : body) as BodyInit,
      init,
    );
  const loadWith = (fetchImpl: typeof fetch, extra = {}) =>
    createLoadTree({
      fetch: fetchImpl,
      createObjectUrl: () => 'blob:x',
      ...extra,
    });

  it('fetches a .ged with a plain request and names the tree after the file', async () => {
    const fetchMock = vi.fn(async () => respond(WITH_PERSON));
    const tree = await loadWith(fetchMock as unknown as typeof fetch)({
      kind: 'url',
      url: 'https://example.com/trees/Sokolov%20family.ged?x=1',
    });
    expect(tree.source).toEqual({kind: 'url', name: 'Sokolov family.ged'});
    expect(tree.indis.size).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://example.com/trees/Sokolov%20family.ged?x=1');
    expect(init).toMatchObject({
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  });

  it('opens a GEDZIP from a URL', async () => {
    const zip = zipSync({
      'gedcom.ged': strToU8(WITH_PERSON),
      'media/second.png': strToU8('PNG'),
    });
    const tree = await loadWith((async () => respond(zip)) as typeof fetch)({
      kind: 'url',
      url: 'https://example.com/t.gdz',
    });
    expect(tree.source).toEqual({kind: 'gedzip', name: 't.gdz'});
    expect(tree.media.size).toBeGreaterThan(0);
  });

  it('NETWORK for failed requests, bad status and bad addresses', async () => {
    const down = loadWith((async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch);
    expect(
      await failure(down({kind: 'url', url: 'https://example.com/a.ged'})),
    ).toBe('NETWORK');
    const notFound = loadWith((async () =>
      respond('no', {status: 404})) as typeof fetch);
    expect(
      await failure(notFound({kind: 'url', url: 'https://example.com/a.ged'})),
    ).toBe('NETWORK');
    const ok = loadWith((async () => respond(WITH_PERSON)) as typeof fetch);
    expect(await failure(ok({kind: 'url', url: 'not a url'}))).toBe('NETWORK');
    expect(await failure(ok({kind: 'url', url: 'file:///etc/passwd'}))).toBe(
      'NETWORK',
    );
    expect(await failure(ok({kind: 'url', url: 'javascript:alert(1)'}))).toBe(
      'NETWORK',
    );
  });

  it('NOT_GEDCOM for a page that is not a tree', async () => {
    const html = loadWith((async () =>
      respond('<!doctype html><title>x</title>')) as typeof fetch);
    expect(
      await failure(html({kind: 'url', url: 'https://example.com/'})),
    ).toBe('NOT_GEDCOM');
  });

  it('TOO_LARGE by Content-Length and by what actually arrives', async () => {
    const declared = loadWith((async () =>
      respond('x', {
        headers: {'content-length': '999999999'},
      })) as typeof fetch);
    expect(
      await failure(declared({kind: 'url', url: 'https://example.com/a.ged'})),
    ).toBe('TOO_LARGE');
    const small = loadWith((async () => respond(WITH_PERSON)) as typeof fetch, {
      maxUrlBytes: 20,
    });
    expect(
      await failure(small({kind: 'url', url: 'https://example.com/a.ged'})),
    ).toBe('TOO_LARGE');
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(10));
      },
    });
    const endless = loadWith(
      (async () => new Response(stream)) as typeof fetch,
      {maxUrlBytes: 100},
    );
    expect(
      await failure(endless({kind: 'url', url: 'https://example.com/a.ged'})),
    ).toBe('TOO_LARGE');
  });

  it('the default limit is 200 MB', async () => {
    const {MAX_URL_BYTES} = await import('./index');
    expect(MAX_URL_BYTES).toBe(200 * 1024 * 1024);
  });

  it('can be aborted', async () => {
    const controller = new AbortController();
    const slow = loadWith(
      ((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener('abort', () =>
            reject(init.signal!.reason),
          );
        })) as unknown as typeof fetch,
    );
    const pending = slow(
      {kind: 'url', url: 'https://example.com/a.ged'},
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({name: 'AbortError'});
  });
});

describe('revokeTreeMedia', () => {
  it('releases each blob URL once', () => {
    const spy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    revokeTreeMedia(
      new Map([
        ['a', 'blob:1'],
        ['b', 'blob:1'],
        ['c', 'blob:2'],
        ['d', 'https://x/y.jpg'],
      ]),
    );
    expect(spy.mock.calls.map((c) => c[0])).toEqual(['blob:1', 'blob:2']);
  });
});

describe('the official GEDZIP examples', () => {
  const DIR = join(import.meta.dirname, '../../tests/fixtures/gedcom70');
  it('maximal70.gdz and the unpacked maximal70.ged agree', async () => {
    const gdz = await load({
      kind: 'files',
      files: [file('maximal70.gdz', readFileSync(join(DIR, 'maximal70.gdz')))],
    });
    const ged = await load({
      kind: 'files',
      files: [file('maximal70.ged', readFileSync(join(DIR, 'maximal70.ged')))],
    });
    expect([...gdz.indis.keys()]).toEqual([...ged.indis.keys()]);
    expect(gdz.parse.version).toEqual(ged.parse.version);
  });
});
