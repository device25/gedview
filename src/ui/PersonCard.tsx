import {useLayoutEffect, useState, type PointerEvent} from 'react';
import {Button} from 'react-aria-components';
import {useIntl} from 'react-intl';
import type {IndiView} from '../gedcom/types';
import {useAppState, useDispatch, useIsMobile} from '../store';
import {EventItem} from './events';
import {lifeSpan} from './format';
import {Tip} from './Tip';
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

/** How far a finger must move on the sheet's top to count as a swipe. */
const SWIPE = 24;

/** The height the sheet takes from the chart on a phone, as `--sheet-h`
 *  on the page, so the chart ends where the sheet begins. */
function setSheetHeight(el: HTMLElement) {
  document.documentElement.style.setProperty(
    '--sheet-h',
    `${Math.round(el.offsetHeight)}px`,
  );
}

function useSheetHeight(el: HTMLElement | null, on: boolean) {
  // Every render: raising or lowering the sheet re-renders the card.
  useLayoutEffect(() => {
    if (el && on) setSheetHeight(el);
  });
  // And whatever else changes its height (fonts, a window resize).
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!el || !on) {
      root.style.removeProperty('--sheet-h');
      return;
    }
    const ro = new ResizeObserver(() => setSheetHeight(el));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--sheet-h');
    };
  }, [el, on]);
}

export function PersonCard() {
  const {
    tree,
    selectedId,
    rootId,
    cardOpen,
    cardExpanded,
    sheetUp,
    settings,
    lang,
  } = useAppState();
  const dispatch = useDispatch();
  const intl = useIntl();
  const isMobile = useIsMobile();
  const [sheet, setSheet] = useState<HTMLElement | null>(null);
  useSheetHeight(sheet, isMobile && cardOpen);
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

  // On a phone the sheet goes up and down; elsewhere the card minimises.
  const expanded = isMobile ? sheetUp : cardExpanded;
  const toggle = () =>
    isMobile
      ? dispatch({type: 'setSheetUp', up: !sheetUp})
      : dispatch({type: 'toggleCardExpanded'});
  // A swipe ends wherever the finger is lifted, often off the card; the
  // browser may also take the gesture over (pointercancel), so the last
  // position seen counts.
  const swipeStart = (e: PointerEvent) => {
    if (!isMobile) return;
    const from = e.clientY;
    let last = from;
    const move = (m: globalThis.PointerEvent) => {
      last = m.clientY;
    };
    const end = (u: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      const dy = (u.type === 'pointerup' ? u.clientY : last) - from;
      if (dy < -SWIPE) dispatch({type: 'setSheetUp', up: true});
      if (dy > SWIPE) dispatch({type: 'setSheetUp', up: false});
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const close = () => {
    dispatch({type: 'setCardOpen', open: false});
    focusShowCard();
  };

  return (
    <aside
      ref={setSheet}
      className="card"
      aria-labelledby="card-name"
      data-expanded={expanded || undefined}
    >
      <Button
        className="card__handle"
        aria-label={t(expanded ? 'card.minimize' : 'card.expand')}
        aria-expanded={expanded}
        onPress={toggle}
        onPointerDown={swipeStart}
      >
        <span />
      </Button>
      <header className="card__head" onPointerDown={swipeStart}>
        {/* On a phone a tap on the name raises the sheet; the handle is the
            control for keyboards and screen readers. */}
        <div
          className="card__title"
          onClick={
            isMobile && !sheetUp
              ? () => dispatch({type: 'setSheetUp', up: true})
              : undefined
          }
        >
          <h2 id="card-name">{name}</h2>
          <div className="card__life">{life}</div>
        </div>
        <Tip
          label={t(cardExpanded ? 'card.minimize' : 'card.expand')}
          placement="bottom"
        >
          <Button
            className="icon-btn card__minimize"
            aria-label={t(cardExpanded ? 'card.minimize' : 'card.expand')}
            aria-expanded={cardExpanded}
            onPress={() => dispatch({type: 'toggleCardExpanded'})}
          >
            <Icon
              name={cardExpanded ? 'chevronUp' : 'chevronDown'}
              size={18}
              strokeWidth={2}
            />
          </Button>
        </Tip>
        <Tip label={t('card.close')} shortcut="Esc" placement="bottom">
          <Button
            className="icon-btn"
            aria-label={t('card.close')}
            onPress={close}
          >
            <Icon name="close" size={18} strokeWidth={2} />
          </Button>
        </Tip>
      </header>

      {expanded && (
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

          {rootId !== indi.id && (
            <Button
              className="btn btn--ghost card__reroot"
              onPress={() => dispatch({type: 'reroot', id: indi.id})}
            >
              {t('card.reroot')}
            </Button>
          )}
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
