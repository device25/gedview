import {lazy, Suspense, useMemo, useState} from 'react';
import {
  Button,
  Radio,
  RadioGroup,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from 'react-aria-components';
import {useIntl} from 'react-intl';
import {
  EVENT_KINDS,
  personPath,
  placeIndex,
  spread,
  type EventKind,
  type MapPlace,
} from '../model/places';
import {useAppState, useDispatch} from '../store';
import type {MapView} from '../store/reducer';
import {eventLabel} from '../ui/events';
import {yearOf} from '../model/bounds';
import {displayName, formatDate, formatPlace} from '../ui/format';
import {Icon} from '../ui/icons';
import type {CanvasFlow, CanvasMarker} from './MapCanvas';
import './map.css';

const MapCanvas = lazy(() => import('./MapCanvas'));
const VIEWS: MapView[] = ['places', 'path', 'spread'];
/** «1—4, 6»: step numbers with runs collapsed (Milchin: no spaces). */
function numberRanges(ns: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < ns.length; i++) {
    let j = i;
    while (j + 1 < ns.length && ns[j + 1] === ns[j]! + 1) j++;
    out.push(j > i ? `${ns[i]}—${ns[j]}` : `${ns[i]}`);
    i = j;
  }
  return out.join(', ');
}

/** PLAC without the empty jurisdictions («Town, , Region»). */
const placeText = (raw: string) => formatPlace({raw, parts: []});

/** «Карта»: places with coordinates from the file, a person's path and how
 *  a family spread. Nothing is looked up: no coordinates, no marker. */
