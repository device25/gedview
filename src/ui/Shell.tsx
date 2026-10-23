import {useEffect, useState, type MouseEvent} from 'react';
import {Button} from 'react-aria-components';
import {useIntl} from 'react-intl';
import {useAppState, useDispatch, useIsMobile} from '../store';
import {FullCard} from './FullCard';
import {MediaViewer} from './MediaViewer';
import {useLoader} from './loader';
import {focusShowCard} from './PersonCard';
import {MobileNav, Rail} from './Rail';
import {StartScreen} from './StartScreen';
import {treeTitle} from './treeInfo';
import {UrlDialog} from './UrlDialog';
import {Workspace} from './Workspace';
import './shell.css';

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/** `/` opens the search, Esc closes the card when nothing else is open. */
function useGlobalKeys() {
  const state = useAppState();
  const dispatch = useDispatch();
  const {flyout, tree, cardOpen, fullCardOpen, urlDialogOpen} = state;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/' && tree && !isTyping(e.target)) {
        e.preventDefault();
        dispatch({type: 'openFlyout', id: 'people'});
      } else if (
        e.key === 'Escape' &&
        cardOpen &&
        tree &&
        !flyout &&
        !fullCardOpen &&
        !urlDialogOpen
      ) {
        dispatch({type: 'setCardOpen', open: false});
        focusShowCard();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [tree, cardOpen, flyout, fullCardOpen, urlDialogOpen, dispatch]);
}

/** Window-wide drag and drop of files, with a visual hint while dragging. */
function DropOverlay() {
  const {openFiles} = useLoader();
  const intl = useIntl();
  const [over, setOver] = useState(false);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) =>
      !!e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setOver(false);
    };
    const dragover = (e: DragEvent) => {
      // Without this the browser would navigate to the dropped file.
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      openFiles(Array.from(e.dataTransfer?.files ?? []));
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', dragover);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', dragover);
      window.removeEventListener('drop', drop);
    };
  }, [openFiles]);

  if (!over) return null;
  return (
    <div className="drop-overlay" aria-hidden="true">
      <div className="drop-overlay__box">
        {intl.formatMessage({id: 'drop.release'})}
      </div>
    </div>
  );
}

/** Polite live region for loading and the result; errors get a banner. */
function Status() {
  const {load, tree} = useAppState();
  const dispatch = useDispatch();
  const intl = useIntl();
  const t = (id: string) => intl.formatMessage({id});
  let announce = '';
  if (load.phase === 'loading') announce = t('status.loading');
  else if (load.phase === 'loaded' && tree)
    announce = intl.formatMessage(
      {id: 'status.loaded'},
      {title: treeTitle(tree), count: tree.indis.size},
    );

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {announce}
      </div>
      {load.phase === 'loading' && (
        <div className="banner banner--info" aria-hidden="true">
          {t('status.loading')}
        </div>
      )}
      {load.phase === 'error' && (
        <div className="banner banner--error" role="alert">
          <span>{t(`error.${load.code}`)}</span>
          <Button
            className="btn btn--small"
            onPress={() => dispatch({type: 'dismissError'})}
          >
            {t('common.close')}
          </Button>
        </div>
      )}
    </>
  );
}

export function Shell() {
  const {tree, load} = useAppState();
  const intl = useIntl();
  const isMobile = useIsMobile();
  const {openDemo} = useLoader();
  useGlobalKeys();

  // ?demo opens the built-in invented family (also used by the tests).
  useEffect(() => {
    if (new URLSearchParams(location.search).has('demo')) openDemo();
  }, [openDemo]);

  const skip = (e: MouseEvent) => {
    e.preventDefault();
    document.getElementById('chart')?.focus();
  };

  return (
    <div className="app" data-mobile={isMobile || undefined}>
      <a className="skip" href="#chart" onClick={skip}>
        {intl.formatMessage({id: 'app.skip'})}
      </a>
      {!isMobile && <Rail />}
      <main
        id="chart"
        tabIndex={-1}
        className="main"
        aria-label={intl.formatMessage({id: tree ? 'chart.label' : 'app.name'})}
        aria-busy={load.phase === 'loading'}
      >
        {tree ? <Workspace /> : <StartScreen />}
      </main>
      {isMobile && <MobileNav />}
      <Status />
      <DropOverlay />
      <UrlDialog />
      <FullCard />
      <MediaViewer />
    </div>
  );
}
