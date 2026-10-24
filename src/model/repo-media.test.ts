import {describe, expect, it} from 'vitest';
import {mediaEntries} from '../ui/media';
import {doc7, treeOf} from './test-utils';

const tree = treeOf(
  doc7(
    '0 @R1@ REPO',
    '1 NAME Центральный государственный архив',
    '1 ADDR ул. Профсоюзная, 82',
    '2 CITY Москва',
    '2 CTRY Россия',
    '1 WWW https://archives.example.test',
    '1 NOTE Читальный зал по записи.',
    '0 @S1@ SOUR',
    '1 TITL Фотоархив семьи',
    '1 REPO @R1@',
    '1 OBJE @O1@',
    '0 @O1@ OBJE',
    '1 FILE https://images.example.test/1.jpg',
    '2 FORM image/jpeg',
    '1 NOTE На обороте: «Мама и папа».',
    '1 SOUR @S1@',
    '2 PAGE альбом 2',
    '2 DATA',
    '3 DATE 1936',
    '1 EXID 42',
    '2 TYPE https://photos.example.test/id',
    '0 @I1@ INDI',
    '1 OBJE @O1@',
  ),
);

describe('the archive of a source', () => {
  it('has its address, site and notes', () => {
    const repo = tree.sources!.get('S1')!.repositories[0]!;
    expect(repo.address).toBe('ул. Профсоюзная, 82, Москва, Россия');
    expect(repo.websites).toEqual(['https://archives.example.test']);
    expect(repo.repoNotes?.[0]?.text).toBe('Читальный зал по записи.');
  });
});

describe('a media record', () => {
  const link = tree.indis.get('I1')!.media[0]!;

  it('has its notes, sources and ids', () => {
    expect(link.notes?.[0]?.text).toBe('На обороте: «Мама и папа».');
    expect(link.citations?.[0]?.page).toBe('альбом 2');
    expect(link.exids?.[0]?.value).toBe('42');
  });

  it('does not loop when its source shows the same file', () => {
    // S1 shows O1, which cites S1: the file inside the source has no details.
    expect(tree.sources!.get('S1')!.media[0]?.objectId).toBe('O1');
  });

  it('takes its year from its source when nothing else gives one', () => {
    const [entry] = mediaEntries(tree, tree.indis.get('I1')!, {
      hide: true,
      allowRemote: true,
    });
    expect(entry?.year).toBe(1936);
  });
});
