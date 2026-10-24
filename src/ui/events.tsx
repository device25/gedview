import {useIntl, type IntlShape} from 'react-intl';
import type {
  Association,
  EventDetail,
  IndiView,
  LoadedTree,
  NonEvent,
  Place,
} from '../gedcom/types';
import {useAppState} from '../store';
import {CiteRefs} from './cite';
import {formatAge, formatDate, formatPlace} from './format';
import {localName} from './lang';
import {NoteView} from './NoteView';
import {ExternalIdItem} from './exid';
import {pickVariant, variantsOf} from './lang';
import {PersonLink} from './PersonLink';
import {isRestricted, type CardEvent, type CitationIndex} from './treeInfo';

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

/**
 * Label of the role the associate plays. A role PHRASE overrides the
 * enumerated role; the gendered form is used when the associate's sex is
 * known and the language has one (`role.GODP.F`).
 */
export function roleLabel(
  intl: IntlShape,
  a: Pick<Association, 'role' | 'rolePhrase'>,
  sex?: IndiView['sex'],
): string {
  if (a.rolePhrase) return a.rolePhrase;
  if (a.role) {
    for (const id of [`role.${a.role}.${sex}`, `role.${a.role}`]) {
      if (has(intl, id)) return intl.formatMessage({id});
    }
  }
  return a.role ?? '';
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

/** One association: "Godfather: Name" or a phrase for a missing record. */
export function AssociationLine({
  tree,
  assoc: a,
  index,
  full,
  onSelect,
}: {
  tree: LoadedTree;
  assoc: Association;
  index?: CitationIndex;
  full?: boolean;
  onSelect?: () => void;
}) {
  const intl = useIntl();
  const {lang} = useAppState();
  const target = a.indiId ? tree.indis.get(a.indiId) : undefined;
  const label = roleLabel(intl, a, target?.sex);
  return (
    <span className="event__line">
      {label && <span className="assoc__role">{label}: </span>}
      {target ? (
        <PersonLink id={target.id} onSelect={onSelect}>
          {localName(target, lang, tree.parse.language)}
        </PersonLink>
      ) : (
        <>
          {a.phrase ? `«${a.phrase}»` : (a.indiId ?? '')}{' '}
          <span className="event__muted">
            {intl.formatMessage({id: 'event.noRecord'})}
          </span>
        </>
      )}
      {index && a.citations.length > 0 && (
        <>
          {' '}
          <CiteRefs citations={a.citations} index={index} />
        </>
      )}
      {full &&
        a.notes.map((n, i) => <NoteView key={i} note={n} sources={index} />)}
    </span>
  );
}

/** A "did not happen" entry (INDI.NO / FAM.NO). */
export function NonEventItem({
  ne,
  index,
}: {
  ne: NonEvent;
  index: CitationIndex;
}) {
  const intl = useIntl();
  const {settings} = useAppState();
  const dateOpts = {locale: intl.locale, style: settings.dateStyle};
  const text = has(intl, `noevent.${ne.tag}`)
    ? intl.formatMessage({id: `noevent.${ne.tag}`})
    : intl.formatMessage({id: 'event.noneText'}, {event: eventLabel(intl, ne)});
  return (
    <li className="event">
      <span className="event__label">
        {intl.formatMessage({id: 'event.none'})}
      </span>
      <span className="event__body">
        <span>
          {text}
          {ne.date && <> · {formatDate(ne.date, dateOpts)}</>}
        </span>
        {ne.citations.length > 0 && (
          <CiteRefs citations={ne.citations} index={index} />
        )}
        {ne.notes.map((n, i) => (
          <NoteView key={i} note={n} sources={index} />
        ))}
      </span>
    </li>
  );
}

interface EventItemProps {
  tree: LoadedTree;
  indi: IndiView;
  item: CardEvent;
  /** Full card: spouse, notes, source references. */
  full?: boolean;
  /** Source numbering of the full card. */
  index?: CitationIndex;
  onSelect?: () => void;
}

export function EventItem({
  tree,
  indi,
  item,
  full,
  index,
  onSelect,
}: EventItemProps) {
  const intl = useIntl();
  const {settings, lang} = useAppState();
  const {event: e, famId} = item;
  const dateOpts = {locale: intl.locale, style: settings.dateStyle};
  const date = formatDate(e.date, dateOpts);
  const showValue = e.value && e.value !== 'Y';
  // TYPE of EVEN/FACT is the label; on other events it qualifies it.
  const subtype =
    e.type && e.tag !== 'EVEN' && e.tag !== 'FACT' ? e.type : undefined;

  let partner: IndiView | undefined;
  let age = e.age;
  if (famId) {
    const fam = tree.fams.get(famId);
    const me = fam?.partners.find((p) => p.indiId === indi.id);
    const other = fam?.partners.find((p) => p.indiId && p.indiId !== indi.id);
    partner = other?.indiId ? tree.indis.get(other.indiId) : undefined;
    age = me?.role === 'HUSB' ? e.husbandAge : e.wifeAge;
  }

  return (
    <li className="event">
      <span className="event__label">{eventLabel(intl, e)}</span>
      <span className="event__body">
        {date && <span className="event__date">{date}</span>}
        {e.date?.phrase && e.date.value.kind !== 'empty' && (
          <span className="event__muted">«{e.date.phrase}»</span>
        )}
        {subtype && <span className="event__muted">{subtype}</span>}
        {showValue && <span>{e.value}</span>}
        {full && partner && (
          <span className="event__line">
            {intl.formatMessage({id: 'event.with'})}{' '}
            <PersonLink id={partner.id} onSelect={onSelect}>
              {localName(partner, lang, tree.parse.language)}
            </PersonLink>
          </span>
        )}
        {e.place && (
          <span className="event__place">{placeName(e.place, lang)}</span>
        )}
        {full &&
          e.place?.notes.map((n, i) => (
            <NoteView key={`p${i}`} note={n} sources={index} />
          ))}
        {full && e.place && e.place.exids.length > 0 && (
          <span className="event__line">
            {e.place.exids.map((x, i) => (
              <span key={i}>
                {i > 0 && ' · '}
                <ExternalIdItem id={x} compact />
              </span>
            ))}
          </span>
        )}
        {age && (
          <span className="event__line">
            {intl.formatMessage({id: 'event.age'}, {age: formatAge(age, intl)})}
          </span>
        )}
        {e.associations.map((a, i) => (
          <AssociationLine
            key={i}
            tree={tree}
            assoc={a}
            index={index}
            full={full}
            onSelect={onSelect}
          />
        ))}
        {full && e.restrictions.includes('LOCKED') && (
          <span className="badge">
            {intl.formatMessage({id: 'resn.LOCKED'})}
          </span>
        )}
        {full &&
          e.notes.map((n, i) => <NoteView key={i} note={n} sources={index} />)}
        {index && e.citations.length > 0 && (
          <CiteRefs citations={e.citations} index={index} />
        )}
      </span>
    </li>
  );
}

/** A place in the UI language when the file has its translation (PLAC.TRAN
 *  with LANG), else as written. */
export function placeName(place: Place, ui: string): string {
  const variants = variantsOf(
    {raw: place.raw, parts: place.parts, lang: place.lang},
    place.translations,
  );
  return formatPlace(variants[pickVariant(variants, ui)]!.value);
}
