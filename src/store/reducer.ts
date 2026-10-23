import type {
  ChartSettings,
  ChartView,
  LoadedTree,
  LoadErrorCode,
} from '../gedcom/types';
import {DEFAULT_SETTINGS, type Persisted, type ThemePref} from './persist';
import type {HashState} from './hash';

export type FlyoutId = 'people' | 'sources' | 'export' | 'settings' | 'lang';

export type LoadPhase =
  | {phase: 'idle'}
  | {phase: 'loading'}
  | {phase: 'loaded'}
  | {phase: 'error'; code: LoadErrorCode | 'UNKNOWN'};

export interface AppState {
  tree?: LoadedTree;
  selectedId?: string;
  view: ChartView;
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
  /** Chart zoom factor; applied by the chart (part C). */
  zoom: number;
}

export type Action =
  | {type: 'loadStart'}
  | {type: 'loadDone'; tree: LoadedTree; wantedId?: string}
  | {type: 'loadFailed'; code: LoadErrorCode | 'UNKNOWN'}
  | {type: 'dismissError'}
  | {type: 'select'; id: string}
  | {type: 'setView'; view: ChartView}
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
  | {type: 'zoom'; mode: 'in' | 'out' | 'fit'};

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
export const ZOOM_STEP = 0.25;

export function createInitialState(
  persisted: Persisted,
  hash: HashState,
  lang: string,
): AppState {
  return {
    view: hash.view ?? 'hourglass',
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
  };
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
    case 'loadDone':
      return {
        ...state,
        tree: action.tree,
        selectedId: pickInitialId(action.tree, action.wantedId),
        load: {phase: 'loaded'},
        flyout: null,
        cardOpen: true,
        cardExpanded: true,
        fullCardOpen: false,
        urlDialogOpen: false,
        zoom: 1,
      };
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
        cardOpen: true,
        cardExpanded: true,
        flyout: null,
      };
    case 'setView':
      return state.view === action.view ? state : {...state, view: action.view};
    case 'hashChanged': {
      const next = {...state};
      if (action.hash.view) next.view = action.hash.view;
      if (action.hash.id && state.tree?.indis.has(action.hash.id)) {
        next.selectedId = action.hash.id;
      }
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
      if (action.mode === 'fit') return {...state, zoom: 1};
      const delta = action.mode === 'in' ? ZOOM_STEP : -ZOOM_STEP;
      const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, state.zoom + delta));
      return {...state, zoom};
    }
  }
}
