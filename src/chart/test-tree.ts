// A generated family tree for tests (never shipped): couples in generations,
// each couple has two to four children, each child marries a newcomer.
import {treeOf} from '../model/test-utils';
import type {LoadedTree} from '../gedcom/types';

const GIVEN_M = ['Иван', 'Пётр', 'Николай', 'Семён', 'Фёдор', 'Андрей'];
const GIVEN_F = ['Мария', 'Анна', 'Евдокия', 'Пелагея', 'Ольга', 'Татьяна'];

/** GEDCOM 7.0 text of a tree of about `people` persons. */
export function generateGedcom(people: number): string {
  const lines: string[] = ['0 HEAD', '1 GEDC', '2 VERS 7.0'];
  const indi: string[][] = [];
  const fams: string[][] = [];
  let n = 0;
  const person = (sex: 'M' | 'F', gen: number, famc?: string) => {
    const id = `I${++n}`;
    const given = (sex === 'M' ? GIVEN_M : GIVEN_F)[n % 6]!;
    indi.push([
      `0 @${id}@ INDI`,
      `1 NAME ${given} /Род${gen}/`,
      `1 SEX ${sex}`,
      '1 BIRT',
      `2 DATE ${1700 + 25 * gen + (n % 9)}`,
      ...(famc ? [`1 FAMC @${famc}@`] : []),
    ]);
    return indi.length - 1;
  };
  const queue: Array<{fam: number; gen: number}> = [];
  const family = (husb: number, wife: number, gen: number) => {
    const id = `F${fams.length + 1}`;
    fams.push([
      `0 @${id}@ FAM`,
      `1 HUSB @I${husb + 1}@`,
      `1 WIFE @I${wife + 1}@`,
    ]);
    indi[husb]!.push(`1 FAMS @${id}@`);
    indi[wife]!.push(`1 FAMS @${id}@`);
    queue.push({fam: fams.length - 1, gen});
    return id;
  };
  family(person('M', 0), person('F', 0), 0);
  let qi = 0;
  while (n < people && qi < queue.length) {
    const {fam, gen} = queue[qi++]!;
    const famId = `F${fam + 1}`;
    const kids = 2 + (fam % 3);
    for (let k = 0; k < kids && n < people; k++) {
      const sex = k % 2 === 0 ? 'M' : 'F';
      const child = person(sex, gen + 1, famId);
      fams[fam]!.push(`1 CHIL @I${child + 1}@`);
      // Every third link is disputed, to exercise link styling.
      if (child % 3 === 0) {
        const famc = indi[child]!.findIndex((l) => l.startsWith('1 FAMC'));
        indi[child]!.splice(famc + 1, 0, '2 STAT CHALLENGED');
      }
      const spouse = person(sex === 'M' ? 'F' : 'M', gen + 1);
      if (sex === 'M') family(child, spouse, gen + 1);
      else family(spouse, child, gen + 1);
    }
  }
  for (const block of [...indi, ...fams]) lines.push(...block);
  lines.push('0 TRLR');
  return lines.join('\n');
}

export function generateTree(people: number): LoadedTree {
  return treeOf(generateGedcom(people));
}
