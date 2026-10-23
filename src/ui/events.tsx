import {useIntl, type IntlShape} from 'react-intl';
import type {
  Association,
  EventDetail,
  IndiView,
  LoadedTree,
} from '../gedcom/types';
import {useAppState} from '../store';
import {formatAge, formatDate} from './format';
import {PersonLink} from './PersonLink';
import {isRestricted, type CardEvent} from './treeInfo';

const has = (intl: IntlShape, id: string) => id in intl.messages;

export function eventLabel(
  intl: IntlShape,
  e: Pick<EventDetail, 'tag' | 'type'>,
): string {
  // Free-form events carry their own name in TYPE.
  if ((e.tag === 'EVEN' || e.tag === 'FACT') && e.type) return e.type;
  const id = `event.${e.tag}`;
  return has(intl, id) ? intl.formatMessage({id}) : e.tag;
}

export function roleLabel(
  intl: IntlShape,
  a: Association,
  sex?: IndiView['sex'],
): string {
  if (a.role) {
    for (const id of [`role.${a.role}.${sex}`, `role.${a.role}`]) {
      if (has(intl, id)) return intl.formatMessage({id});
    }
  }
  return a.rolePhrase ?? a.role ?? '';
}

/** Events that stay visible, and how many were hidden by RESN. */
export function splitRestricted(
  items: CardEvent[],
  hide: boolean,
  reveal: boolean,
): {visible: CardEvent[]; hidden: number} {
  if (!hide || reveal) return {visible: items, hidden: 0};
  const visible = items.filter((i) => !isRestricted(i.event));
  return {visible, hidden: items.length - visible.length};
}

interface EventItemProps {
  tree: LoadedTree;
  indi: IndiView;
  item: CardEvent;
  /** Full card: ages, spouse, source references. */
  full?: boolean;
  /** Registers a citation and returns its number (full card only). */
  cite?: (c: EventDetail['citations'][number]) => number;
  onCiteClick?: (n: number) => void;
  onSelect?: () => void;
}

export function EventItem({
  tree,
  indi,
  item,
  full,
  cite,
  onCiteClick,
  onSelect,
}: EventItemProps) {
  const intl = useIntl();
  const {settings} = useAppState();
  const {event: e, famId} = item;
  const dateOpts = {locale: intl.locale, style: settings.dateStyle};
  const date = formatDate(e.date, dateOpts);
  const showValue = e.value && e.value !== 'Y';

  let partner: IndiView | undefined;
  let age = e.age;
  if (famId) {
    const fam = tree.fams.get(famId);
    const me = fam?.partners.find((p) => p.indiId === indi.id);
    const other = fam?.partners.find((p) => p.indiId && p.indiId !== indi.id);
    partner = other?.indiId ? tree.indis.get(other.indiId) : undefined;
    age = me?.role === 'HUSB' ? e.husbandAge : e.wifeAge;
  }
  const refs = cite ? e.citations.map(cite) : [];

  return (
    <li className="event">
      <span className="event__label">{eventLabel(intl, e)}</span>
      <span className="event__body">
        {date && <span className="event__date">{date}</span>}
        {e.date?.phrase && e.date.value.kind !== 'empty' && (
          <span className="event__muted">«{e.date.phrase}»</span>
        )}
        {showValue && <span>{e.value}</span>}
        {full && partner && (
          <span className="event__line">
            {intl.formatMessage({id: 'event.with'})}{' '}
            <PersonLink id={partner.id} onSelect={onSelect}>
              {partner.names[0]?.display}
            </PersonLink>
          </span>
        )}
        {e.place && <span className="event__place">{e.place.raw}</span>}
        {full && age && (
          <span className="event__line">
            {intl.formatMessage({id: 'event.age'}, {age: formatAge(age, intl)})}
          </span>
        )}
        {e.associations.map((a, i) => {
          const target = a.indiId ? tree.indis.get(a.indiId) : undefined;
          return (
            <span className="event__line" key={i}>
              {roleLabel(intl, a, target?.sex)}{' '}
              {target ? (
                <PersonLink id={target.id} onSelect={onSelect}>
                  {target.names[0]?.display}
                </PersonLink>
              ) : (
                <>
                  «{a.phrase}»{' '}
                  <span className="event__muted">
                    {intl.formatMessage({id: 'event.noRecord'})}
                  </span>
                </>
              )}
            </span>
          );
        })}
        {refs.length > 0 && (
          <span className="event__muted">
            {intl.formatMessage({id: 'event.sources'}, {count: refs.length})}{' '}
            {refs.map((n, i) => (
              <span key={n}>
                {i > 0 && ', '}
                <button
                  type="button"
                  className="link link--btn"
                  onClick={() => onCiteClick?.(n)}
                >
                  [{n}]
                </button>
              </span>
            ))}
          </span>
        )}
      </span>
    </li>
  );
}