export function MapSection() {
  const {tree, settings, mapView, selectedId, rootId, lang} = useAppState();
  const dispatch = useDispatch();
  const intl = useIntl();
  const t = (id: string, v?: Record<string, unknown>) =>
    intl.formatMessage({id}, v as Record<string, string>);
  const [off, setOff] = useState<Set<EventKind>>(new Set());
  const [listMissing, setListMissing] = useState(false);
  const [picked, setPicked] = useState<string>();
  const [fit, setFit] = useState(0);
  const [zoomBy, setZoomBy] = useState(0);
  const index = useMemo(
    () => (tree ? placeIndex(tree, settings) : undefined),
    [tree, settings],
  );
  const path = useMemo(() => {
    const indi = selectedId ? tree?.indis.get(selectedId) : undefined;
    return tree && indi ? personPath(tree, indi) : undefined;
  }, [tree, selectedId]);
  const spreadData = useMemo(
    () => (tree && rootId ? spread(tree, settings, rootId) : undefined),
    [tree, settings, rootId],
  );
  if (!tree || !index) return null;
  const o = {locale: lang, style: settings.dateStyle};
  const total = index.mapped.length + index.unmapped.length;

  if (index.mapped.length === 0) {
    return (
      <div className="map map--none">
        <section className="map-none" aria-labelledby="map-none-h">
          <h2 id="map-none-h">{t('map.none.title')}</h2>
          <p>{t('map.none.text')}</p>
          <h3>{t('map.none.places', {n: total})}</h3>
          <ul className="map-list">
            {index.unmapped.slice(0, 12).map((p) => (
              <li key={p.raw} className="map-list__row map-list__row--static">
                <span>{placeText(p.raw)}</span>
                <span className="muted">{p.count}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  // ------------------------------------------------------------ data
  const at = (p: MapPlace) => `${p.lat},${p.lon}`;
  const shown = (p: MapPlace) =>
    p.events.filter((e) => !off.has(e.kind)).length;
  let markers: CanvasMarker[] = [];
  let flows: CanvasFlow[] = [];
  let groupLabel = '';
  if (mapView === 'places') {
    groupLabel = t('map.places.group');
    // Places written differently but with the same coordinates are one point.
    const points = new Map<string, MapPlace[]>();
    for (const p of index.mapped) {
      if (shown(p) === 0) continue;
      points.set(at(p), [...(points.get(at(p)) ?? []), p]);
    }
    markers = [...points].map(([key, ps]) => {
      const n = ps.reduce((sum, p) => sum + shown(p), 0);
      const names = ps.map((p) => placeText(p.raw)).join('; ');
      return {
        key,
        lat: ps[0]!.lat,
        lon: ps[0]!.lon,
        r: Math.max(5, Math.sqrt(n) * 2.4),
        label: ps[0]!.name,
        aria: t('map.places.marker', {name: names, n}),
        look: 'place' as const,
        selected: picked === key,
      };
    });
  } else if (mapView === 'path' && path) {
    groupLabel = t('map.path.group');
    // Steps at the same point share a marker: «1—4» inside, the years beside.
    const groups = new Map<string, number[]>();
    path.steps.forEach((s, i) => {
      if (s.lat === undefined) return;
      const key = `${s.lat},${s.lon}`;
      groups.set(key, [...(groups.get(key) ?? []), i]);
    });
    const radius = new Map<string, number>();
    markers = [...groups].map(([key, idx]) => {
      const first = path.steps[idx[0]!]!;
      const inside = numberRanges(idx.map((i) => i + 1));
      const r = Math.max(11, inside.length * 3.6 + 5);
      radius.set(key, r);
      const years = [
        ...new Set(idx.flatMap((i) => yearOf(path.steps[i]!.date) ?? [])),
      ];
      const span =
        years.length > 1
          ? `${years[0]}—${years[years.length - 1]}`
          : `${years[0] ?? ''}`;
      return {
        key,
        lat: first.lat!,
        lon: first.lon!,
        r,
        label: span ? `${first.name}, ${span}` : first.name,
        // The name starts with what the marker shows (WCAG 2.5.3).
        aria:
          (idx.length > 1 ? `${inside}: ` : '') +
          idx
            .map((i) => {
              const st = path.steps[i]!;
              return `${i + 1}. ${eventLabel(intl, st)} ${formatDate(st.date, o)}, ${placeText(st.place)}`;
            })
            .join('; '),
        inside,
        look: 'step' as const,
      };
    });
    const rOf = (st: (typeof path.steps)[number]) =>
      radius.get(`${st.lat},${st.lon}`) ?? 11;
    // A step without coordinates between two with them: a dashed segment.
    let missing = false;
    let prev: (typeof path.steps)[number] | undefined;
    path.steps.forEach((s) => {
      if (s.lat === undefined) {
        missing = true;
        return;
      }
      if (prev && (prev.lat !== s.lat || prev.lon !== s.lon)) {
        flows.push({
          key: `${prev.place}→${s.place}:${flows.length}`,
          from: [prev.lon!, prev.lat!],
          to: [s.lon!, s.lat!],
          width: 2,
          dashed: missing,
          r0: rOf(prev),
          r1: rOf(s),
        });
      }
      missing = false;
      prev = s;
    });
  } else if (mapView === 'spread' && spreadData) {
    groupLabel = t('map.spread.group');
    const nodes = new Map(spreadData.nodes.map((n) => [n.raw, n]));
    const radius = (born: number) => Math.max(5, Math.sqrt(born) * 3.4);
    markers = spreadData.nodes.map((n) => ({
      key: n.raw,
      lat: n.lat,
      lon: n.lon,
      r: radius(n.born),
      label: n.name,
      look: 'ring' as const,
    }));
    flows = spreadData.flows.flatMap((f) => {
      const a = nodes.get(f.from);
      const b = nodes.get(f.to);
      if (!a || !b) return [];
      return [
        {
          key: `${f.from}→${f.to}`,
          from: [a.lon, a.lat] as [number, number],
          to: [b.lon, b.lat] as [number, number],
          width: 1.5 + Math.sqrt(f.count) * 1.6,
          r0: radius(a.born),
          r1: radius(b.born),
        },
      ];
    });
  }
  const root = rootId ? tree.indis.get(rootId) : undefined;
  const person = selectedId ? tree.indis.get(selectedId) : undefined;

  return (
    <Tabs
      className="map"
      selectedKey={mapView}
      onSelectionChange={(k) =>
        dispatch({type: 'setMapView', view: k as MapView})
      }
    >
      <div className="map__bar">
        <TabList className="tabs" aria-label={t('map.views')}>
          {VIEWS.map((v) => (
            <Tab key={v} id={v} className="tabs__tab">
              {t(`map.view.${v}`)}
            </Tab>
          ))}
        </TabList>
        <span className="muted">
          {t('map.coverage', {
            shown: index.mapped.length,
            total,
            missing: index.unmapped.length,
          })}
        </span>
      </div>

      <TabPanel key={mapView} id={mapView} className="map__body">
        <div className="map__stage">
          {mapView === 'places' && (
            <div
              className="map__filters"
              role="group"
              aria-label={t('map.filters')}
            >
              {EVENT_KINDS.map((k) => (
                <Button
                  key={k}
                  className="map-chip"
                  aria-pressed={!off.has(k)}
                  onPress={() => {
                    const next = new Set(off);
                    if (next.has(k)) next.delete(k);
                    else next.add(k);
                    setOff(next);
                  }}
                >
                  {!off.has(k) && (
                    <Icon name="check" size={14} strokeWidth={2.6} />
                  )}
                  {t(`map.kind.${k}`)}
                </Button>
              ))}
            </div>
          )}
          <Suspense
            fallback={<p className="map__loading">{t('map.loading')}</p>}
          >
            <MapCanvas
              markers={markers}
              flows={flows}
              groupLabel={groupLabel}
              fitRequest={fit}
              zoomBy={zoomBy}
              onPick={
                mapView === 'places' ? (key) => setPicked(key) : undefined
              }
            />
          </Suspense>
          <div className="map__zoom" role="group" aria-label={t('zoom.label')}>
            <Button
              className="zoom__btn zoom__btn--sign"
              aria-label={t('zoom.out')}
              onPress={() => setZoomBy((z) => -(Math.abs(z) + 1))}
            >
              −
            </Button>
            <Button
              className="zoom__btn"
              aria-label={t('map.fit')}
              onPress={() => setFit((f) => f + 1)}
            >
              <Icon name="fit" size={18} strokeWidth={2} />
            </Button>
            <Button
              className="zoom__btn zoom__btn--sign"
              aria-label={t('zoom.in')}
              onPress={() => setZoomBy((z) => Math.abs(z) + 1)}
            >
              +
            </Button>
          </div>
          <p className="map__credit">{t('map.credit')}</p>
        </div>

        <aside className="map__side" aria-labelledby="map-side-h">
          {mapView === 'places' && (
            <>
              <h2 id="map-side-h">{t('map.view.places')}</h2>
              <RadioGroup
                className="map-seg"
                aria-label={t('map.listWhich')}
                orientation="horizontal"
                value={listMissing ? 'missing' : 'all'}
                onChange={(v) => setListMissing(v === 'missing')}
              >
                <Radio value="all" className="map-seg__item">
                  {t('map.list.all', {n: total})}
                </Radio>
                <Radio value="missing" className="map-seg__item">
                  {t('map.list.missing', {n: index.unmapped.length})}
                </Radio>
              </RadioGroup>
              <ul className="map-list">
                {listMissing
                  ? index.unmapped.map((p) => (
                      <li
                        key={p.raw}
                        className="map-list__row map-list__row--static"
                      >
                        <span>
                          {placeText(p.raw)}
                          <span className="map-list__note">
                            {t('map.noCoords')}
                          </span>
                        </span>
                        <span className="muted">{p.count}</span>
                      </li>
                    ))
                  : index.mapped.map((p) => (
                      <li key={p.raw}>
                        <Button
                          className="map-list__row"
                          aria-current={picked === at(p) ? 'true' : undefined}
                          onPress={() => setPicked(at(p))}
                        >
                          <span>{placeText(p.raw)}</span>
                          <span className="muted">{p.events.length}</span>
                        </Button>
                      </li>
                    ))}
              </ul>
              {index.unmapped.length > 0 && !listMissing && (
                <p className="muted">{t('map.howToAdd')}</p>
              )}
            </>
          )}
          {mapView === 'path' && path && person && (
            <>
              <p className="muted">{t('map.view.path')}</p>
              <h2 id="map-side-h">{displayName(person)}</h2>
              <p className="muted">{t('map.path.hint')}</p>
              {path.steps.length === 0 ? (
                <p>{t('map.path.empty')}</p>
              ) : (
                <ol className="map-steps">
                  {path.steps.map((s, i) => (
                    <li key={i} data-missing={s.lat === undefined || undefined}>
                      <span className="map-steps__place">
                        {placeText(s.place)}
                      </span>
                      <span className="muted">
                        {eventLabel(intl, s)} {formatDate(s.date, o)}
                      </span>
                      {s.lat === undefined && (
                        <span className="map-list__note">
                          {t('map.noCoords')}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {path.undated.length > 0 && (
                <>
                  <h3>{t('map.path.undated')}</h3>
                  <ul className="map-steps">
                    {path.undated.map((s, i) => (
                      <li key={i}>
                        {eventLabel(intl, s)} — {placeText(s.place)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
          {mapView === 'spread' && spreadData && root && (
            <>
              <p className="muted">{t('map.view.spread')}</p>
              <h2 id="map-side-h">
                {t('map.spread.title', {name: displayName(root)})}
              </h2>
              <p className="muted">
                {t('map.spread.hint', {n: spreadData.people})}
              </p>
              <table className="map-table">
                <thead>
                  <tr>
                    <th scope="col">{t('map.spread.place')}</th>
                    <th scope="col">{t('map.spread.from')}</th>
                    <th scope="col">{t('map.spread.born')}</th>
                  </tr>
                </thead>
                <tbody>
                  {spreadData.nodes.map((n) => {
                    const from = spreadData.flows.find((f) => f.to === n.raw);
                    return (
                      <tr key={n.raw}>
                        <th scope="row">{n.name}</th>
                        <td>
                          {from
                            ? spreadData.nodes.find((x) => x.raw === from.from)
                                ?.name
                            : '—'}
                        </td>
                        <td>{n.born}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </aside>
      </TabPanel>
    </Tabs>
  );
}
