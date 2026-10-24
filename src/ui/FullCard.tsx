import {useEffect, useMemo, useState} from 'react';
import {
  Button,
  Dialog,
  Heading,
  Modal,
  ModalOverlay,
} from 'react-aria-components';
import {useIntl, type IntlShape} from 'react-intl';
import type {
  Citation,
  IndiView,
  LoadedTree,
  NoteText,
  PersonName,
} from '../gedcom/types';
import {useAppState, useDispatch} from '../store';
import {CiteRefs, SourceItem} from './cite';
import {AssociationLine, EventItem, NonEventItem} from './events';
import {displayName, initials, lifeSpan} from './format';
import {Icon} from './icons';
import {localName, nameForms, pickVariant} from './lang';
import {langArg, NoteView} from './NoteView';
import {safeHref} from './html';
import {ExternalIdItem} from './exid';
import {blockedHosts, mediaEntries, type MediaEntry} from './media';
import {RemoteOff} from './MediaParts';
import {PersonLink} from './PersonLink';
import {HiddenNote, parentsLabel, statusText} from './relatives';
import {
  CitationIndex,
  cardEvents,
  relativesOf,
  splitByResn,
  type ChildEntry,
} from './treeInfo';
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
          {tree && indi && (
            <FullCardBody key={indi.id} tree={tree} indi={indi} />
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function FullCardBody({tree, indi}: {tree: LoadedTree; indi: IndiView}) {
  const intl = useIntl();
  const dispatch = useDispatch();
  const {settings, lang, fullCardSection} = useAppState();
  // Opened at a section («ещё N» media on the card): bring it into view.
  useEffect(() => {
    if (!fullCardSection) return;
    const frame = requestAnimationFrame(() =>
      document
        .getElementById(`full-${fullCardSection}`)
        ?.scrollIntoView({block: 'start'}),
    );
    return () => cancelAnimationFrame(frame);
  }, [fullCardSection]);
  // Reveal applies to this card only: the body is re-created per person.
  const [reveal, setReveal] = useState(false);
  const t = (id: string) => intl.formatMessage({id});
  const dateOpts = {locale: intl.locale, style: settings.dateStyle};
  const hide = settings.hideRestricted && !reveal;
  const fileLang = tree.parse.language;

  const items = useMemo(() => cardEvents(tree, indi), [tree, indi]);
  const events = useMemo(
    () => splitByResn(items, (i) => i.event, hide),
    [items, hide],
  );
  const notes = useMemo(
    () => splitByResn(indi.notes, restrictionsOf, hide),
    [indi, hide],
  );
  const media = splitByResn(indi.media, (m) => m, hide);
  const entries = mediaEntries(tree, indi, {
    hide,
    allowRemote: settings.loadRemoteMedia,
  });
  const hiddenRecords = [
    ...events.hidden.map((i) => i.event),
    ...notes.hidden.map(restrictionsOf),
    ...media.hidden,
  ];
  const noEvents = useMemo(
    () => [
      ...indi.nonEvents,
      ...indi.fams.flatMap((id) => tree.fams.get(id)?.nonEvents ?? []),
    ],
    [tree, indi],
  );
  const rel = relativesOf(tree, indi);

  // Numbers are assigned once, in reading order, for what is on screen.
  const index = useMemo(() => {
    const idx = new CitationIndex();
    const add = (cs: readonly Citation[]) => cs.forEach((c) => idx.add(c));
    const ofNotes = (ns: readonly NoteText[]) =>
      ns.forEach((n) => add(n.citations));
    add(indi.citations);
    events.visible.forEach(({event: e}) => {
      e.associations.forEach((a) => {
        add(a.citations);
        ofNotes(a.notes);
      });
      ofNotes(e.notes);
      ofNotes(e.place?.notes ?? []);
      add(e.citations);
    });
    noEvents.forEach((ne) => {
      add(ne.citations);
      ofNotes(ne.notes);
    });
    indi.associations.forEach((a) => {
      add(a.citations);
      ofNotes(a.notes);
    });
    // The person's notes, as shown (restricted ones only when revealed).
    ofNotes(notes.visible);
    return idx;
  }, [indi, noEvents, events, notes]);

  const name = localName(indi, lang, fileLang);
  const life = lifeSpan(indi, dateOpts);
  const subtitle = [life, indi.sex ? t(`sex.${indi.sex}`) : '']
    .filter(Boolean)
    .join(' · ');
  const closeCard = () => dispatch({type: 'setFullCard', open: false});

  const hasService =
    indi.uids.length > 0 ||
    indi.restrictions.length > 0 ||
    indi.extensions.length > 0;

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

      {hide && hiddenRecords.length > 0 && (
        <div className="full__section">
          <HiddenNote
            records={hiddenRecords}
            onReveal={() => setReveal(true)}
          />
        </div>
      )}

      <Section id="names" title={t('full.names')} show={indi.names.length > 0}>
        {indi.names.map((n, i) => (
          <NameRow key={i} name={n} fileLang={fileLang} />
        ))}
        {indi.citations.length > 0 && (
          <CiteRefs citations={indi.citations} index={index} />
        )}
      </Section>

      <Section
        id="events"
        title={t('full.events')}
        show={events.visible.length > 0 || noEvents.length > 0}
      >
        <ol className="events events--full">
          {events.visible.map((item, i) => (
            <EventItem
              key={i}
              tree={tree}
              indi={indi}
              item={item}
              full
              index={index}
              onSelect={closeCard}
            />
          ))}
        </ol>
        {noEvents.length > 0 && (
          <ul
            className="events events--full events--none"
            aria-label={t('event.none')}
          >
            {noEvents.map((ne, i) => (
              <NonEventItem key={i} ne={ne} index={index} />
            ))}
          </ul>
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
        show={rel.parents.length + rel.spouses.length > 0}
      >
        {rel.parents.map((g) => (
          <div key={g.famId} className="family__group">
            <div className="muted">{parentsLabel(intl, g)}</div>
            <div className="chips" data-status={g.status}>
              {g.people.map((p) => (
                <PersonLink
                  key={p.id}
                  id={p.id}
                  className="chip"
                  data-disputed={g.status === 'CHALLENGED' || undefined}
                  data-disproven={g.status === 'DISPROVEN' || undefined}
                  onSelect={closeCard}
                >
                  {localName(p, lang, fileLang)}
                </PersonLink>
              ))}
              {g.voids.map((v, i) => (
                <span key={i} className="chip chip--void">
                  «{v}»{' '}
                  <span className="event__muted">{t('event.noRecord')}</span>
                </span>
              ))}
            </div>
            {g.status && (
              <div role="note" className="note-warn">
                <strong>{statusText(intl, g.status)}</strong>
                {g.statusPhrase && <span>{g.statusPhrase}</span>}
              </div>
            )}
          </div>
        ))}
        {rel.spouses.map((s) => (
          <div key={s.famId} className="family__group">
            <div className="muted">
              {t(
                s.spouse?.sex === 'F'
                  ? 'rel.wife'
                  : s.spouse?.sex === 'M'
                    ? 'rel.husband'
                    : 'rel.spouse',
              )}
            </div>
            {s.spouse ? (
              <PersonLine p={s.spouse} onSelect={closeCard} />
            ) : s.phrase ? (
              <div>
                «{s.phrase}»{' '}
                <span className="event__muted">{t('event.noRecord')}</span>
              </div>
            ) : null}
            {s.children.length + s.voidChildren.length > 0 && (
              <>
                <div className="muted">{t('rel.children')}</div>
                {s.children.map((c) => (
                  <ChildLine key={c.indi.id} entry={c} onSelect={closeCard} />
                ))}
                {s.voidChildren.map((v, i) => (
                  <div key={`v${i}`}>
                    «{v}»{' '}
                    <span className="event__muted">{t('event.noRecord')}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        ))}
      </Section>

      <Section
        id="associations"
        title={t('full.associations')}
        show={indi.associations.length > 0}
      >
        {indi.associations.map((a, i) => (
          <AssociationLine
            key={i}
            tree={tree}
            assoc={a}
            index={index}
            full
            onSelect={closeCard}
          />
        ))}
      </Section>

      <Section
        id="sources"
        title={t('full.sources')}
        show={index.items.length > 0}
      >
        <ol className="sources">
          {index.items.map(({n, citation}) => (
            <SourceItem key={n} n={n} citation={citation} tree={tree} />
          ))}
        </ol>
      </Section>

      <Section
        id="notes"
        title={t('full.notes')}
        show={notes.visible.length > 0}
      >
        {notes.visible.map((n, i) => (
          <div key={i}>
            <NoteView note={n} sources={index} />
            {n.sharedNoteId && (
              <div className="muted">{t('full.sharedNote')}</div>
            )}
          </div>
        ))}
      </Section>

      <Section id="media" title={t('full.media')} show={entries.length > 0}>
        {entries.map((e, i) => (
          <MediaItem
            key={i}
            entry={e}
            onView={() =>
              dispatch({
                type: 'openViewer',
                id: indi.id,
                index: i,
                revealed: !hide,
              })
            }
          />
        ))}
        {blockedHosts(entries).length > 0 && (
          <RemoteOff hosts={blockedHosts(entries)} />
        )}
      </Section>

      <Section id="links" title={t('full.links')} show={indi.exids.length > 0}>
        <ul className="links">
          {indi.exids.map((x, i) => (
            <li key={i}>
              <ExternalIdItem id={x} />
            </li>
          ))}
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
                  {indi.uids.map((u) => (
                    <div key={u}>
                      <code>{u}</code>
                    </div>
                  ))}
                </dd>
              </>
            )}
            {indi.restrictions.length > 0 && (
              <>
                <dt>{t('full.restrictions')}</dt>
                <dd className="badges">
                  {indi.restrictions.map((r) => (
                    <span key={r} className="badge">
                      {resnLabel(intl, r)}
                    </span>
                  ))}
                </dd>
              </>
            )}
            {indi.extensions.length > 0 && (
              <>
                <dt>{t('full.extensions')}</dt>
                <dd>
                  {indi.extensions.map((x) => (
                    <div key={x.tag + x.node.line}>
                      <code>{x.tag}</code>{' '}
                      {x.uri ? (
                        <code className="muted">{x.uri}</code>
                      ) : (
                        <span className="muted">{t('full.schemaMissing')}</span>
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

const restrictionsOf = (x: object) =>
  // NoteText has no RESN in the contract yet; honoured when the model adds it.
  x as {restrictions?: readonly string[]};

/** Label of a RESN value; unknown (extension) values are shown as written. */
export function resnLabel(intl: IntlShape, r: string): string {
  return `resn.${r}` in intl.messages
    ? intl.formatMessage({id: `resn.${r}`})
    : r;
}

/** A link only for http(s) URLs; otherwise the value with its type URI. */

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

/**
 * One NAME: the form in the UI language first (when NAME.TRAN has it), the
 * other forms below with their language.
 */
function NameRow({name, fileLang}: {name: PersonName; fileLang?: string}) {
  const intl = useIntl();
  const {lang} = useAppState();
  const forms = nameForms(name, fileLang);
  const main = pickVariant(forms, lang);
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
        <span className="name-main" lang={forms[main]?.lang}>
          {forms[main]?.display}
        </span>{' '}
        {note && <span className="muted">· {note}</span>}
      </div>
      {forms.map(
        (f, i) =>
          i !== main && (
            <div key={i}>
              <span lang={f.lang}>{f.display}</span>{' '}
              <span className="muted">
                ·{' '}
                {intl.formatMessage(
                  {
                    id: f.original ? 'variant.original' : 'variant.translation',
                  },
                  {lang: langArg(f.lang)},
                )}
              </span>
            </div>
          ),
      )}
    </>
  );
}

function PersonLine({p, onSelect}: {p: IndiView; onSelect: () => void}) {
  const intl = useIntl();
  const {settings, lang, tree} = useAppState();
  const life = lifeSpan(p, {locale: intl.locale, style: settings.dateStyle});
  return (
    <div>
      <PersonLink id={p.id} onSelect={onSelect}>
        {localName(p, lang, tree?.parse.language) || displayName(p)}
      </PersonLink>{' '}
      <span className="muted">{life}</span>
    </div>
  );
}

/** A child; a pedigree other than birth and a disproven link are marked. */
function ChildLine({
  entry,
  onSelect,
}: {
  entry: ChildEntry;
  onSelect: () => void;
}) {
  const intl = useIntl();
  const {link} = entry;
  const pedigree =
    link?.pedigree && link.pedigree !== 'BIRTH'
      ? [
          `pedi.${link.pedigree}` in intl.messages
            ? intl.formatMessage({id: `pedi.${link.pedigree}`})
            : link.pedigree.toLowerCase(),
          link.pedigreePhrase ? `«${link.pedigreePhrase}»` : '',
        ]
          .filter(Boolean)
          .join(' ')
      : '';
  return (
    <div
      data-disproven={link?.status === 'DISPROVEN' || undefined}
      className="child"
    >
      <PersonLine p={entry.indi} onSelect={onSelect} />
      {(pedigree || link?.status) && (
        <span className="muted">
          {[pedigree, link?.status ? statusText(intl, link.status) : '']
            .filter(Boolean)
            .join(' ')}
        </span>
      )}
    </div>
  );
}

function MediaItem({entry, onView}: {entry: MediaEntry; onView: () => void}) {
  const intl = useIntl();
  const [failed, setFailed] = useState(false);
  const {media, file, src, remote, image, title} = entry;
  const link = remote ? safeHref(file.path) : undefined;
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
  const empty = (id: string) => (
    <span className="media__thumb media__thumb--empty" aria-hidden="true">
      {intl.formatMessage({id})}
    </span>
  );
  return (
    <div className="media">
      {image && src && !failed ? (
        <Button
          className="media__open"
          aria-label={intl.formatMessage({id: 'card.mediaOpen'}, {title})}
          onPress={onView}
        >
          <img
            className="media__thumb"
            src={src}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        </Button>
      ) : failed ? (
        empty('media.failed')
      ) : remote && !src ? (
        empty('media.remoteOff')
      ) : (
        empty('media.noPreview')
      )}
      <div className="media__text">
        <span className="media__title">{title}</span>
        <span className="muted">{meta.join(' · ')}</span>
        {link && (
          <a
            className="link"
            href={link}
            target="_blank"
            rel="noopener noreferrer"
          >
            {intl.formatMessage({id: 'media.open'})} ↗
          </a>
        )}
      </div>
    </div>
  );
}
