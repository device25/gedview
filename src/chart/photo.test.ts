import {describe, expect, it} from 'vitest';
import type {IndiView, LoadedTree, MediaLink} from '../gedcom/types';
import {cropBox, photoOf} from './photo';

const media = (path: string, extra: Partial<MediaLink> = {}): MediaLink => ({
  files: [{path, translations: []}],
  restrictions: [],
  ...extra,
});

const tree = (bundled: Record<string, string> = {}) =>
  ({media: new Map(Object.entries(bundled))}) as unknown as LoadedTree;

const indi = (m: MediaLink[], restrictions: string[] = []) =>
  ({media: m, restrictions}) as unknown as IndiView;

const on = {allowRemote: true, hideRestricted: true};

describe('photoOf', () => {
  it('takes the first image that can be shown', () => {
    const t = tree({'photos/anna.jpg': 'blob:anna'});
    const p = photoOf(
      indi([media('notes.pdf'), media('photos/anna.jpg')]),
      t,
      on,
    );
    expect(p).toEqual({src: 'blob:anna'});
  });

  it('skips linked images when remote loading is off', () => {
    const person = indi([media('https://img.example/a.jpg')]);
    expect(photoOf(person, tree(), on)?.src).toBe('https://img.example/a.jpg');
    expect(
      photoOf(person, tree(), {...on, allowRemote: false}),
    ).toBeUndefined();
  });

  it('never uses unsafe or missing files', () => {
    expect(
      photoOf(indi([media('javascript:alert(1).jpg')]), tree(), on),
    ).toBeUndefined();
    expect(photoOf(indi([media('missing.jpg')]), tree(), on)).toBeUndefined();
    expect(photoOf(undefined, tree(), on)).toBeUndefined();
  });

  it('respects restrictions when they are hidden', () => {
    const t = tree({'a.jpg': 'blob:a'});
    const secret = media('a.jpg', {restrictions: ['PRIVACY']});
    expect(photoOf(indi([secret]), t, on)).toBeUndefined();
    expect(photoOf(indi([secret]), t, {...on, hideRestricted: false})).toEqual({
      src: 'blob:a',
    });
    expect(
      photoOf(indi([media('a.jpg')], ['CONFIDENTIAL']), t, on),
    ).toBeUndefined();
  });

  it('carries the crop', () => {
    const t = tree({'a.jpg': 'blob:a'});
    const crop = {left: 10, top: 20, width: 100, height: 100};
    expect(photoOf(indi([media('a.jpg', {crop})]), t, on)).toEqual({
      src: 'blob:a',
      crop,
    });
  });
});

describe('cropBox', () => {
  it('uses the crop in image pixels', () => {
    expect(cropBox({left: 10, top: 20, width: 100, height: 80})).toEqual([
      10, 20, 100, 80,
    ]);
  });

  it('defaults LEFT and TOP to 0', () => {
    expect(cropBox({width: 50, height: 60})).toEqual([0, 0, 50, 60]);
  });

  it('needs the image size when WIDTH or HEIGHT is missing', () => {
    expect(cropBox({left: 10, top: 20})).toBeUndefined();
    expect(cropBox({left: 10, top: 20}, {width: 200, height: 100})).toEqual([
      10, 20, 190, 80,
    ]);
  });

  it('ignores empty or impossible regions', () => {
    expect(cropBox(undefined)).toBeUndefined();
    expect(cropBox({left: 300}, {width: 200, height: 100})).toBeUndefined();
  });
});
