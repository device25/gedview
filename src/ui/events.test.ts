import {describe, expect, it} from 'vitest';
import type {Role} from '../gedcom/types';
import {getIntl} from '../i18n';
import {roleLabel} from './events';

const ru = getIntl('ru');
const en = getIntl('en');

const ROLES: Role[] = [
  'CHIL',
  'CLERGY',
  'FATH',
  'FRIEND',
  'GODP',
  'HUSB',
  'MOTH',
  'MULTIPLE',
  'NGHBR',
  'OFFICIATOR',
  'PARENT',
  'SPOU',
  'WIFE',
  'WITN',
  'OTHER',
];

describe('roleLabel', () => {
  it('has a label for every role of the 7.0 enumeration in both languages', () => {
    for (const role of ROLES) {
      expect(ru.messages).toHaveProperty([`role.${role}`]);
      expect(en.messages).toHaveProperty([`role.${role}`]);
      expect(roleLabel(ru, {role}), role).not.toBe(role);
      expect(roleLabel(en, {role}), role).not.toBe(role);
    }
  });

  it('uses Russian gendered forms when the sex is known', () => {
    const pick = (role: Role, sex?: 'M' | 'F' | 'X' | 'U') =>
      roleLabel(ru, {role}, sex);
    expect(pick('GODP', 'M')).toBe('Крёстный');
    expect(pick('GODP', 'F')).toBe('Крёстная');
    expect(pick('GODP')).toBe('Крёстный родитель');
    expect(pick('GODP', 'U')).toBe('Крёстный родитель');
    expect(pick('WITN', 'M')).toBe('Свидетель');
    expect(pick('WITN', 'F')).toBe('Свидетельница');
    expect(pick('FRIEND', 'F')).toBe('Подруга');
    expect(pick('FRIEND', 'M')).toBe('Друг');
    expect(pick('NGHBR', 'F')).toBe('Соседка');
    expect(pick('OFFICIATOR')).toBe('Совершивший обряд');
    expect(pick('CLERGY', 'M')).toBe('Священник');
    expect(pick('SPOU')).toBe('Супруг(а)');
    expect(pick('SPOU', 'F')).toBe('Супруга');
    expect(pick('FATH')).toBe('Отец');
    expect(pick('MOTH')).toBe('Мать');
    expect(pick('PARENT')).toBe('Родитель');
    expect(pick('HUSB')).toBe('Муж');
    expect(pick('WIFE')).toBe('Жена');
    expect(pick('CHIL')).toBe('Ребёнок');
    expect(pick('MULTIPLE')).toBe('Несколько ролей');
  });

  it('lets a role phrase override the label', () => {
    expect(roleLabel(ru, {role: 'OTHER', rolePhrase: 'свояченица'})).toBe(
      'свояченица',
    );
    expect(
      roleLabel(ru, {role: 'GODP', rolePhrase: 'крёстный жениха'}, 'M'),
    ).toBe('крёстный жениха');
    expect(roleLabel(ru, {role: 'OTHER'})).toBe('Другая роль');
  });

  it('shows 5.5.1 relations and extension roles as written', () => {
    expect(roleLabel(ru, {rolePhrase: 'Friend'})).toBe('Friend');
    expect(roleLabel(ru, {role: '_BESTMAN'})).toBe('_BESTMAN');
    expect(roleLabel(ru, {})).toBe('');
  });
});
