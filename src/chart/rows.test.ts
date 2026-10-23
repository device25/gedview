// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {H_SPACING, JsonDataProvider, RelativesChart} from 'topola';
import {describe, expect, it} from 'vitest';
import {getIntl} from '../i18n';
import {buildChartData} from '../model/chart';
import {SETTINGS, treeOf} from '../model/test-utils';
import {GedviewRenderer} from './renderer';
import {drawInRows} from './rows';

const tree = treeOf(
  readFileSync(
    join(import.meta.dirname, '../../tests/fixtures/synthetic/rows.ged'),
    'utf8',
  ),
);

interface Node {
  x: number;
  y: number;
  data: {
    width: number;
    generation: number;
    indi?: {id: string; width: number};
    spouse?: {id: string; width: number};
  };
}

/** Lays out the relatives of `root` the way the chart does. */
function layOut(
  root: string,
  older: (id: string) => boolean | undefined = () => undefined,
): Node[] {
  document.body.innerHTML = '<svg id="chart"></svg>';
  const data = new JsonDataProvider(buildChartData(tree, SETTINGS));
  const renderer = new GedviewRenderer(
    {data, horizontal: false},
    {
      tree,
      settings: SETTINGS,
      intl: getIntl('ru'),
      measure: (s) => s.length * 7.5,
      selectedId: () => root,
    },
  );
  const chart = new RelativesChart({
    data,
    renderer,
    svgSelector: '#chart',
    startIndi: root,
    animate: false,
    horizontal: false,
  });
  let laid: Node[] = [];
  const util = (
    chart as unknown as {util: {renderChart: (n: Node[]) => unknown}}
  ).util;
  const draw = util.renderChart.bind(util);
  util.renderChart = (nodes) => {
    laid = nodes;
    return draw(nodes);
  };
  drawInRows(chart, older);
  chart.render();
  return laid;
}

/** Centre of a person's box, and the box's row. */
function at(nodes: Node[], id: string) {
  for (const n of nodes) {
    const left = n.x - n.data.width / 2;
    if (n.data.indi?.id === id) {
      return {x: left + n.data.indi.width / 2, y: n.y};
    }
    if (n.data.spouse?.id === id) {
      return {x: n.x + n.data.width / 2 - n.data.spouse.width / 2, y: n.y};
    }
  }
  throw new Error(`${id} is not on the chart`);
}

const older = (id: string) =>
  ({I9: true, I11: false})[id as 'I9' | 'I11'] ?? undefined;

describe('one row per generation', () => {
  const nodes = layOut('I10', older);

  it('puts brothers and sisters of every ancestor on the ancestor’s row', () => {
    expect(at(nodes, 'I3').y).toBe(at(nodes, 'I4').y);
    expect(at(nodes, 'I8').y).toBe(at(nodes, 'I7').y);
    expect(at(nodes, 'I9').y).toBe(at(nodes, 'I10').y);
    expect(at(nodes, 'I14').y).toBe(at(nodes, 'I10').y);
  });

  it('gives every generation one row', () => {
    const rows = new Map<number, Set<number>>();
    for (const n of nodes) {
      rows.set(
        n.data.generation,
        (rows.get(n.data.generation) ?? new Set()).add(n.y),
      );
    }
    for (const ys of rows.values()) expect(ys.size).toBe(1);
  });

  it('keeps the father’s side left and the mother’s side right', () => {
    expect(at(nodes, 'I3').x).toBeLessThan(at(nodes, 'I4').x);
    expect(at(nodes, 'I8').x).toBeGreaterThan(at(nodes, 'I7').x);
    // The cousin stands outside the root's own brothers and sisters.
    expect(at(nodes, 'I14').x).toBeLessThan(at(nodes, 'I9').x);
  });

  it('puts older brothers and sisters left of the root, younger right', () => {
    expect(at(nodes, 'I9').x).toBeLessThan(at(nodes, 'I10').x);
    expect(at(nodes, 'I11').x).toBeGreaterThan(at(nodes, 'I10').x);
  });

  it('packs a branch next to the ones already placed', () => {
    // The uncle's son stands one gap from the root's older sister: the row
    // where the uncle's branch meets the rest decides where it stands.
    const box = (id: string) => nodes.find((n) => n.data.indi?.id === id)!;
    const cousin = box('I14');
    const sister = box('I9');
    expect(
      sister.x - sister.data.width / 2 - (cousin.x + cousin.data.width / 2),
    ).toBeCloseTo(H_SPACING * 2);
  });

  it('never lets boxes of one row overlap', () => {
    const rows = new Map<number, Node[]>();
    for (const n of nodes) rows.set(n.y, [...(rows.get(n.y) ?? []), n]);
    for (const row of rows.values()) {
      row.sort((a, b) => a.x - b.x);
      for (let i = 1; i < row.length; i++) {
        const a = row[i - 1]!;
        const b = row[i]!;
        expect(a.x + a.data.width / 2).toBeLessThanOrEqual(
          b.x - b.data.width / 2,
        );
      }
    }
  });

  it('sets ancestors over their children', () => {
    const grandparents = at(nodes, 'I1').x;
    expect(grandparents).toBeGreaterThan(at(nodes, 'I3').x - 1);
    expect(grandparents).toBeLessThan(at(nodes, 'I4').x + 1);
  });
});

describe('brothers and sisters without birth dates', () => {
  it('go to the right of the root', () => {
    const nodes = layOut('I10');
    expect(at(nodes, 'I9').x).toBeGreaterThan(at(nodes, 'I10').x);
    expect(at(nodes, 'I11').x).toBeGreaterThan(at(nodes, 'I10').x);
  });
});
