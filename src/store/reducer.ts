import type {ChartSettings, LoadedTree, LoadErrorCode} from '../gedcom/types';
import {MIN_UP, scopeDrawn, scopePeople, type ChartScope} from '../model/scope';
import {DEFAULT_SETTINGS, type Persisted, type ThemePref} from './persist';
import {DEFAULT_SCOPE, type HashState, type ScopeShape} from './hash';

export type FlyoutId = 'people' | 'sources' | 'export' | 'settings' | 'lang';

export type LoadPhase =
  | {phase: 'idle'}
  | {phase: 'loading'}
  | {phase: 'loaded'}
  | {phase: 'error'; code: LoadErrorCode | 'UNKNOWN'};

export interface AppState {
  tree?: LoadedTree;
  selectedId?: string;
  /** The person the chart counts from (the точка отсчёта). */
  rootId?: string;
  /** Who the chart shows and how many generations. */
  scope: ScopeShape;
  settings: ChartSettings;
  theme: ThemePref;
  lang: string;
  load: LoadPhase;
  flyout: FlyoutId | null;
  cardOpen: boolean;
  /** false = minimised to its header. */
  cardExpanded: boolean;
  fullCardOpen: boolean;
  urlDialogOpen: boolean;
  /** Chart zoom factor; applied by the chart. */
  zoom: number;
  /** Incremented on every "fit to screen" request. */
  fitRequest: number;
}

export type Action =
  | {type: 'loadStart'}
  | {type: 'loadDone'; tree: LoadedTree; wantedId?: string; wantedRoot?: string}
  | {type: 'loadFailed'; code: LoadErrorCode | 'UNKNOWN'}
  | {type: 'dismissError'}
  | {type: 'select'; id: string}
  | {type: 'setScope'; patch: Partial<ScopeShape>}
  | {type: 'reroot'; id: string}
  | {type: 'hashChanged'; hash: HashState}
  | {type: 'setSettings'; patch: Partial<ChartSettings>}
  | {type: 'setTheme'; theme: ThemePref}
  | {type: 'setLang'; lang: string}
  | {type: 'openFlyout'; id: FlyoutId}
  | {type: 'closeFlyout'; id?: FlyoutId}
  | {type: 'setCardOpen'; open: boolean}
  | {type: 'toggleCardExpanded'}
  | {type: 'setFullCard'; open: boolean}
  | {type: 'setUrlDialog'; open: boolean}
  | {type: 'zoom'; mode: 'in' | 'out' | 'fit'}
  | {type: 'setZoom'; zoom: number};

/** Large charts only fit at small scales, so the range is wide. */
export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 4;
/** Each zoom button press multiplies (or divides) the scale by this. */
export const ZOOM_STEP = 1.25;

export function createInitialState(
  persisted: Persisted,
  hash: HashState,
  lang: string,
): AppState {
  return {
    scope: scopeFromHash(hash, DEFAULT_SCOPE),
    settings: persisted.settings ?? DEFAULT_SETTINGS,
    theme: persisted.theme ?? 'system',
    lang,
    load: {phase: 'idle'},
    flyout: null,
    cardOpen: true,
    cardExpanded: true,
    fullCardOpen: false,
    urlDialogOpen: false,
    zoom: 1,
    fitRequest: 0,
  };
}

function scopeFromHash(hash: HashState, base: ScopeShape): ScopeShape {
  const level = hash.level ?? base.level;
  return {
    level,
    up: Math.max(MIN_UP[level], hash.up ?? base.up),
    down: hash.down ?? base.down,
  };
}

/** The chart scope of a state, when a tree and a root are there. */
export function chartScope(state: AppState): ChartScope | undefined {
  return state.rootId ? {rootId: state.rootId, ...state.scope} : undefined;
}

/** True when the person is drawn with the current root and scope. */
function onChart(state: AppState, id: string): boolean {
  const scope = chartScope(state);
  if (!state.tree || !scope) return false;
  const people = scopePeople(state.tree, state.settings, scope);
  return scopeDrawn(state.tree, people).has(id);
}

/** The person to show first: the wanted one if it exists, else the first. */
export function pickInitialId(
  tree: LoadedTree,
  wanted?: string,
): string | undefined {
  if (wanted && tree.indis.has(wanted)) return wanted;
  return tree.indis.keys().next().value;
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'loadStart':
      return {...state, load: {phase: 'loading'}, flyout: null};
    case 'loadDone': {
      const selectedId = pickInitialId(action.tree, action.wantedId);
      const root = action.wantedRoot;
      return {
        ...state,
        tree: action.tree,
        selectedId,
        rootId: root && action.tree.indis.has(root) ? root : selectedId,
        load: {phase: 'loaded'},
        flyout: null,
        cardOpen: true,
        cardExpanded: true,
        fullCardOpen: false,
        urlDialogOpen: false,
        zoom: 1,
      };
    }
    case 'loadFailed':
      // The tree that was open (if any) stays open.
      return {...state, load: {phase: 'error', code: action.code}};
    case 'dismissError':
      return state.load.phase === 'error'
        ? {...state, load: {phase: state.tree ? 'loaded' : 'idle'}}
        : state;
    case 'select':
      if (!state.tree?.indis.has(action.id)) return state;
      return {
        ...state,
        selectedId: action.id,
        // Someone the chart does not show becomes the root, so they are seen.
        rootId: onChart(state, action.id) ? state.rootId : action.id,
        cardOpen: true,
        cardExpanded: true,
        flyout: null,
      };
    case 'setScope': {
      const scope = {...state.scope, ...action.patch};
      // Choosing a level raises «вверх» to what it needs.
      if (action.patch.level)
        scope.up = Math.max(scope.up, MIN_UP[scope.level]);
      return {...state, scope};
    }
    case 'reroot':
      if (!state.tree?.indis.has(action.id)) return state;
      return {...state, rootId: action.id, selectedId: action.id};
    case 'hashChanged': {
      const next = {...state, scope: scopeFromHash(action.hash, state.scope)};
      const has = (id?: string) => !!id && !!state.tree?.indis.has(id);
      if (has(action.hash.id)) next.selectedId = action.hash.id;
      if (has(action.hash.root)) next.rootId = action.hash.root;
      else if (has(action.hash.id)) next.rootId = action.hash.id;
      return next;
    }
    case 'setSettings':
      return {...state, settings: {...state.settings, ...action.patch}};
    case 'setTheme':
      return {...state, theme: action.theme};
    case 'setLang':
      return {...state, lang: action.lang};
    case 'openFlyout':
      return {...state, flyout: action.id};
    case 'closeFlyout':
      // A stale close (from a flyout that another one replaced) is ignored.
      if (action.id && state.flyout !== action.id) return state;
      return {...state, flyout: null};
    case 'setCardOpen':
      return {...state, cardOpen: action.open, cardExpanded: true};
    case 'toggleCardExpanded':
      return {...state, cardExpanded: !state.cardExpanded};
    case 'setFullCard':
      return {...state, fullCardOpen: action.open};
    case 'setUrlDialog':
      return {...state, urlDialogOpen: action.open};
    case 'zoom': {
      if (action.mode === 'fit') {
        return {...state, zoom: 1, fitRequest: state.fitRequest + 1};
      }
      const factor = action.mode === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP;
      const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, state.zoom * factor));
      return {...state, zoom};
    }
    case 'setZoom':
      return {
        ...state,
        zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, action.zoom)),
      };
  }
}
