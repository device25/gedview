// Draws a chart with topola into jsdom, for tests (never shipped).
import {select} from 'd3-selection';
import {
  FancyChart,
  HourglassChart,
  JsonDataProvider,
  RelativesChart,
  type Chart,
  type ChartInfo,
  type ChartOptions,
} from 'topola';
import type {ChartSettings, ChartView, LoadedTree} from '../gedcom/types';
import {buildChartData} from '../model/chart';
import {SETTINGS} from '../model/test-utils';
import {childLinkOf, linkInfo, type ChildLink, type LinkNode} from './links';
import {GedviewRenderer} from './renderer';
import {getIntl} from '../i18n';

const CHARTS: Record<ChartView, new (o: ChartOptions) => Chart> = {
  hourglass: HourglassChart,
  relatives: RelativesChart,
  fancy: FancyChart,
};

export interface Drawn {
  renderer: GedviewRenderer;
  info: ChartInfo;
  /** Every link path with the child link it draws. */
  links: Array<{
    el: SVGPathElement;
    link: ChildLink | undefined;
    look: string;
  }>;
  svg: SVGSVGElement;
}

export function drawChart(
  tree: LoadedTree,
  view: ChartView,
  startIndi: string,
  settings: Partial<ChartSettings> = {},
): Drawn {
  document.body.innerHTML = '<svg id="chart"></svg>';
  const merged = {...SETTINGS, ...settings};
  const data = new JsonDataProvider(buildChartData(tree, merged));
  const renderer = new GedviewRenderer(
    {data, horizontal: false},
    {
      tree,
      settings: merged,
      intl: getIntl('ru'),
      measure: (s) => s.length * 7.5,
      selectedId: () => startIndi,
    },
  );
  const info = new CHARTS[view]({
    data,
    renderer,
    svgSelector: '#chart',
    startIndi,
    animate: false,
    horizontal: false,
  }).render();
  const links: Drawn['links'] = [];
  select<SVGSVGElement, unknown>('#chart')
    .selectAll<SVGPathElement, LinkNode>('path.link, path.branch')
    .each(function (d) {
      const link = childLinkOf(d, view);
      links.push({
        el: this,
        link,
        look: link
          ? linkInfo(tree, merged, link.famId, link.childId).look
          : 'solid',
      });
    });
  return {
    renderer,
    info,
    links,
    svg: document.querySelector<SVGSVGElement>('#chart')!,
  };
}
