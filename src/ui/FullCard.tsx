import {useMemo, useState} from 'react';
import {
  Button,
  Dialog,
  Heading,
  Modal,
  ModalOverlay,
} from 'react-aria-components';
import {useIntl} from 'react-intl';
import type {
  Citation,
  IndiView,
  LoadedTree,
  MediaLink,
  NoteText,
  PersonName,
  Quality,
} from '../gedcom/types';
import {useAppState, useDispatch} from '../store';
import {EventItem, eventLabel, splitRestricted} from './events';
import {displayName, formatDate, initials, lifeSpan} from './format';
import {Icon} from './icons';
import {PersonLink} from './PersonLink';
import {labelOf} from './PersonCard';
import {CitationIndex, cardEvents, relativesOf, sourceTitle} from './treeInfo';
import './fullcard.css';

/** The full person card: a side drawer on desktop, a full screen on phones. */
export function FullCard() {
  const {tree, selectedId, fullCardOpen} = useAppState();
  const dispatch = useDispatch();
  const indi = selectedId ? tree?.indis.get(selectedId) : undefined;
  return (
    <ModalOverlay
      isOpen={fullCardOpen && !!indi}
      onOpenChange={(open) => dispatch({type: 'setFullCard', open})}
      isDismissable
      className="drawer-overlay"
    >
      <Modal className="drawer">
        <Dialog className="full">
          {tree && indi && <FullCardBody tree={tree} indi={indi} />}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function FullCardBody({tree, indi}: {tree: LoadedTree; indi: IndiView}) {
  const intl = useIntl();
  const dispatch = useDispatch();
  const {settings} = useAppState();
  const [reveal, setReveal] = useState(false);
  const t = (id: string) => intl.formatMessage({id});
  const dateOpts = {locale: intl.locale, style: settings.dateStyle};

  const items = useMemo(() => cardEvents(tree, indi), [tree, indi]);
  const {visible, hidden} = splitRestricted(
    items,
    settings.hideRestricted,
    reveal,
  );
  const citations = useMemo(() => {
    const idx = new CitationIndex();
    indi.citations.forEach((c) => idx.add(c));
    visible.forEach((v) => v.event.citations.forEach((c) => idx.add(c)));
    return idx;
  }, [indi, visible]);
  const rel = relativesOf(tree, indi);

  const name = displayName(indi);
  const life = lifeSpan(indi, dateOpts);
  const subtitle = [life, indi.sex ? t(`sex.${indi.sex}`) : '']
    .filter(Boolean)
    .join(' · ');

  const goToSource = (n: number) => {
    const el = document.getElementById(`src-${n}`);
    el?.scrollIntoView({block: 'nearest'});
    el?.focus();
  };
  const closeCard = () => dispatch({type: 'setFullCard', open: false});

  const externals = indi.exids;
  const hasService =
    indi.uids.length || indi.restrictions.length || indi.extensions.length;

  return (
    <article className="full__article">
      <header className="full__head">
        <div className="full__avatar" aria-hidden="true">
          {initials(name)}
        </div>
        <div className="full__who">
          <Heading slot="title" className="full__name">
            {name}
          </Heading>
          {subtitle && <div className="full__sub">{subtitle}</div>}
          <div className="full__id">{indi.id}</div>
        </div>
        <Button
          className="icon-btn"
          aria-label={t('card.closeFull')}
          onPress={closeCard}
        >
          <Icon name="close" size={18} strokeWidth={2} />
        </Button>
      </header>

      <Section id="names" title={t('full.names')} show={indi.names.length > 0}>
        {indi.names.map((n, i) => (
          <NameRow key={i} name={n} />
        ))}
      </Section>

      <Section
        id="events"
        title={t('full.events')}
        show={visible.length > 0 || indi.nonEvents.length > 0 || hidden > 0}
      >
        <ol className="events events--full">
          {visible.map((item, i) => (
            <EventItem
              key={i}
              tree={tree}
              indi={indi}
              item={item}
              full
              cite={(c) => citations.add(c)}
              onCiteClick={goToSource}
              onSelect={closeCard}
            />
          ))}
          {indi.nonEvents.map((ne, i) => (
            <li className="event" key={`no${i}`}>
              <span className="event__label">{t('event.none')}</span>
              <span className="event__body">
                {`noevent.${ne.tag}` in intl.messages
                  ? t(`noevent.${ne.tag}`)
                  : intl.formatMessage(
                      {id: 'event.noneText'},
                      {event: eventLabel(intl, ne)},
                    )}
                {ne.date && <> · {formatDate(ne.date, dateOpts)}</>}
              </span>
            </li>
          ))}
        </ol>
        {hidden > 0 && (
          <div role="note" className="hidden-note">
            <span>
              {intl.formatMessage({id: 'card.hidden'}, {count: hidden})}
            </span>
            <Button className="btn btn--small" onPress={() => setReveal(true)}>
              {t('card.reveal')}
            </Button>
          </div>
        )}
        {reveal && settings.hideRestricted && (
          <Button className="btn btn--small" onPress={() => setReveal(false)}>
            {t('card.rehide')}
          </Button>
        )}
      </Section>

      <Section
        id="family"
        title={t('full.family')}
        show={rel.parents.length + rel.spouses.length + rel.children.length > 0}
      >
        {rel.parents.map((g) => (
          <div key={g.famId} className="family__group">
            <div className="muted">
              {labelOf(intl, `rel.parents.${g.pedigree}`, 'rel.parents')}
            </div>
            <div className="chips">
              {g.people.map((p) => (
                <PersonLink
                  key={p.id}
                  id={p.id}
                  className="chip"
                  data-disputed={g.status === 'CHALLENGED' || undefined}
                  onSelect={closeCard}
                >
                  {displayName(p)}
                </PersonLink>
              ))}
            </div>
            {g.status && (
              <div role="note" className="note-warn">
                <strong>{t(`status.${g.status}`)}</strong>{' '}
                {indi.famc.find((l) => l.famId === g.famId)?.statusPhrase}
              </div>
            )}
          </div>
        ))}
        {rel.spouses.some((s) => s.spouse) && (
          <div className="family__group">
            <div className="muted">{t('rel.spouses')}</div>
            {rel.spouses.map(
              (s) =>
                s.spouse && (
                  <PersonLine key={s.famId} p={s.spouse} onSelect={closeCard} />
                ),
            )}
          </div>
        )}
        {rel.children.length > 0 && (
          <div className="family__group">
            <div className="muted">{t('rel.children')}</div>
            {rel.children.map((c) => (
              <PersonLine key={c.id} p={c} onSelect={closeCard} />
            ))}
          </div>
        )}
      </Section>

      <Section
        id="sources"
        title={t('full.sources')}
        show={citations.items.length > 0}
      >
        <ol className="sources">
          {citations.items.map(({n, citation}) => (
            <SourceItem key={n} n={n} citation={citation} tree={tree} />
          ))}
        </ol>
      </Section>

      <Section id="notes" title={t('full.notes')} show={indi.notes.length > 0}>
        {indi.notes.map((n, i) => (
          <NoteBlock key={i} note={n} />
        ))}
      </Section>

      <Section id="media" title={t('full.media')} show={indi.media.length > 0}>
        {indi.media.map((m, i) => (
          <MediaItem key={i} media={m} tree={tree} />
        ))}
      </Section>

      <Section id="links" title={t('full.links')} show={externals.length > 0}>
        <ul className="links">
          {externals.map((x, i) => {
            const safe = x.url && /^https?:\/\//i.test(x.url);
            const label = x.label ?? t('full.externalId');
            return (
              <li key={i}>
                {safe ? (
                  <a
                    className="link"
                    href={x.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {label} · {x.value} ↗
                  </a>
                ) : (
                  <span>
                    {label} <code>{x.value}</code>
                  </span>
                )}
                {!x.label && x.type && (
                  <span className="muted">
                    {' '}
                    · {intl.formatMessage({id: 'full.idType'}, {type: x.type})}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      {hasService ? (
        <details className="service">
          <summary>{t('full.service')}</summary>
          <dl>
            {indi.uids.length > 0 && (
              <>
                <dt>UID</dt>
                <dd>
                  <code>{indi.uids.join(', ')}</code>
                </dd>
              </>
            )}
            {indi.restrictions.length > 0 && (
              <>
                <dt>{t('full.restrictions')}</dt>
                <dd>{indi.restrictions.join(', ')}</dd>
              </>
            )}
            {indi.extensions.length > 0 && (
              <>
                <dt>{t('full.extensions')}</dt>
                <dd>
                  {indi.extensions.map((x) => (
                    <div key={x.tag + x.node.line}>
                      <code>{x.tag}</code>
                      {x.uri && (
                        <span className="muted">
                          {' '}
                          · {t('full.schemaDeclared')}
                        </span>
                      )}
                    </div>
                  ))}
                </dd>
              </>
            )}
          </dl>
        </details>
      ) : null}
    </article>
  );
}

function Section({
  id,
  title,
  show,
  children,
}: {
  id: string;
  title: string;
  show: boolean;
  children: React.ReactNode;
}) {
  if (!show) return null;
  return (
    <section className="full__section" aria-labelledby={`full-${id}`}>
      <h3 id={`full-${id}`}>{title}</h3>
      {children}
    </section>
  );
}

function NameRow({name}: {name: PersonName}) {
  const intl = useIntl();
  const typeId = name.type ? `nameType.${name.type}` : '';
  const type = name.type
    ? typeId in intl.messages
      ? intl.formatMessage({id: typeId})
      : name.type.toLowerCase()
    : '';
  const note = [type, name.typePhrase ? `«${name.typePhrase}»` : '']
    .filter(Boolean)
    .join(': ');
  return (
    <>
      <div>
        <span className="name-main">{name.display}</span>{' '}
        {note && <span className="muted">· {note}</span>}
      </div>
      {name.translations.map((tr, i) => (
        <div key={i}>
          <span lang={tr.lang}>{tr.display}</span>{' '}
          <span className="muted">
            ·{' '}
            {intl.formatMessage(
              {id: 'full.translation'},
              {lang: tr.lang ?? ''},
            )}
          </span>
        </div>
      ))}
    </>
  );
}

function PersonLine({p, onSelect}: {p: IndiView; onSelect: () => void}) {
  const intl = useIntl();
  const {settings} = useAppState();
  const life = lifeSpan(p, {locale: intl.locale, style: settings.dateStyle});
  return (
    <div>
      <PersonLink id={p.id} onSelect={onSelect}>
        {displayName(p)}
      </PersonLink>{' '}
      <span className="muted">{life}</span>
    </div>
  );
}

function SourceItem({
  n,
  citation,
  tree,
}: {
  n: number;
  citation: Citation;
  tree: LoadedTree;
}) {
  const intl = useIntl();
  const title = citation.sourceId
    ? sourceTitle(tree, citation.sourceId)
    : (citation.inlineText ?? '');
  return (
    <li id={`src-${n}`} tabIndex={-1} className="source">
      <span>
        <span className="muted">[{n}]</span>{' '}
        <span className="source__title">{title}</span>
      </span>
      {citation.page && <span className="muted">{citation.page}</span>}
      {citation.data?.texts.map((txt, i) => (
        <blockquote key={i}>«{plainText(txt.text, txt.mime)}»</blockquote>
      ))}
      {citation.quality !== undefined && (
        <span className="pill">
          {intl.formatMessage(
            {id: 'quality.label'},
            {
              q: citation.quality,
              text: intl.formatMessage({
                id: `quality.${citation.quality as Quality}`,
              }),
            },
          )}
        </span>
      )}
    </li>
  );
}

/** Notes are shown as text; HTML is stripped, never injected. */
function plainText(text: string, mime: string): string {
  if (mime !== 'text/html') return text;
  return (
    new DOMParser().parseFromString(text, 'text/html').body.textContent ?? ''
  );
}

function NoteBlock({note}: {note: NoteText}) {
  const intl = useIntl();
  const meta = [
    note.mime === 'text/html' ? 'HTML' : '',
    note.lang ?? '',
    note.sharedNoteId ? intl.formatMessage({id: 'full.sharedNote'}) : '',
  ].filter(Boolean);
  return (
    <>
      <p className="note-text">{plainText(note.text, note.mime)}</p>
      {meta.length > 0 && <div className="muted">{meta.join(', ')}</div>}
    </>
  );
}

const safeSrc = (u?: string) => !!u && /^(blob:|data:image\/)/.test(u);

function MediaItem({media, tree}: {media: MediaLink; tree: LoadedTree}) {
  const intl = useIntl();
  const file = media.files[0];
  if (!file) return null;
  const src = tree.media.get(file.path);
  const isImage = file.mime?.startsWith('image/');
  const title = media.title ?? file.title ?? file.path;
  const meta = [
    file.mime,
    media.crop ? intl.formatMessage({id: 'media.cropped'}) : '',
    file.translations.length
      ? intl.formatMessage(
          {id: 'media.alternatives'},
          {
            types: file.translations
              .map((x) => x.mime ?? '')
              .filter(Boolean)
              .join(', '),
          },
        )
      : '',
  ].filter(Boolean);
  return (
    <div className="media">
      {isImage && safeSrc(src) ? (
        <img className="media__thumb" src={src} alt="" />
      ) : (
        <div className="media__thumb media__thumb--empty" aria-hidden="true">
          {intl.formatMessage({id: 'media.noPreview'})}
        </div>
      )}
      <div className="media__text">
        <span>{title}</span>
        <span className="muted">{meta.join(' · ')}</span>
      </div>
    </div>
  );
}
