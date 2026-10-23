import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import type {LoadedTree, LoadErrorCode, LoadInput} from '../gedcom/types';
import {loadTree} from '../load';
import {parseHash} from '../store/hash';
import {useDispatch} from '../store';

interface Loader {
  openFiles: (files: File[]) => void;
  openUrl: (url: string) => void;
  openDemo: () => void;
}

const LoaderContext = createContext<Loader | null>(null);

const CODES: string[] = [
  'NOT_GEDCOM',
  'NO_GEDCOM_IN_ZIP',
  'NETWORK',
  'TOO_LARGE',
  'EMPTY',
];

function errorCode(e: unknown): LoadErrorCode | 'UNKNOWN' {
  const code = (e as {code?: unknown} | null)?.code;
  return typeof code === 'string' && CODES.includes(code)
    ? (code as LoadErrorCode)
    : 'UNKNOWN';
}

/** Runs loadTree and turns its outcome into store actions. */
export function LoaderProvider({children}: {children: ReactNode}) {
  const dispatch = useDispatch();
  const current = useRef<AbortController | null>(null);

  const run = useCallback(
    async (load: (signal: AbortSignal) => Promise<LoadedTree>) => {
      current.current?.abort();
      const ctrl = new AbortController();
      current.current = ctrl;
      dispatch({type: 'loadStart'});
      try {
        const tree = await load(ctrl.signal);
        if (ctrl.signal.aborted) return;
        dispatch({
          type: 'loadDone',
          tree,
          wantedId: parseHash(location.hash).id,
          wantedRoot: parseHash(location.hash).root,
        });
      } catch (e) {
        if (ctrl.signal.aborted) return;
        dispatch({type: 'loadFailed', code: errorCode(e)});
      }
    },
    [dispatch],
  );

  const value = useMemo<Loader>(() => {
    const fromInput = (input: LoadInput) => (signal: AbortSignal) =>
      loadTree(input, signal);
    return {
      openFiles: (files) => {
        if (files.length) void run(fromInput({kind: 'files', files}));
      },
      openUrl: (url) => void run(fromInput({kind: 'url', url})),
      openDemo: () =>
        void run(async () => (await import('./mock/mockTree')).mockTree),
    };
  }, [run]);

  return <LoaderContext value={value}>{children}</LoaderContext>;
}

export function useLoader(): Loader {
  const l = useContext(LoaderContext);
  if (!l) throw new Error('useLoader outside LoaderProvider');
  return l;
}
