// Imperative core of the chart: topola draws into an SVG, d3-zoom moves it.
// React (ChartView) only passes inputs in and receives events out.

import {select, type Selection} from 'd3-selection';
import 'd3-transition';
import {zoom, zoomIdentity, zoomTransform, type ZoomBehavior} from 'd3-zoom';
import type {IntlShape} from 'react-intl';
import {
  HIDE_TIME_MS,
  JsonDataProvider,
  MOVE_TIME_MS,
  RelativesChart,
} from 'topola';
import {dateSortKey} from '../gedcom/date';
import type {ChartSettings, LoadedTree} from '../gedcom/types';
import {buildChartData} from '../model/chart';
import {scopePeople, type ChartScope} from '../model/scope';
import {ZOOM_MAX, ZOOM_MIN} from '../store/reducer';
import {childLinkOf, linkInfo, type ChildLink, type LinkNode} from './links';
import {isNavKey, navigate, type NavBox, type NavEdge} from './nav';
import {drawInRows} from './rows';
import {
  BOX_H,
  FAMILY_GAP,
  GedviewRenderer,
  type RendererContext,
} from './renderer';
import {canvasMeasure} from './text';
import {
  centerXform,
  constrainXform,
  fitScale,
  panIntoView,
  type Size,
  type Xform,
} from './viewport';

/** The fields of a laid-out topola node that routing needs. */
interface RoutedNode {
  x: number;
  y: number;
  data: {width: number; height: number; indi?: {width?: number}} & Parameters<
    GedviewRenderer['getIndiAnchor']
  >[0];
  parent?: {children?: RoutedNode[]} | null;
}

export interface Tip {
  /** Pixels from the left/top of the chart area. */
  x: number;
  y: number;
  text: string;
}

export interface EngineCallbacks {
  onSelect: (id: string) => void;
  /** A click on a person's photo: open it big. */
  onPhoto?: (id: string) => void;
  onZoom: (zoom: number) => void;
  onTip: (tip: Tip | null) => void;
}

export interface EngineInput {
  tree: LoadedTree;
  scope: ChartScope;
  settings: ChartSettings;
  intl: IntlShape;
  selectedId: string;
  zoom: number;
}

/** Quiet time after the last wheel/drag event before the scale is reported. */
const REPORT_DELAY_MS = 120;

const FONT_FAMILY = 'Onest, system-ui, sans-serif';
const FONT_SAMPLE = 'Аа Aa';
/** Below this scale the names are unreadable and are not drawn. */
const FAR_SCALE = 0.35;
/** Fitting never magnifies beyond this. */
const FIT_MAX = 1;
/** Distance from a box edge to the label on its link. */
const PILL_OFFSET = 17;
const PILL_H = 22;

export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Resolves when the box font is usable (or after a short wait). */
function fontReady(): Promise<void> {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;
  if (!fonts || fonts.check(`500 15px Onest`, FONT_SAMPLE)) {
    return Promise.resolve();
  }
  return Promise.race([
    fonts.load(`500 15px Onest`, FONT_SAMPLE),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]).then(
    () => undefined,
    () => undefined,
  );
}

let instances = 0;

/** Family lines closer than this at one height count as running along
 *  each other; such lines are moved this far apart. */
const LANE_GAP = 4;
const LANE_STEP = 7;

/** Whether a person was born before the root; undefined = not known. */
function olderThan(tree: LoadedTree, rootId: string) {
  const born = (id: string) =>
    dateSortKey(
      tree.indis
        .get(id)
        ?.events.find((e) => ['BIRT', 'CHR', 'BAPM'].includes(e.tag))?.date,
    );
  const root = born(rootId);
  return (id: string) => {
    const b = born(id);
    return b === undefined || root === undefined ? undefined : b < root;
  };
}

export class ChartEngine {
  private readonly svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private readonly layer: Selection<SVGGElement, unknown, null, undefined>;
  private readonly inner: Selection<SVGSVGElement, unknown, null, undefined>;
  private readonly innerId = `gv-inner-${++instances}`;
  private readonly zoomBehavior: ZoomBehavior<SVGSVGElement, unknown>;
  private readonly resizer: ResizeObserver;
  private readonly abort = new AbortController();
  private readonly fonts = fontReady();

