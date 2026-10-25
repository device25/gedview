import {useEffect, useRef, type PointerEvent} from 'react';
import {Button, Dialog, Modal, ModalOverlay} from 'react-aria-components';
import {useIntl} from 'react-intl';
import {useAppState, useDispatch} from '../store';
import {Icon} from './icons';
import {blockedHosts, mediaEntries} from './media';
import {fileKind, MediaImage, RemoteOff} from './MediaParts';
import './viewer.css';

/** How far a finger must move sideways to go to the next file. */
const SWIPE = 40;

/** A person's media one at a time, over the whole screen. */
export function MediaViewer() {
  const {viewer, tree, settings} = useAppState();
  const dispatch = useDispatch();
  const intl = useIntl();
  const swipe = useRef<number | undefined>(undefined);
  const indi = viewer ? tree?.indis.get(viewer.id) : undefined;
  const entries =
    tree && indi && viewer
      ? mediaEntries(tree, indi, {
          hide: settings.hideRestricted && !viewer.revealed,
          allowRemote: settings.loadRemoteMedia,
        })
      : [];
  const count = entries.length;
  const index = viewer ? Math.min(viewer.index, count - 1) : 0;
  const entry = entries[index];
  const t = (id: string) => intl.formatMessage({id});
  const close = () => dispatch({type: 'closeViewer'});
  const go = (step: number) => {
    if (!viewer || count < 2) return;
    dispatch({
      type: 'openViewer',
      id: viewer.id,
      index: (index + step + count) % count,
      revealed: viewer.revealed,
    });
  };
  // Arrows go through the files while the viewer is open.
  useEffect(() => {
    if (!viewer || count < 2) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      dispatch({
        type: 'openViewer',
        id: viewer.id,
        index: (index + step + count) % count,
        revealed: viewer.revealed,
      });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [viewer, count, index, dispatch]);
  const swipeStart = (e: PointerEvent) => {
    swipe.current = e.clientX;
  };
  const swipeEnd = (e: PointerEvent) => {
    const from = swipe.current;
    swipe.current = undefined;
    if (from === undefined) return;
    const dx = e.clientX - from;
    if (dx < -SWIPE) go(1);
    if (dx > SWIPE) go(-1);
  };

  return (
    <ModalOverlay
      isOpen={!!entry}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      isDismissable
      className="viewer-overlay"
    >
      <Modal className="viewer">
        <Dialog className="viewer__dialog" aria-label={entry?.title}>
          {entry && (
            <>
              <header className="viewer__bar">
                <div className="viewer__caption">
                  <span className="viewer__title">{entry.title}</span>
                  {entry.media.notes?.[0] && (
                    <span className="viewer__note">
                      {entry.media.notes[0].text}
                    </span>
                  )}
                  {count > 1 && (
                    <span className="viewer__count">
                      {intl.formatMessage(
                        {id: 'viewer.count'},
                        {at: index + 1, count},
                      )}
                    </span>
                  )}
                </div>
                {entry.src && (
                  <a
                    className="viewer__link"
                    href={entry.src}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('viewer.original')} ↗
                  </a>
                )}
                <Button
                  className="viewer__btn"
                  aria-label={t('viewer.close')}
                  onPress={close}
                >
                  <Icon name="close" size={20} strokeWidth={2} />
                </Button>
              </header>
              <div
                className="viewer__stage"
                onPointerDown={swipeStart}
                onPointerUp={swipeEnd}
              >
                {entry.image && entry.src ? (
                  <MediaImage
                    entry={entry}
                    className="viewer__image"
                    alt={entry.title}
                    crop={false}
                  />
                ) : entry.remote && !entry.src ? (
                  <RemoteOff hosts={blockedHosts([entry])} />
                ) : (
                  <div className="viewer__file">
                    <span className="viewer__kind">{fileKind(entry)}</span>
                    <span>{t('viewer.noPreview')}</span>
                  </div>
                )}
                {count > 1 && (
                  <>
                    <Button
                      className="viewer__btn viewer__prev"
                      aria-label={t('viewer.prev')}
                      onPress={() => go(-1)}
                    >
                      <Icon name="chevronLeft" size={22} strokeWidth={2} />
                    </Button>
                    <Button
                      className="viewer__btn viewer__next"
                      aria-label={t('viewer.next')}
                      onPress={() => go(1)}
                    >
                      <Icon name="chevronRight" size={22} strokeWidth={2} />
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
