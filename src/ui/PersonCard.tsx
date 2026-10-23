import {Button} from 'react-aria-components';
import {useIntl} from 'react-intl';
import {useAppState, useDispatch} from '../store';
import {EventItem, splitRestricted} from './events';
import {displayName, lifeSpan} from './format';
import {Icon} from './icons';
import {PersonLink} from './PersonLink';
import {cardEvents, countCitations, relativesOf} from './treeInfo';
import './card.css';

const SHOW_CARD_ID = 'show-card';

/** After the card closes, focus would be lost: send it to "Show card". */
export function focusShowCard() {
  setTimeout(() => document.getElementById(SHOW_CARD_ID)?.focus(), 0);
}

export function PersonCard() {
  const {tree, selectedId, cardOpen, cardExpanded, settings} = useAppState();
  const dispatch = useDispatch();
  const intl = useIntl();
  const indi = selectedId ? tree?.indis.get(selectedId) : undefined;
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

  const name = displayName(indi);
  const life = lifeSpan(indi, {locale: intl.locale, style: settings.dateStyle});
  const items = cardEvents(tree, indi);
  const {visible, hidden} = splitRestricted(
    items,
    settings.hideRestricted,
    false,
  );
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
        visible.map((v) => v.event),
      ),
    ),
    countPart(intl, 'count.notes', indi.notes.length),
    countPart(intl, 'count.media', indi.media.length),
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
            {visible.map((item, i) => (
              <EventItem key={i} tree={tree} indi={indi} item={item} />
            ))}
          </ol>
          {hidden > 0 && (
            <p className="muted">
              {intl.formatMessage({id: 'card.hidden'}, {count: hidden})}
            </p>
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
                label={labelOf(
                  intl,
                  g.pedigree && g.pedigree !== 'BIRTH'
                    ? `rel.parents.${g.pedigree}`
                    : 'rel.parents',
                  'rel.parents',
                )}
                people={g.people}
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
}: {
  label: string;
  people: Array<{id: string; names: Array<{display: string}>}>;
}) {
  return (
    <div className="relatives__row">
      <dt>{label}</dt>
      <dd>
        {people.map((p) => (
          <PersonLink key={p.id} id={p.id}>
            {p.names[0]?.display ?? p.id}
          </PersonLink>
        ))}
      </dd>
    </div>
  );
}

export function labelOf(
  intl: ReturnType<typeof useIntl>,
  id: string,
  fallback: string,
): string {
  return intl.formatMessage({id: id in intl.messages ? id : fallback});
}

function countPart(
  intl: ReturnType<typeof useIntl>,
  id: string,
  count: number,
): string {
  return count > 0 ? intl.formatMessage({id}, {count}) : '';
}
