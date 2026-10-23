import {
  GENERATIONS_MAX,
  isLevel,
  type BreadthLevel,
  type ChartScope,
} from '../model/scope';

/** What the chart shows, apart from the root: who and how far. */
export type ScopeShape = Pick<ChartScope, 'level' | 'up' | 'down'>;

export const DEFAULT_SCOPE: ScopeShape = {level: 'direct', up: 4, down: 3};

export interface HashState {
  /** The chart is the default and is not named. */
  mode?: 'summary' | 'map';
  /** What the map shows; places by default. */
  map?: 'path' | 'spread';
  id?: string;
  root?: string;
  level?: BreadthLevel;
  up?: number;
  down?: number;
}

/** Old links named a chart view; they map to a level. */
const OLD_VIEWS: Record<string, BreadthLevel> = {
  hourglass: 'direct',
  relatives: 'all',
};

function generations(v: string | null, min: number): number | undefined {
  if (v === null || !/^\d+$/.test(v)) return undefined;
  return Math.min(GENERATIONS_MAX, Math.max(min, Number(v)));
}

/** The hash carries ids and the chart scope: no names, no data. */
export function parseHash(hash: string): HashState {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const out: HashState = {};
  const mode = params.get('mode');
  if (mode === 'summary' || mode === 'map') out.mode = mode;
  const map = params.get('map');
  if (map === 'path' || map === 'spread') out.map = map;
  const id = params.get('id');
  if (id) out.id = id;
  const root = params.get('root');
  if (root) out.root = root;
  const level = params.get('level') ?? OLD_VIEWS[params.get('view') ?? ''];
  if (isLevel(level)) out.level = level;
  const up = generations(params.get('up'), 1);
  if (up !== undefined) out.up = up;
  const down = generations(params.get('down'), 0);
  if (down !== undefined) out.down = down;
  return out;
}

/** The selected person, and the root when it is someone else. */
export function buildHash(
  scope: ScopeShape & {rootId?: string; mode?: string; mapView?: string},
  id?: string,
): string {
  const params = new URLSearchParams();
  if (scope.mode === 'summary' || scope.mode === 'map')
    params.set('mode', scope.mode);
  if (scope.mode === 'map' && scope.mapView && scope.mapView !== 'places')
    params.set('map', scope.mapView);
  if (id) params.set('id', id);
  if (scope.rootId && scope.rootId !== id) params.set('root', scope.rootId);
  params.set('level', scope.level);
  if (scope.level !== 'all') {
    params.set('up', String(scope.up));
    params.set('down', String(scope.down));
  }
  return `#${params.toString()}`;
}

/**
 * Absolute URL of a person in the current page. Absolute on purpose: it is
 * copyable and openable in a new tab, and is not mistaken for a skip link.
 * The link counts from that person.
 */
export function personHref(scope: ScopeShape, id: string): string {
  return `${location.origin}${location.pathname}${location.search}${buildHash(scope, id)}`;
}
