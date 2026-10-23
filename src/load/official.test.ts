import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {createLoadTree, isLoadError} from '../load';
import {treeFromBytes} from '../model';

const DIR = join(import.meta.dirname, '../../tests/fixtures/gedcom70');
const names = readdirSync(DIR).filter((n) => /\.(ged|gdz)$/.test(n));

describe('official FamilySearch test files', () => {
  it('are all present (24)', () => {
    expect(names).toHaveLength(24);
  });

  for (const name of names.filter((n) => n.endsWith('.ged'))) {
    it(`${name} parses and builds views without throwing`, () => {
      const bytes = new Uint8Array(readFileSync(join(DIR, name)));
      const tree = treeFromBytes({kind: 'file', name}, bytes);
      expect(tree.parse.records.at(0)?.tag).toBe('HEAD');
      expect(tree.parse.records.at(-1)?.tag).toBe('TRLR');
      expect(tree.parse.version.major).toBe('7');
      // Only the file that exercises warnings may produce any of the
      // problems below.
      const serious = tree.parse.warnings.filter((w) =>
        [
          'BAD_LINE',
          'LEVEL_JUMP',
          'CONC_IN_V7',
          'BAD_DATE',
          'BAD_AGE',
        ].includes(w.code),
      );
      expect(serious, name).toEqual([]);
    });
  }

  it('loads every file through the loader; files without people are EMPTY', async () => {
    const load = createLoadTree({createObjectUrl: () => 'blob:test'});
    for (const name of names) {
      const bytes = readFileSync(join(DIR, name));
      const file = new File([bytes], name);
      let code: string | undefined;
      let people = 0;
      try {
        people = (await load({kind: 'files', files: [file]})).indis.size;
      } catch (error) {
        expect(isLoadError(error), `${name}: ${String(error)}`).toBe(true);
        code = (error as {code: string}).code;
      }
      if (code === undefined) expect(people, name).toBeGreaterThan(0);
      else expect(code, name).toBe('EMPTY');
    }
  });

  it('exactly the files without an INDI record are EMPTY', async () => {
    const noPeople = [
      'filename-1.ged',
      'lang.ged',
      'long-url.ged',
      'minimal70.gdz',
      'minimal70.ged',
      'notes-1.ged',
    ];
    const load = createLoadTree({createObjectUrl: () => 'blob:test'});
    const empty: string[] = [];
    for (const name of names) {
      const file = new File([readFileSync(join(DIR, name))], name);
      try {
        await load({kind: 'files', files: [file]});
      } catch {
        empty.push(name);
      }
    }
    expect(empty.sort()).toEqual(noPeople);
  });

  it('survives damaged copies of a real file', () => {
    const original = readFileSync(join(DIR, 'maximal70.ged'));
    let seed = 12345;
    const random = () =>
      (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let round = 0; round < 200; round++) {
      const bytes = new Uint8Array(original);
      for (let k = 0; k < 20; k++) {
        bytes[Math.floor(random() * bytes.length)] = Math.floor(random() * 256);
      }
      const cut =
        round % 5 === 0 ? Math.floor(random() * bytes.length) : bytes.length;
      expect(() =>
        treeFromBytes({kind: 'file', name: 'x'}, bytes.subarray(0, cut)),
      ).not.toThrow();
    }
  });
});