  private size: Size;
  private chartSize: Size = {w: 1, h: 1};
  /** Where topola's own group sits inside the chart area. */
  private origin: [number, number] = [0, 0];
  /** Where the view is heading: the target of the running animation, or the
   *  current transform when none runs. Motion is planned from it, so that a
   *  new move does not depend on how far an interrupted one got. */
  private goal: Xform = {x: 0, y: 0, k: 1};
  private token = 0;
  private reportTimer = 0;
  /** The last scale reported to the app; its echo must not move the view. */
  private reported = 1;
  private destroyed = false;
  private pendingFit = false;
  private draws = 0;

  private built?: Pick<EngineInput, 'tree' | 'settings'> & {
    scope: string;
    locale: string;
  };
  private renderer?: GedviewRenderer;
  private data?: JsonDataProvider;
  private boxes: NavBox[] = [];
  private edges: NavEdge[] = [];
  private elements = new Map<string, SVGGElement>();
  private pills = new Map<string, SVGGElement>();
  private tabKey?: string;
  private selectedKey?: string;

  constructor(
    private readonly svgEl: SVGSVGElement,
    private readonly callbacks: EngineCallbacks,
  ) {
    this.svg = select(svgEl);
    this.layer = this.svg.append('g').attr('class', 'gv-layer');
    this.inner = this.layer
      .append('svg')
      .attr('class', 'gv-inner')
      .attr('id', this.innerId);
    this.size = this.measureHost();

    this.zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([ZOOM_MIN, ZOOM_MAX])
      .extent(() => [
        [0, 0],
        [this.size.w, this.size.h],
      ])
      .constrain((t) => {
        const c = constrainXform(t, this.chartSize, this.size);
        return zoomIdentity.translate(c.x, c.y).scale(c.k);
      })
      .filter((e: Event) => {
        const ev = e as MouseEvent;
        return (!ev.ctrlKey || e.type === 'wheel') && !ev.button;
      })
      .on('zoom', (e) => {
        const t = e.transform as Xform;
        this.layer.attr('transform', `translate(${t.x} ${t.y}) scale(${t.k})`);
        this.svgEl.classList.toggle('gv-far', t.k < FAR_SCALE);
        this.callbacks.onTip(null);
        if (e.sourceEvent) {
          this.goal = {x: t.x, y: t.y, k: t.k};
          this.scheduleReport();
        }
      });
    this.svg.call(this.zoomBehavior).on('dblclick.zoom', null);

    this.resizer = new ResizeObserver(() => this.onResize());
    this.resizer.observe(this.host());
    this.bindEvents();
  }

  private host(): HTMLElement {
    return (
      this.svgEl.parentElement ?? this.svgEl.ownerSVGElement!.parentElement!
    );
  }

  private measureHost(): Size {
    const r = this.host().getBoundingClientRect();
    return {w: Math.max(1, r.width), h: Math.max(1, r.height)};
  }

  // ------------------------------------------------------------- inputs

  /** Draws the chart for these inputs (re-rooting when only the selected
   *  person changed). Later calls win over earlier, unfinished ones. */
  update(input: EngineInput): void {
    const token = ++this.token;
    void this.fonts.then(() => {
      if (token !== this.token || this.destroyed) return;
      try {
        this.draw(input);
      } catch (error) {
        // A chart that cannot be laid out must not take the app down.
        console.error('Gedview: cannot draw the chart', error);
      }
    });
  }

