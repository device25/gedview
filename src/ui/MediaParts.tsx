import {Button} from 'react-aria-components';
import {useIntl} from 'react-intl';
import {useDispatch} from '../store';
import {blockedHosts, cropViewBox, type MediaEntry} from './media';

/** An image, cropped as the file says when the crop is complete. */
export function MediaImage({
  entry,
  className,
  alt = '',
  crop = true,
}: {
  entry: MediaEntry;
  className: string;
  alt?: string;
  crop?: boolean;
}) {
  const box = crop ? cropViewBox(entry.media) : undefined;
  if (box) {
    return (
      <svg
        className={className}
        viewBox={box}
        preserveAspectRatio="xMidYMid slice"
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
      >
        <image href={entry.src} />
      </svg>
    );
  }
  return (
    <img
      className={className}
      src={entry.src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}

/** What a file is, for a tile without a picture: PDF, HTML, JPEG… */
export function fileKind(entry: MediaEntry): string {
  const fromMime = entry.file.mime?.split('/').pop();
  const fromName = entry.file.path.split(/[?#]/)[0]!.split('.').pop();
  return (fromMime || fromName || '').toUpperCase();
}

/**
 * Linked images are not loaded (a request tells the other site who is
 * looking): says so, names the sites, and switches loading on.
 */
export function RemoteOff({hosts}: {hosts: string[]}) {
  const intl = useIntl();
  const dispatch = useDispatch();
  return (
    <div className="remote-off">
      <p>{intl.formatMessage({id: 'media.remoteTile'})}</p>
      <Button
        className="btn"
        onPress={() =>
          dispatch({type: 'setSettings', patch: {loadRemoteMedia: true}})
        }
      >
        {intl.formatMessage({id: 'media.remoteEnable'})}
      </Button>
      {hosts.length > 0 && (
        <p className="muted">
          {intl.formatMessage(
            {id: 'media.remoteHosts'},
            {hosts: intl.formatList(hosts, {type: 'conjunction'})},
          )}
        </p>
      )}
    </div>
  );
}

/** How many files the card shows before «ещё N». */
const STRIP = 4;

/** The card's row of media: the first few, then «ещё N» for the rest. */
export function MediaStrip({
  entries,
  onView,
  onMore,
}: {
  entries: MediaEntry[];
  onView: (index: number) => void;
  onMore: () => void;
}) {
  const intl = useIntl();
  const shown = entries.slice(0, STRIP);
  const more = entries.length - shown.length;
  const hosts = blockedHosts(entries);
  return (
    <section
      className="card-media"
      aria-label={intl.formatMessage({id: 'card.media'})}
    >
      <ul className="card-media__list">
        {shown.map((e, i) => (
          <li key={i}>
            <Button
              className="card-media__item"
              aria-label={intl.formatMessage(
                {id: 'card.mediaOpen'},
                {title: e.title},
              )}
              onPress={() => onView(i)}
            >
              {e.image && e.src ? (
                <MediaImage entry={e} className="card-media__img" />
              ) : (
                <span className="card-media__kind" aria-hidden="true">
                  {e.remote && !e.src ? '↗' : fileKind(e)}
                </span>
              )}
            </Button>
          </li>
        ))}
        {more > 0 && (
          <li>
            <Button
              className="card-media__item card-media__more"
              onPress={onMore}
            >
              {intl.formatMessage({id: 'card.mediaMore'}, {count: more})}
            </Button>
          </li>
        )}
      </ul>
      {hosts.length > 0 && <RemoteOff hosts={hosts} />}
    </section>
  );
}
