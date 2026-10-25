// Files dropped on the window, folders included: a dropped folder is walked
// (its hidden folders such as .git skipped), and each file keeps its path
// inside the folder, as a picked folder gives it.

/** A file with its path inside a dropped or picked folder. */
export type PathedFile = File & {relativePath?: string};

const hidden = (name: string) => name.startsWith('.') || name === '__MACOSX';

function fileOf(entry: FileSystemFileEntry, path: string): Promise<File> {
  return new Promise((resolve, reject) =>
    entry.file((f) => {
      (f as PathedFile).relativePath = path;
      resolve(f);
    }, reject),
  );
}

async function entriesOf(dir: FileSystemDirectoryEntry) {
  const reader = dir.createReader();
  const all: FileSystemEntry[] = [];
  // readEntries returns them in batches until an empty one.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) return all;
    all.push(...batch);
  }
}

async function walk(entry: FileSystemEntry, path: string): Promise<File[]> {
  if (entry.isFile) return [await fileOf(entry as FileSystemFileEntry, path)];
  if (!entry.isDirectory) return [];
  const children = await entriesOf(entry as FileSystemDirectoryEntry);
  const nested = await Promise.all(
    children
      .filter((c) => !hidden(c.name))
      .map((c) => walk(c, `${path}/${c.name}`)),
  );
  return nested.flat();
}

/** The files of a drop: dropped files as they are, folders walked. */
export async function droppedFiles(data: DataTransfer): Promise<File[]> {
  const entries = Array.from(data.items ?? [])
    .filter((i) => i.kind === 'file')
    .map((i) => i.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => !!e);
  if (!entries.some((e) => e.isDirectory)) return Array.from(data.files);
  const files = await Promise.all(entries.map((e) => walk(e, e.name)));
  return files.flat();
}
