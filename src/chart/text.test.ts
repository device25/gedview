import {describe, expect, it} from 'vitest';
import {wrapName} from './text';

// Every character is 10 px wide.
const measure = (s: string) => s.length * 10;

describe('wrapName', () => {
  it('keeps a short name on one line', () => {
    expect(wrapName('Иван Соколов', 200, measure)).toEqual(['Иван Соколов']);
  });

  it('breaks at spaces onto a second line', () => {
    expect(wrapName('Александра Ивановна Соколова', 200, measure)).toEqual([
      'Александра Ивановна',
      'Соколова',
    ]);
  });

  it('ends the last line with an ellipsis when the name does not fit', () => {
    const lines = wrapName('Aaaaaaaa Bbbbbbbb Cccccccc Dddddddd', 100, measure);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('Aaaaaaaa');
    expect(lines[1]!.endsWith('…')).toBe(true);
    expect(measure(lines[1]!)).toBeLessThanOrEqual(100);
  });

  it('cuts a single word that is wider than the line', () => {
    const [line] = wrapName('Aaaaaaaaaaaaaaaaaaaa', 100, measure);
    expect(line!.endsWith('…')).toBe(true);
    expect(measure(line!)).toBeLessThanOrEqual(100);
  });

  it('never returns an empty list', () => {
    expect(wrapName('', 100, measure)).toEqual(['']);
  });
});
