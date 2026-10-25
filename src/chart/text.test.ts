import {describe, expect, it} from 'vitest';
import {wrapLife, wrapName} from './text';

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

describe('wrapLife', () => {
  // As joinRange writes it: a no-break space before the dash.
  const life = 'около 1707\u00a0— между 1757 и 1758';

  it('keeps dates that fit on one line', () => {
    expect(wrapLife('1858—1921', 200, measure, 2)).toEqual(['1858—1921']);
  });

  it('breaks long dates after the dash', () => {
    expect(wrapLife(life, 180, measure, 2)).toEqual([
      'около 1707\u00a0—',
      'между 1757 и 1758',
    ]);
  });

  it('keeps the birth and an ellipsis when one line is left', () => {
    expect(wrapLife(life, 180, measure, 1)).toEqual(['около 1707\u00a0— …']);
  });
});
