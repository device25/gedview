import {useIntl} from 'react-intl';
import type {Citation, LoadedTree, Quality} from '../gedcom/types';
import {useAppState} from '../store';
import {formatDate} from './format';
import {NoteView} from './NoteView';
import {CitationIndex, sourceTitle} from './treeInfo';

/** DOM id of the source entry [n] in the full card. */
export const sourceAnchor = (n: number) => `src-${n}`;

/** Moves the view and focus to the source entry [n]. */
export function goToSource(n: number) {
  const el = document.getElementById(sourceAnchor(n));
  el?.scrollIntoView({block: 'nearest'});
  el?.focus();
}

/** "Source: [1], [3]" — links to the entries in the Sources section. */
export function CiteRefs({
  citations,
  index,
}: {
  citations: readonly Citation[];
  index: CitationIndex;
}) {
  const intl = useIntl();
  const nums = [...new Set(citations.map((c) => index.add(c)))];
  if (nums.length === 0) return null;
  return (
    <span className="event__muted">
      {intl.formatMessage({id: 'event.sources'}, {count: nums.length})}{' '}
      {nums.map((n, i) => (
        <span key={n}>
          {i > 0 && ', '}
          {/* A real link; the click is handled so the URL hash (used for
              the chart state) stays untouched. */}
          <a
            className="link link--ul"
            href={`#${sourceAnchor(n)}`}
            onClick={(e) => {
              e.preventDefault();
              goToSource(n);
            }}
          >
            [{n}]
          </a>
        </span>
      ))}
    </span>
  );
}

export function QualityBadge({quality}: {quality: Quality}) {
  const intl = useIntl();
  return (
    <span className="pill" data-quality={quality}>
      {intl.formatMessage(
        {id: 'quality.label'},
        {q: quality, text: intl.formatMessage({id: `quality.${quality}`})},
      )}
    </span>
  );
}

export function SourceItem({
  n,
  citation,
  tree,
}: {
  n: number;
  citation: Citation;
  tree: LoadedTree;
}) {
  const intl = useIntl();
  const {settings} = useAppState();
  const title = citation.sourceId
    ? sourceTitle(tree, citation.sourceId)
    : citation.inlineText || intl.formatMessage({id: 'source.void'});
  const date = formatDate(citation.data?.date, {
    locale: intl.locale,
    style: settings.dateStyle,
  });
  return (
    <li id={sourceAnchor(n)} tabIndex={-1} className="source">
      <span>
        <span className="muted">[{n}]</span>{' '}
        <span className="source__title">{title}</span>
      </span>
      {citation.page && <span className="muted">{citation.page}</span>}
      {date && (
        <span className="muted">
          {intl.formatMessage({id: 'source.date'}, {date})}
        </span>
      )}
      {citation.data?.texts.map((txt, i) => (
        <NoteView key={i} note={txt} quote />
      ))}
      {citation.quality !== undefined && (
        <QualityBadge quality={citation.quality} />
      )}
      {citation.notes.map((note, i) => (
        <NoteView key={`n${i}`} note={note} />
      ))}
    </li>
  );
}
