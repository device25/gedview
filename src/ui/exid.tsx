import {useIntl} from 'react-intl';
import type {ExternalId} from '../gedcom/types';
import {safeHref} from './html';

/** An EXID: a link when its type gives a web address, else the value. */
export function ExternalIdItem({
  id: x,
  compact,
}: {
  id: ExternalId;
  /** Under a place: the site's name and the value, without the type URI. */
  compact?: boolean;
}) {
  const intl = useIntl();
  if (compact && !x.url) {
    return (
      <span className="muted">
        {x.label ??
          typeHost(x.type) ??
          intl.formatMessage({id: 'full.externalId'})}{' '}
        <code>{x.value}</code>
      </span>
    );
  }
  const href = safeHref(x.url);
  const link = href && /^https?:/.test(href) ? href : undefined;
  if (link) {
    return (
      <a className="link" href={link} target="_blank" rel="noopener noreferrer">
        {x.label ?? intl.formatMessage({id: 'full.externalId'})} · {x.value} ↗
      </a>
    );
  }
  return (
    <span>
      {x.label ?? intl.formatMessage({id: 'full.externalId'})}{' '}
      <code>{x.value}</code>
      {x.type && (
        <span className="muted">
          {' '}
          · {intl.formatMessage({id: 'full.idType'}, {type: x.type})}
        </span>
      )}
    </span>
  );
}

/** «familio.org» for a type URI https://familio.org/settlements. */
function typeHost(type?: string): string | undefined {
  if (!type) return undefined;
  try {
    return new URL(type).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}
