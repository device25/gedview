import {useState} from 'react';
import {Button} from 'react-aria-components';
import {useIntl} from 'react-intl';
import type {IndiView} from '../gedcom/types';
import {useAppState, useDispatch} from '../store';
import {EventItem} from './events';
import {lifeSpan} from './format';
import {Icon} from './icons';
import {localName} from './lang';
import {PersonLink} from './PersonLink';
import {HiddenNote, parentsLabel} from './relatives';
import {cardEvents, countCitations, relativesOf, splitByResn} from './treeInfo';
import './card.css';

const SHOW_CARD_ID = 'show-card';

/** After the card closes, focus would be lost: send it to "Show card". */
export function focusShowCard() {
  setTimeout(() => document.getElementById(SHOW_CARD_ID)?.focus(), 0);
}

export function PersonCard() {
  const {tree, selectedId, cardOpen, cardExpanded, settings, lang} =
    useAppState();
  const dispatch = useDispatch();
  const intl = useIntl();
  // The person whose restricted details were revealed (this card only).
  const [revealedFor, setRevealedFor] = useState<string>();
  const indi = selectedId ? tree?.indis.get(selectedId) : undefined;
  // Reveal is for one person at a time: moving to anyone else hides again.
  if (revealedFor && revealedFor !== selectedId) setRevealedFor(undefined);
  if (!tree || !indi) return null;
  const t = (id: string) => intl.formatMessage({id});

  if (!cardOpen) {
    return (
      <Button
        id={SHOW_CARD_ID}
        className="card-show"
        onPress={() => dispatch({type: 'setCardOpen', open: true})}
      >
        {t('card.show')}
      </Button>
    );
  }

  const fileLang = tree.parse.language;
  const name = localName(indi, lang, fileLang);
  const life = lifeSpan(indi, {locale: intl.locale, style: settings.dateStyle});
  const items = cardEvents(tree, indi);
  const hide = settings.hideRestricted && revealedFor !== indi.id;
  const events = splitByResn(items, (i) => i.event, hide);
  const media = splitByResn(indi.media, (m) => m, hide);
  const notes = splitByResn(
    indi.notes,
    (n) => n as {restrictions?: readonly string[]}, // see FullCard
    hide,
  );
  const hiddenRecords = [
    ...events.hidden.map((i) => i.event),
    ...media.hidden,
    ...notes.hidden.map((n) => n as {restrictions?: readonly string[]}),
  ];
  const rel = relativesOf(tree, indi);
  const disputed = indi.famc.find(
    (l) => l.status === 'CHALLENGED' || l.status === 'DISPROVEN',
  );

  const counts = [
    countPart(
      intl,
      'count.sources',
      countCitations(
        indi,
        events.visible.map((v) => v.event),
      ),
    ),
    countPart(intl, 'count.notes', notes.visible.length),
    countPart(intl, 'count.media', media.visible.length),
  ]
    .filter(Boolean)
    .join(' · ');

  const close = () => {
    dispatch({type: 'setCardOpen', open: false});
    focusShowCard();
  };

  return (
    <aside
      className="card"
      aria-labelledby="card-name"
      data-expanded={cardExpanded || undefined}
    >
      <Button
        className="card__handle"
        aria-label={t('card.minimize')}
        aria-expanded={cardExpanded}
        onPress={() => dispatch({type: 'toggleCardExpanded'})}
      >
        <span />
      </Button>
      <header className="card__head">
        <div className="card__title">
          <h2 id="card-name">{name}</h2>
          <div className="card__life">{life}</div>
        </div>
        <Button
          className="icon-btn card__minimize"
          aria-label={t('card.minimize')}
          aria-expanded={cardExpanded}
          onPress={() => dispatch({type: 'toggleCardExpanded'})}
        >
          <Icon
            name={cardExpanded ? 'chevronUp' : 'chevronDown'}
            size={18}
            strokeWidth={2}
          />
        </Button>
        <Button
          className="icon-btn"
          aria-label={t('card.close')}
          onPress={close}
        >
          <Icon name="close" size={18} strokeWidth={2} />
        </Button>
      </header>

      {cardExpanded && (
        <div className="card__body">
          <ol className="events">
            {events.visible.map((item, i) => (
              <EventItem key={i} tree={tree} indi={indi} item={item} />
            ))}
          </ol>
          {hiddenRecords.length > 0 && (
            <HiddenNote
              records={hiddenRecords}
              onReveal={() => setRevealedFor(indi.id)}
            />
          )}

          {disputed && (
            <div role="note" className="note-warn">
              <strong>
                {t(
                  disputed.status === 'DISPROVEN'
                    ? 'card.disprovenParents'
                    : 'card.disputedParents',
                )}
              </strong>
              {disputed.statusPhrase && <span>{disputed.statusPhrase}</span>}
            </div>
          )}

          <dl className="relatives">
            {rel.parents.map((g) => (
              <Group
                key={g.famId}
                label={parentsLabel(intl, g, {plainBirth: true})}
                people={g.people}
                disproven={g.status === 'DISPROVEN'}
              />
            ))}
            {rel.spouses.map(
              (s) =>
                s.spouse && (
                  <Group
                    key={s.famId}
                    label={t(
                      s.spouse.sex === 'F'
                        ? 'rel.wife'
                        : s.spouse.sex === 'M'
                          ? 'rel.husband'
                          : 'rel.spouse',
                    )}
                    people={[s.spouse]}
                  />
                ),
            )}
            {rel.children.length > 0 && (
              <Group label={t('rel.children')} people={rel.children} />
            )}
          </dl>

          <div className="card__foot">
            <Button
              className="btn"
              onPress={() => dispatch({type: 'setFullCard', open: true})}
            >
              {t('card.more')}
              <Icon name="chevronRight" size={14} strokeWidth={2} />
            </Button>
            <span className="muted">{counts}</span>
          </div>
        </div>
      )}
    </aside>
  );
}

function Group({
  label,
  people,
  disproven,
}: {
  label: string;
  people: IndiView[];
  disproven?: boolean;
}) {
  const {lang, tree} = useAppState();
  return (
    <div className="relatives__row">
      <dt>{label}</dt>
      <dd>
        {people.map((p) => (
          <PersonLink
            key={p.id}
            id={p.id}
            data-disproven={disproven || undefined}
          >
            {localName(p, lang, tree?.parse.language)}
          </PersonLink>
        ))}
      </dd>
    </div>
  );
}

function countPart(
  intl: ReturnType<typeof useIntl>,
  id: string,
  count: number,
): string {
  return count > 0 ? intl.formatMessage({id}, {count}) : '';
}