  /** The zoom factor was changed from outside (the zoom buttons). The app
   *  derives it from the last reported scale, so it is applied as a factor
   *  to the current view; our own report echoed back changes nothing. */
  setZoom(k: number): void {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));
    if (Math.abs(next - this.reported) <= 1e-4 * next) return;
    const g = this.goal;
    const target = Math.min(
      ZOOM_MAX,
      Math.max(ZOOM_MIN, g.k * (next / this.reported)),
    );
    window.clearTimeout(this.reportTimer);
    this.reportTimer = 0;
    this.reported = target;
    if (Math.abs(target - next) > 1e-4 * next) this.callbacks.onZoom(target);
    if (Math.abs(target - g.k) <= 1e-4 * g.k) return;
    if (!this.built) {
      this.goal = {...g, k: target};
      return;
    }
    // Scale about the middle of the view.
    const cx = (this.size.w / 2 - g.x) / g.k;
    const cy = (this.size.h / 2 - g.y) / g.k;
    this.moveTo(centerXform(cx, cy, target, this.size), 150);
  }

  /** Fits the whole chart into the view and reports the resulting scale. */
  fit(): void {
    if (!this.built) {
      this.pendingFit = true;
      return;
    }
    this.pendingFit = false;
    const {k, exact} = fitScale(this.chartSize, this.size, ZOOM_MIN, FIT_MAX);
    // A chart too big for the smallest scale is shown around the selected
    // person rather than around its middle.
    const focus = this.boxes.find((b) => b.key === this.selectedKey);
    const [cx, cy] =
      exact || !focus
        ? [this.chartSize.w / 2, this.chartSize.h / 2]
        : [focus.cx, focus.cy];
    this.moveTo(centerXform(cx, cy, k, this.size));
    this.report(k);
  }

  destroy(): void {
    this.destroyed = true;
    this.token++;
    this.abort.abort();
    this.resizer.disconnect();
    window.clearTimeout(this.reportTimer);
    this.svg.on('.zoom', null).interrupt();
    this.layer.remove();
  }

  // ------------------------------------------------------------ drawing

  private draw(input: EngineInput): void {
    const {tree, scope, settings, intl, selectedId} = input;
    const scopeKey = JSON.stringify(scope);
    const prev = this.built;
    const rebuild =
      !prev ||
      prev.tree !== tree ||
      prev.scope !== scopeKey ||
      prev.settings !== settings ||
      prev.locale !== intl.locale;
    if (!rebuild && selectedId === this.currentSelected) return;
    const hadFocus = this.host().contains(document.activeElement);
    this.callbacks.onTip(null);

    if (rebuild) {
      this.inner.selectAll('*').remove();
      this.pills.clear();
      // One layout for every level: topola's relatives chart, fed with the
      // people of the scope only.
      const keep = scopePeople(tree, settings, scope);
      this.data = new JsonDataProvider(buildChartData(tree, settings, {keep}));
      const ctx: RendererContext = {
        tree,
        settings,
        intl,
        measure: canvasMeasure(`500 15px ${FONT_FAMILY}`, 15),
        selectedId: () => this.currentSelected,
        rootId: scope.rootId,
      };
      this.renderer = new GedviewRenderer(
        {data: this.data, horizontal: false},
        ctx,
      );
      this.goal = {...this.goal, k: input.zoom};
      this.reported = input.zoom;
    }
    this.currentSelected = selectedId;
    const renderer = this.renderer!;
    const animate = !rebuild && !prefersReducedMotion();
    const chart = new RelativesChart({
      data: this.data!,
      renderer,
      svgSelector: `#${this.innerId}`,
      startIndi: scope.rootId,
      animate,
      horizontal: false,
    });
    // One row per generation: the layout is redone between topola's
    // layout and its drawing.
    drawInRows(chart, olderThan(tree, scope.rootId));
    const info = chart.render();
    this.chartSize = {w: info.size[0], h: info.size[1]};
    this.built = {tree, scope: scopeKey, settings, locale: intl.locale};
    this.inner.select('g').selectAll('.gv-pill').remove();
    this.pills.clear();

    const origin = info.origin;
    this.origin = origin;
    const links = this.collect(renderer, origin);
    this.annotate(links, input);
    this.styleLinks(input);
    this.routeCopies(renderer);
    this.laneBars();

    const target = this.boxes.find((b) => b.key === this.selectedKey);
    if (target) {
      const t = centerXform(target.cx, target.cy, this.goal.k, this.size);
      this.moveTo(t, animate ? MOVE_TIME_MS : 0, animate ? HIDE_TIME_MS : 0);
    }
    if (this.pendingFit) this.fit();

    // Roving tab stop and focus.
    const stop =
      this.elements.get(this.selectedKey ?? '') ??
      [...this.elements.values()][0];
    this.setTabStop(stop);
    if (hadFocus) stop?.focus({preventScroll: true});

    // Tests wait for this to know that a draw has finished.
    this.svgEl.dataset.drawn = String(++this.draws);

    const token = this.token;
    void Promise.race([
      info.animationPromise,
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]).then(() => {
      if (token === this.token && !this.destroyed) {
        // An animated update may have moved the paths back: route again.
        this.routeCopies(renderer);
        this.laneBars();
        this.drawPills(links, input);
      }
    });
  }

  private currentSelected = '';

  /** Boxes, parent -> child edges and links of the nodes just drawn. */
  private collect(
    renderer: GedviewRenderer,
    origin: [number, number],
  ): ChildLink[] {
    const [ox, oy] = origin;
    this.boxes = [];
    this.edges = [];
    this.elements.clear();
    const links: ChildLink[] = [];
    const generations = new Map<string, number>();
    const ids = new Map<string, string>();
    for (const node of renderer.nodes) {
      const {indi, spouse, width, height, generation} = node.data;
      const left = ox + node.x - (width ?? 0) / 2;
      const cy = oy + node.y - (height ?? 0) / 2 + BOX_H / 2;
      const add = (role: 'indi' | 'spouse', entry: typeof indi, x: number) => {
        if (!entry) return;
        const key = `${node.id}:${role}`;
        this.boxes.push({
          key,
          node: node.id!,
          cx: left + x + (entry.width ?? 0) / 2,
          cy,
        });
        generations.set(key, Math.abs(generation ?? 0));
        ids.set(key, entry.id);
      };
      add('indi', indi, 0);
      add('spouse', spouse, indi?.width ?? 0);
      const link = childLinkOf(node as unknown as LinkNode);
      if (link) {
        links.push(link);
        this.edges.push({
          parentNode: link.parentNode.id,
          childKey: `${link.childNode.id}:${link.childRole}`,
        });
      }
    }
    this.host()
      .querySelectorAll<SVGGElement>('g.gv-person')
      .forEach((el) => {
        const key = el.dataset.key;
        if (key) this.elements.set(key, el);
      });
    // The selected person's box: the one nearest the chart's root.
    let best = Infinity;
    this.selectedKey = undefined;
    for (const [key, id] of ids) {
      const g = generations.get(key)!;
      if (id === this.currentSelected && g < best) {
        best = g;
        this.selectedKey = key;
      }
    }
    return links;
  }

  /** Link status in the box names and descriptions. */
  private annotate(links: ChildLink[], input: EngineInput): void {
    const {tree, settings, intl} = input;
    for (const link of links) {
      const info = linkInfo(tree, settings, link.famId, link.childId);
      if (info.status !== 'CHALLENGED' && info.status !== 'DISPROVEN') continue;
      const el = this.elements.get(`${link.childNode.id}:${link.childRole}`);
      if (!el) continue;
      const note = intl.formatMessage({
        id:
          info.status === 'CHALLENGED'
            ? 'card.disputedParents'
            : 'card.disprovenParents',
      });
      el.setAttribute(
        'aria-label',
        `${el.getAttribute('aria-label')}, ${note}`,
      );
      el.dataset.tip = info.phrase ? `${note}. ${info.phrase}` : note;
      el.dataset.link = info.status;
      if (info.phrase) {
        const id = `${this.innerId}-d-${link.childNode.id}-${link.childRole}`;
        // aria-describedby wins over aria-description: keep the full life
        // dates the box may carry there in the same description.
        const dates = el.getAttribute('aria-description');
        const text = dates ? `${dates}. ${info.phrase}` : info.phrase;
        select(el).append('desc').attr('id', id).text(text);
        el.setAttribute('aria-describedby', id);
        el.removeAttribute('aria-description');
      }
    }
  }

  /**
   * A person with several marriages is drawn once per marriage, the copies
   * side by side. Topola joins them with a straight line through the
   * spouse's box; this routes it in a lane under the cards instead, from the
   * middle of one copy to the other, hopping over the first family's line.
   */
  private routeCopies(renderer: GedviewRenderer): void {
    this.inner
      .select('g')
      .selectAll<SVGPathElement, LinkNode>('path.link.additional-marriage')
      .attr('d', (d) => {
        const node = d as unknown as RoutedNode;
        const siblings = node.parent?.children ?? [];
        const prev = siblings[siblings.findIndex((n) => n === node) - 1];
        if (!prev) return '';
        const top = node.y - node.data.height / 2;
        const lane = top + BOX_H + FAMILY_GAP / 2;
        const x1 = prev.x + renderer.getIndiAnchor(prev.data)[0];
        const x2 = node.x + renderer.getIndiAnchor(node.data)[0];
        const hop = prev.x - prev.data.width / 2 + (prev.data.indi?.width ?? 0);
        const bottom = top + BOX_H;
        const gap = hop > x1 && hop < x2;
        return gap
          ? `M${x1} ${bottom}V${lane}H${hop - 6}M${hop + 6} ${lane}H${x2}V${bottom}`
          : `M${x1} ${bottom}V${lane}H${x2}V${bottom}`;
      });
  }

  /**
   * Families whose lines to their children would run along each other at
   * one height get heights of their own, a few pixels apart, so each line
   * can be followed to its children.
   */
  private laneBars(): void {
    interface Bar {
      y: number;
      x0: number;
      x1: number;
      /** Shortest drop from the parents to a child. */
      span: number;
      paths: Array<{el: SVGPathElement; pts: number[][]}>;
    }
    const bars = new Map<string, Bar>();
    this.inner
      .select('g')
      .selectAll<SVGPathElement, unknown>('path.link:not(.additional-marriage)')
      .each(function () {
        const n = (this.getAttribute('d') ?? '').match(/-?\d+(?:\.\d+)?/g);
        if (n?.length !== 8) return;
        const v = n.map(Number);
        const pts = [0, 2, 4, 6].map((i) => [v[i]!, v[i + 1]!]);
        const [a, b, c, z] = pts as [number[], number[], number[], number[]];
        if (b[1] !== c[1] || a[0] !== b[0] || c[0] !== z[0]) return;
        // A family's links all start at its parents (the upper end).
        const top = a[1]! < z[1]! ? a : z;
        const key = `${Math.round(top[0]!)} ${Math.round(top[1]!)}`;
        const bar = bars.get(key) ?? {
          y: b[1]!,
          x0: Infinity,
          x1: -Infinity,
          span: Infinity,
          paths: [],
        };
        bar.x0 = Math.min(bar.x0, b[0]!, c[0]!);
        bar.x1 = Math.max(bar.x1, b[0]!, c[0]!);
        bar.span = Math.min(bar.span, Math.abs(z[1]! - a[1]!));
        bar.paths.push({el: this, pts});
        bars.set(key, bar);
      });
    const levels = new Map<number, Bar[]>();
    for (const bar of bars.values()) {
      const y = Math.round(bar.y);
      levels.set(y, [...(levels.get(y) ?? []), bar]);
    }
    for (const level of levels.values()) {
      level.sort((p, q) => p.x0 - q.x0);
      const ends: number[] = [];
      const lane = new Map<Bar, number>();
      for (const bar of level) {
        let i = ends.findIndex((end) => end < bar.x0 - LANE_GAP);
        if (i === -1) i = ends.push(bar.x1) - 1;
        else ends[i] = bar.x1;
        lane.set(bar, i);
      }
      if (ends.length < 2) continue;
      const span = Math.min(...level.map((b) => b.span));
      const step = Math.min(LANE_STEP, (span * 0.5) / ends.length);
      for (const bar of level) {
        const dy = (lane.get(bar)! - (ends.length - 1) / 2) * step;
        for (const {el, pts} of bar.paths) {
          const [a, b, c, z] = pts as [number[], number[], number[], number[]];
          const y = b[1]! + dy;
          el.setAttribute(
            'd',
            `M ${a[0]} ${a[1]} L ${b[0]} ${y}, ${c[0]} ${y}, ${z[0]} ${z[1]}`,
          );
        }
      }
    }
  }

  /** Marks every path with how its link is drawn (CSS does the rest). */
  private styleLinks(input: EngineInput): void {
    const {tree, settings} = input;
    this.inner
      .select('g')
      .selectAll<SVGPathElement, LinkNode>('path.link')
      .each(function (d) {
        const link = childLinkOf(d);
        const look = link
          ? linkInfo(tree, settings, link.famId, link.childId).look
          : 'solid';
        this.setAttribute('data-look', look);
      });
  }

  /** The «disputed» label sitting on each dashed link. */
  private drawPills(links: ChildLink[], input: EngineInput): void {
    const {tree, settings, intl} = input;
    const layer = this.inner.select('g');
    layer.selectAll('.gv-pill').remove();
    this.pills.clear();
    const label = intl.formatMessage({id: 'chart.disputedShort'});
    const measure = canvasMeasure(`500 12px ${FONT_FAMILY}`, 12);
    const width = Math.ceil(measure(label)) + 20;
    const byKey = new Map(this.boxes.map((b) => [b.key, b]));
    for (const link of links) {
      const info = linkInfo(tree, settings, link.famId, link.childId);
      if (info.look !== 'dashed') continue;
      const key = `${link.childNode.id}:${link.childRole}`;
      const box = byKey.get(key);
      if (!box) continue;
      const above = (link.parentNode.y ?? 0) < (link.childNode.y ?? 0);
      const y = box.cy + (above ? -1 : 1) * (BOX_H / 2 + PILL_OFFSET);
      const note =
        info.phrase ?? intl.formatMessage({id: 'card.disputedParents'});
      const g = layer
        .append('g')
        .attr('class', 'gv-pill')
        .attr(
          'transform',
          `translate(${box.cx - this.origin[0]} ${y - this.origin[1]})`,
        )
        .attr('aria-hidden', 'true')
        .attr('data-tip', note);
      g.append('rect')
        .attr('x', -width / 2)
        .attr('y', -PILL_H / 2)
        .attr('width', width)
        .attr('height', PILL_H)
        .attr('rx', PILL_H / 2);
      g.append('text').attr('y', 4.5).attr('text-anchor', 'middle').text(label);
      this.pills.set(key, g.node() as SVGGElement);
    }
  }

  // ----------------------------------------------------- pan, zoom, size

  /** Moves the view to `t`, at once when `duration` is 0 or the user asked
   *  for less motion, else with a transition after `delay`. */
  private moveTo(t: Xform, duration = MOVE_TIME_MS, delay = 0): void {
    const c = constrainXform(t, this.chartSize, this.size);
    this.goal = c;
    const target = zoomIdentity.translate(c.x, c.y).scale(c.k);
    if (duration > 0 && !prefersReducedMotion()) {
      this.svg
        .transition()
        .delay(delay)
        .duration(duration)
        .call(this.zoomBehavior.transform, target);
    } else {
      this.svg.interrupt().call(this.zoomBehavior.transform, target);
    }
  }

  /** Tells the app the new scale once the gesture settles. Reporting every
   *  frame re-rendered the app during fast wheel scrolling, and the stale
   *  value echoed back pulled the view against the wheel. */
  private scheduleReport(): void {
    window.clearTimeout(this.reportTimer);
    this.reportTimer = window.setTimeout(() => {
      this.reportTimer = 0;
      this.report(this.goal.k);
    }, REPORT_DELAY_MS);
  }

  private report(k: number): void {
    this.reported = k;
    this.callbacks.onZoom(k);
  }

  private onResize(): void {
    const next = this.measureHost();
    const old = this.size;
    this.size = next;
    if (!this.built || (old.w === next.w && old.h === next.h)) return;
    // Keep what was in the middle of the view in the middle.
    const g = this.goal;
    this.moveTo(
      {
        x: g.x + (next.w - old.w) / 2,
        y: g.y + (next.h - old.h) / 2,
        k: g.k,
      },
      0,
    );
  }

  // ----------------------------------------------------- keyboard, mouse

  private setTabStop(el: SVGGElement | undefined): void {
    for (const e of this.elements.values()) e.setAttribute('tabindex', '-1');
    el?.setAttribute('tabindex', '0');
    this.tabKey = el?.dataset.key;
  }

  private focusKey(key: string): void {
    const el = this.elements.get(key);
    if (!el) return;
    this.setTabStop(el);
    el.focus({preventScroll: true});
    // Bring the box into view if it is outside. Where the box will be when
    // the running motion (if any) ends is worked out from the goal.
    const host = this.host().getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const now = zoomTransform(this.svgEl);
    const g = this.goal;
    const scale = g.k / now.k;
    const {dx, dy} = panIntoView(
      {
        x: ((r.left - host.left - now.x) / now.k) * g.k + g.x,
        y: ((r.top - host.top - now.y) / now.k) * g.k + g.y,
        w: r.width * scale,
        h: r.height * scale,
      },
      this.size,
    );
    if (dx || dy) this.moveTo({x: g.x + dx, y: g.y + dy, k: g.k}, 200);
  }

  private showTip(el: Element | null | undefined): void {
    const text = (el as HTMLElement | null | undefined)?.dataset.tip;
    if (!el || !text) return this.callbacks.onTip(null);
    // A box shows its tip next to the label on its link, when there is one.
    const key = (el as HTMLElement).dataset.key;
    const anchor = (key && this.pills.get(key)) || el;
    const r = anchor.getBoundingClientRect();
    const h = this.host().getBoundingClientRect();
    const half = Math.min(140, h.width / 2);
    this.callbacks.onTip({
      x: Math.min(
        h.width - half,
        Math.max(half, r.left - h.left + r.width / 2),
      ),
      y: r.bottom - h.top + 8,
      text,
    });
  }

  private bindEvents(): void {
    const opts = {signal: this.abort.signal};
    const person = (e: Event) =>
      (e.target as Element | null)?.closest?.<SVGGElement>('g.gv-person') ??
      null;
    const pill = (e: Event) =>
      (e.target as Element | null)?.closest?.<SVGGElement>('g.gv-pill') ?? null;

    this.svgEl.addEventListener(
      'click',
      (e) => {
        const photo = (e.target as Element | null)?.closest?.<SVGGElement>(
          'g.gv-photo[data-photo]',
        );
        if (photo?.dataset.for) {
          this.callbacks.onSelect(photo.dataset.for);
          return this.callbacks.onPhoto?.(photo.dataset.for);
        }
        const p = person(e);
        if (p?.dataset.id) return this.callbacks.onSelect(p.dataset.id);
        const label = pill(e);
        if (label) this.showTip(label);
        else this.callbacks.onTip(null);
      },
      opts,
    );
    this.svgEl.addEventListener(
      'keydown',
      (e) => {
        const p = person(e);
        if (!p?.dataset.key || e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (p.dataset.id) this.callbacks.onSelect(p.dataset.id);
        } else if (isNavKey(e.key)) {
          e.preventDefault();
          const next = navigate(this.boxes, this.edges, p.dataset.key, e.key);
          if (next) this.focusKey(next);
        }
      },
      opts,
    );
    this.svgEl.addEventListener(
      'focusin',
      (e) => {
        const p = person(e);
        if (!p) return;
        if (p.dataset.key !== this.tabKey) this.setTabStop(p);
        // Only for keyboard focus: after a click the card says it all.
        if (p.matches(':focus-visible')) this.showTip(p);
      },
      opts,
    );
    this.svgEl.addEventListener(
      'focusout',
      () => this.callbacks.onTip(null),
      opts,
    );
    this.svgEl.addEventListener(
      'pointerover',
      (e) => {
        if (e.pointerType === 'mouse' && pill(e)) this.showTip(pill(e));
      },
      opts,
    );
    this.svgEl.addEventListener(
      'pointerout',
      (e) => {
        if (e.pointerType === 'mouse' && pill(e)) this.callbacks.onTip(null);
      },
      opts,
    );
  }
}
