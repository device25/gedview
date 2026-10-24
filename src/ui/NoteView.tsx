import {useMemo, useState} from 'react';
import {Button} from 'react-aria-components';
import {useIntl} from 'react-intl';
import type {NoteText} from '../gedcom/types';
import {useAppState} from '../store';
import {CiteRefs} from './cite';
import type {CitationIndex} from './treeInfo';
import {SafeHtml} from './html';
import {pickVariant, variantsOf} from './lang';

/** "ru" for a known language, "none" for the select in the messages. */
export const langArg = (lang?: string) => lang ?? 'none';

interface NoteViewProps {
  note: NoteText;
  /** Render as a blockquote (citation text). */
  quote?: boolean;
  /** The card's numbered sources: the note's own citations link there. */
  sources?: CitationIndex;
}

/**
 * A note in the UI language when it has a matching translation, else as
 * written; with a marker and a button to switch between the versions.
 * text/html is sanitised, any other MIME type is shown as plain text.
 */
export function NoteView({note, quote, sources}: NoteViewProps) {
  const intl = useIntl();
  const {lang, tree} = useAppState();
  const variants = useMemo(
    () =>
      variantsOf(
        {text: note.text, mime: note.mime, lang: note.lang},
        note.translations,
        tree?.parse.language,
      ),
    [note, tree],
  );
  const [choice, setChoice] = useState<number | null>(null);
  const index = Math.min(
    choice ?? pickVariant(variants, lang),
    variants.length - 1,
  );
  const current = variants[index];
  if (!current) return null;
  const next = variants[(index + 1) % variants.length];
  const label = (original: boolean, l?: string) =>
    intl.formatMessage(
      {id: original ? 'variant.original' : 'variant.translation'},
      {lang: langArg(l)},
    );

  const body =
    current.value.mime === 'text/html' ? (
      <div className="note-html" lang={current.lang}>
        <SafeHtml html={current.value.text} />
      </div>
    ) : (
      <p className="note-text" lang={current.lang}>
        {current.value.text}
      </p>
    );

  return (
    <div className="note">
      {quote ? <blockquote className="note-quote">{body}</blockquote> : body}
      {sources && note.citations.length > 0 && (
        <CiteRefs citations={note.citations} index={sources} />
      )}
      {variants.length > 1 && next && (
        <div className="note-variant">
          <span className="muted">{label(current.original, current.lang)}</span>
          <Button
            className="btn btn--small"
            onPress={() => setChoice((index + 1) % variants.length)}
          >
            {intl.formatMessage(
              {
                id: next.original
                  ? 'variant.showOriginal'
                  : 'variant.showTranslation',
              },
              {lang: langArg(next.lang)},
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
