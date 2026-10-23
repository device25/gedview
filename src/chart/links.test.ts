import {describe, expect, it} from 'vitest';
import type {ChartSettings, ChildLinkStatus} from '../gedcom/types';
import {childLinkOf, linkInfo, linkLook, type LinkNode} from './links';

type Data = LinkNode['data'];
const node = (
  id: string,
  generation: number,
  data: Partial<Data> = {},
  parent?: LinkNode,
): LinkNode => ({id, parent, data: {generation, ...data}});

describe('childLinkOf', () => {
  // Parents F1 (father I1, mother I2); their child is I3, married to I4.
  const parents = node('F1', 0, {
    indi: {id: 'I1'},
    spouse: {id: 'I2'},
    family: {id: 'F1'},
  });

  it('descendants: the node below holds the child as its person', () => {
    const child = node(
      'F2',
      1,
      {indi: {id: 'I3'}, spouse: {id: 'I4'}},
      parents,
    );
    expect(childLinkOf(child, 'hourglass')).toMatchObject({
      famId: 'F1',
      childId: 'I3',
      childRole: 'indi',
      parentNode: parents,
      childNode: child,
    });
  });

  it('ancestors: the hierarchy parent is the child, and the spouse may be the one', () => {
    // Ancestors are laid out upside down: generation -1 is above generation 0.
    const root = node('F2', 0, {
      indi: {id: 'I3'},
      spouse: {id: 'I4'},
      family: {id: 'F2'},
      spouseParentNodeId: 'F1x',
    });
    const mothersParents = node(
      'F1x',
      -1,
      {indi: {id: 'I1'}, spouse: {id: 'I2'}, family: {id: 'F1'}},
      root,
    );
    expect(childLinkOf(mothersParents, 'relatives')).toMatchObject({
      famId: 'F1',
      childId: 'I4',
      childRole: 'spouse',
    });
    const fathersParents = node(
      'F9',
      -1,
      {indi: {id: 'I7'}, spouse: {id: 'I8'}, family: {id: 'F9'}},
      root,
    );
    expect(childLinkOf(fathersParents, 'hourglass')).toMatchObject({
      famId: 'F9',
      childId: 'I3',
      childRole: 'indi',
    });
  });

  it('fan chart: the hierarchy child is always the child (upside down layout)', () => {
    const root = node('F1', 0, {indi: {id: 'I1'}, family: {id: 'F1'}});
    // Topola's upside-down layout gives descendants negative generations.
    const child = node('I3', -1, {indi: {id: 'I3'}}, root);
    expect(childLinkOf(child, 'fancy')).toMatchObject({
      famId: 'F1',
      childId: 'I3',
    });
    // With the generation rule the same pair would be read backwards.
    expect(childLinkOf(child, 'hourglass')).toBeUndefined();
  });

  it('has no child link for the root, a second marriage or a nodeless family', () => {
    expect(childLinkOf(parents, 'hourglass')).toBeUndefined();
    const second = node(
      'F3',
      1,
      {indi: {id: 'I3'}, additionalMarriage: true},
      parents,
    );
    expect(childLinkOf(second, 'hourglass')).toBeUndefined();
    const noFamily = node('x', 0, {indi: {id: 'I5'}});
    const orphan = node('y', 1, {indi: {id: 'I6'}}, noFamily);
    expect(childLinkOf(orphan, 'hourglass')).toBeUndefined();
  });
});

describe('linkLook', () => {
  const settings = (patch: Partial<ChartSettings> = {}) => ({
    dashChallenged: true,
    disproven: 'hide' as const,
    ...patch,
  });
  const look = (s: ChildLinkStatus | undefined, p?: Partial<ChartSettings>) =>
    linkLook(s, settings(p));

  it('proven and unmarked links are solid', () => {
    expect(look('PROVEN')).toBe('solid');
    expect(look(undefined)).toBe('solid');
  });

  it('challenged links are dashed unless dashing is off', () => {
    expect(look('CHALLENGED')).toBe('dashed');
    expect(look('CHALLENGED', {dashChallenged: false})).toBe('solid');
  });

  it('disproven links are dotted, or hidden', () => {
    expect(look('DISPROVEN', {disproven: 'dotted'})).toBe('dotted');
    expect(look('DISPROVEN', {disproven: 'hide'})).toBe('hidden');
  });
});

describe('linkInfo', () => {
  const tree = {
    childLinkStatus: new Map([
      ['F1|I3', {status: 'CHALLENGED' as const, phrase: 'by the 1890 list'}],
    ]),
  };
  it('reads the status and phrase of "famId|indiId"', () => {
    expect(
      linkInfo(tree, {dashChallenged: true, disproven: 'hide'}, 'F1', 'I3'),
    ).toEqual({
      look: 'dashed',
      status: 'CHALLENGED',
      phrase: 'by the 1890 list',
    });
    expect(
      linkInfo(tree, {dashChallenged: true, disproven: 'hide'}, 'F1', 'I9'),
    ).toEqual({look: 'solid', status: undefined, phrase: undefined});
  });
});
