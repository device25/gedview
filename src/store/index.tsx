import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useSyncExternalStore,
  type Dispatch,
  type ReactNode,
} from 'react';
import {detectLanguage, isAvailable} from '../i18n';
import {buildHash, parseHash} from './hash';
import {loadPersisted, saveLang, saveSettings, saveTheme} from './persist';
import {
  createInitialState,
  reducer,
  type Action,
  type AppState,
} from './reducer';

const StateContext = createContext<AppState | null>(null);
const DispatchContext = createContext<Dispatch<Action> | null>(null);

function initState(): AppState {
  const persisted = loadPersisted();
  const lang = isAvailable(persisted.lang)
    ? persisted.lang
    : detectLanguage(navigator.languages ?? [navigator.language]);
  return createInitialState(persisted, parseHash(location.hash), lang);
}

export function StoreProvider({children}: {children: ReactNode}) {
  const [state, dispatch] = useReducer(reducer, undefined, initState);

  // Theme: "system" leaves the attribute off so tokens.css follows the OS.
  useEffect(() => {
    const root = document.documentElement;
    if (state.theme === 'system') root.removeAttribute('data-theme');
    else root.dataset.theme = state.theme;
    saveTheme(state.theme);
  }, [state.theme]);

  // The language is saved only once the user picks one, so that the
  // browser's language keeps deciding until then.
  const initialLang = useRef(state.lang);
  useEffect(() => {
    document.documentElement.lang = state.lang;
    if (state.lang !== initialLang.current) saveLang(state.lang);
  }, [state.lang]);

  useEffect(() => saveSettings(state.settings), [state.settings]);

  // The URL hash keeps the selected id, the root and the scope, nothing else.
  useEffect(() => {
    if (!state.tree) return;
    const hash = buildHash(
      {...state.scope, rootId: state.rootId},
      state.selectedId,
    );
    if (location.hash !== hash) {
      try {
        history.replaceState(
          null,
          '',
          `${location.pathname}${location.search}${hash}`,
        );
      } catch {
        // Some sandboxes forbid history changes.
      }
    }
  }, [state.tree, state.scope, state.rootId, state.selectedId]);

  useEffect(() => {
    const onHash = () =>
      dispatch({type: 'hashChanged', hash: parseHash(location.hash)});
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <StateContext value={state}>
      <DispatchContext value={dispatch}>{children}</DispatchContext>
    </StateContext>
  );
}

export function useAppState(): AppState {
  const s = useContext(StateContext);
  if (!s) throw new Error('useAppState outside StoreProvider');
  return s;
}

export function useDispatch(): Dispatch<Action> {
  const d = useContext(DispatchContext);
  if (!d) throw new Error('useDispatch outside StoreProvider');
  return d;
}

function subscribeMedia(query: string) {
  return (cb: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener('change', cb);
    return () => mq.removeEventListener('change', cb);
  };
}

/** Live result of a CSS media query. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useMemo(() => subscribeMedia(query), [query]);
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const useIsMobile = () => useMediaQuery('(max-width: 767px)');

/** "light" or "dark" after resolving the "system" preference. */
export function useResolvedTheme(): 'light' | 'dark' {
  const {theme} = useAppState();
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  if (theme === 'system') return systemDark ? 'dark' : 'light';
  return theme;
}
