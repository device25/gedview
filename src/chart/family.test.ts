import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {getIntl} from '../i18n';
import {SETTINGS, treeOf, doc7} from '../model/test-utils';
import {familyBox, marriageOrder} from './family';

const tree = treeOf(
  readFileSync(
    join(import.meta.dirname, '../../tests/fixtures/synthetic/marriages.ged'),
    'utf8',
  ),
);
const ctx = {tree, settings: SETTINGS, intl: getIntl('ru')};

describe('familyBox', () => {
  it('a marriage: ⚭, the year and the place', () => {
    expect(familyBox(ctx, 'F1')).toMatchObject({
      married: true,
      line1: '1912',
      line2: 'Старица',
    });
  });

  it('a divorce goes on the second line, the place joins the year', () => {
    const box = familyBox(ctx, 'F2')!;
    expect(box).toMatchObject({line1: '1934, Калинин', line2: 'развод 1937'});
    expect(box.label).toBe(
      'Брак: Николай Иванович Соколов и Зоя Андреевна Белова, 1934, Калинин, развод 1937',
    );
  });

  it('an engagement without a marriage, in words', () => {
    expect(familyBox(ctx, 'F4')).toMatchObject({
      married: false,
      line1: 'Помолвка 1938',
    });
  });

  it('nothing when the file says nothing; «Не в браке» when it says so', () => {
    const t = treeOf(
      doc7(
        '0 @A@ INDI',
        '1 FAMS @F1@',
        '0 @B@ INDI',
        '1 FAMS @F1@',
        '1 FAMS @F2@',
        '0 @C@ INDI',
        '1 FAMS @F2@',
        '0 @F1@ FAM',
        '1 HUSB @A@',
        '1 WIFE @B@',
        '0 @F2@ FAM',
        '1 HUSB @C@',
        '1 WIFE @B@',
        '1 NO MARR',
      ),
    );
    const c = {...ctx, tree: t};
    expect(familyBox(c, 'F1')).toBeUndefined();
    expect(familyBox(c, 'F2')).toMatchObject({line1: 'Не в браке'});
  });

  it('a restricted family shows nothing when restricted details are hidden', () => {
    const t = treeOf(
      doc7('0 @F1@ FAM', '1 RESN CONFIDENTIAL', '1 MARR', '2 DATE 1900'),
    );
    expect(
      familyBox(
        {...ctx, tree: t, settings: {...SETTINGS, hideRestricted: true}},
        'F1',
      ),
    ).toBeUndefined();
  });

  it('speaks English in English', () => {
    expect(familyBox({...ctx, intl: getIntl('en')}, 'F2')!.line2).toBe(
      'divorced 1937',
    );
  });
});

describe('marriageOrder', () => {
  const nikolai = tree.indis.get('I3')!;
  const all = () => true;
  it('numbers the drawn marriages by year', () => {
    expect(marriageOrder(tree, nikolai, 'F2', all)).toBe(1);
    expect(marriageOrder(tree, nikolai, 'F3', all)).toBe(2);
  });
  it('says nothing for one marriage, or when the other is not drawn', () => {
    expect(
      marriageOrder(tree, tree.indis.get('I1')!, 'F1', all),
    ).toBeUndefined();
    expect(
      marriageOrder(tree, nikolai, 'F3', (f) => f === 'F3'),
    ).toBeUndefined();
  });
});
