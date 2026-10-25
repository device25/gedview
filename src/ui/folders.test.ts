import {describe, expect, it} from 'vitest';
import {droppedFiles} from './folders';

/** A fake dropped folder: names to contents, «/» for nesting. */
function folderEntry(name: string, tree: Record<string, unknown>): unknown {
  const entry = (n: string, v: unknown, path: string): unknown =>
    typeof v === 'string'
      ? {
          name: n,
          isFile: true,
          isDirectory: false,
          file: (ok: (f: File) => void) => ok(new File([v], n)),
        }
      : {
          name: n,
          isFile: false,
          isDirectory: true,
          createReader: () => {
            let done = false;
            return {
              readEntries: (ok: (e: unknown[]) => void) => {
                const list = done
                  ? []
                  : Object.entries(v as Record<string, unknown>).map(([k, c]) =>
                      entry(k, c, `${path}/${k}`),
                    );
                done = true;
                ok(list);
              },
            };
          },
        };
  return entry(name, tree, name);
}

describe('droppedFiles', () => {
  it('walks a dropped folder, keeps paths and skips hidden folders', async () => {
    const root = folderEntry('familia', {
      'tree.ged': '0 HEAD',
      media: {'a.jpg': 'JPEG'},
      '.git': {objects: {'x.pack': 'PACK'}},
      '.claude': {'tree.ged': 'copy'},
    });
    const data = {
      items: [{kind: 'file', webkitGetAsEntry: () => root}],
      files: [],
    } as unknown as DataTransfer;
    const files = await droppedFiles(data);
    expect(
      files.map((f) => (f as File & {relativePath?: string}).relativePath),
    ).toEqual(['familia/tree.ged', 'familia/media/a.jpg']);
  });

  it('gives dropped files as they are when there is no folder', async () => {
    const file = new File(['0 HEAD'], 'tree.ged');
    const data = {
      items: [
        {
          kind: 'file',
          webkitGetAsEntry: () => ({
            name: 'tree.ged',
            isFile: true,
            isDirectory: false,
          }),
        },
      ],
      files: [file],
    } as unknown as DataTransfer;
    expect(await droppedFiles(data)).toEqual([file]);
  });
});
