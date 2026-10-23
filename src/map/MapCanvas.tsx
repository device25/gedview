// The drawing of «Карта»: Natural Earth land and borders (loaded on demand),
// projected to fit the places shown; markers, paths and flows on top. The
// base map scales with zoom, markers keep their size.

import {geoMercator, geoPath, type GeoProjection} from 'd3-geo';
import {select} from 'd3-selection';
import {zoom, zoomIdentity, type ZoomTransform} from 'd3-zoom';
import {useEffect, useMemo, useRef, useState, type KeyboardEvent} from 'react';
import {feature, mesh} from 'topojson-client';
import type {Topology} from 'topojson-specification';

export interface CanvasMarker {
  key: string;
  lat: number;
  lon: number;
  /** Radius in pixels. */
  r: number;
  label: string;
  /** Accessible name; no name = decorative (spread nodes). */
  aria?: string;
  /** Text inside (path step numbers). */
  inside?: string;
  look: 'place' | 'step' | 'ring';
  selected?: boolean;
}

export interface CanvasFlow {
  key: string;
  from: [number, number];
  to: [number, number];
  width: number;
  dashed?: boolean;
  label?: string;
  /** Radii of the end markers, to stop short of them. */
  r0: number;
  r1: number;
}

interface Props {
  markers: CanvasMarker[];
  flows: CanvasFlow[];
  onPick?: (key: string) => void;
  groupLabel?: string;
  /** Incremented to fit all markers again. */
  fitRequest: number;
  zoomBy: number;
}

type Geo = {
  land: GeoJSON.FeatureCollection | GeoJSON.Feature;
  borders: GeoJSON.MultiLineString;
};

let atlas: Promise<Geo> | undefined;
/** Natural Earth 1:50m countries, bundled (no request leaves the site). */
function loadAtlas(): Promise<Geo> {
  atlas ??= import('world-atlas/countries-50m.json').then((m) => {
    const topo = (m.default ?? m) as unknown as Topology;
    const {land, countries} = topo.objects;
    return {
      land: feature(topo, land!) as unknown as GeoJSON.Feature,
      borders: mesh(
        topo,
        countries as never,
        (a, b) => a !== b,
      ) as GeoJSON.MultiLineString,
    };
  });
  return atlas;
}

function fitProjection(
  points: Array<[number, number]>,
  w: number,
  h: number,
): GeoProjection {
  const pad = 56;
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  // At least ten degrees across (five up and down), so a few villages
  // close together still show the country around them.
  const widen = (lo: number, hi: number, min: number): [number, number] => {
    const grow = Math.max(0, min - (hi - lo)) / 2 + 0.3;
    return [lo - grow, hi + grow];
  };
  const [x0, x1] = widen(Math.min(...lons), Math.max(...lons), 10);
  const [y0, y1] = widen(Math.min(...lats), Math.max(...lats), 5);
  return geoMercator().fitExtent(
    [
      [pad, pad],
      [Math.max(pad + 1, w - pad), Math.max(pad + 1, h - pad)],
    ],
    {
      type: 'MultiPoint',
      coordinates: [
        [x0, y0],
        [x1, y1],
      ],
    },
  );
}

/** A curve from a to b bent to one side, trimmed at both ends. */
function curve(
  a: [number, number],
  b: [number, number],
  r0: number,
  r1: number,
  bend: number,
): string {
  const [ax, ay] = a;
  const [bx, by] = b;
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const cx = (ax + bx) / 2 - ((by - ay) / len) * bend;
  const cy = (ay + by) / 2 + ((bx - ax) / len) * bend;
  const trim = (px: number, py: number, d: number) => {
    const l = Math.hypot(cx - px, cy - py) || 1;
    return [px + ((cx - px) / l) * d, py + ((cy - py) / l) * d];
  };
  const [sx, sy] = trim(ax, ay, r0 + 1);
  const [ex, ey] = trim(bx, by, r1 + 2);
  const f = (v: number) => Math.round(v * 10) / 10;
  return `M${f(sx!)} ${f(sy!)}Q${f(cx)} ${f(cy)} ${f(ex!)} ${f(ey!)}`;
}

export default function MapCanvas({
  markers,
  flows,
  onPick,
  groupLabel,
  fitRequest,
  zoomBy,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({w: 800, h: 600});
  const [geo, setGeo] = useState<Geo>();
  const [t, setT] = useState<ZoomTransform>(zoomIdentity);
  const zoomRef =
    useRef<ReturnType<typeof zoom<SVGSVGElement, unknown>>>(undefined);
  const [focusKey, setFocusKey] = useState<string>();

  useEffect(() => {
    let alive = true;
    void loadAtlas().then((g) => alive && setGeo(g));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = svgRef.current!;
    const ro = new ResizeObserver(([e]) => {
      const r = e!.contentRect;
      setSize({w: Math.max(1, r.width), h: Math.max(1, r.height)});
    });
    ro.observe(el);
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 40])
      .on('zoom', (ev) => setT(ev.transform));
    zoomRef.current = z;
    select(el).call(z);
    return () => {
      ro.disconnect();
      select(el).on('.zoom', null);
    };
  }, []);

  const points = useMemo<Array<[number, number]>>(
    () => markers.map((m) => [m.lon, m.lat]),
    [markers],
  );
  const projection = useMemo(
    () =>
      fitProjection(points.length ? points : [[37.6, 55.75]], size.w, size.h),
    [points, size.w, size.h],
  );

  // A fit request (or new markers) returns to the fitted view.
  useEffect(() => {
    if (svgRef.current && zoomRef.current) {
      select(svgRef.current).call(zoomRef.current.transform, zoomIdentity);
    }
  }, [fitRequest, points]);
  useEffect(() => {
    if (svgRef.current && zoomRef.current && zoomBy !== 0) {
      select(svgRef.current)
        .transition()
        .duration(200)
        .call(zoomRef.current.scaleBy, zoomBy > 0 ? 1.5 : 1 / 1.5);
    }
  }, [zoomBy]);

  const path = geoPath(projection);
  const at = (lon: number, lat: number): [number, number] => {
    const p = projection([lon, lat]) ?? [0, 0];
    return t.apply(p as [number, number]);
  };

  // Labels: the biggest places first, each kept only where it does not
  // overlap one already placed (or a marker).
  const placed: Array<[number, number, number, number]> = [];
  const labels = [...markers]
    .sort((a, b) => b.r - a.r)
    .flatMap((m) => {
      const [x, y] = at(m.lon, m.lat);
      const w = m.label.length * 7.2;
      const box: [number, number, number, number] = [x + m.r + 6, y - 9, w, 18];
      const hit = placed.some(
        ([bx, by, bw, bh]) =>
          box[0] < bx + bw &&
          box[0] + box[2] > bx &&
          box[1] < by + bh &&
          box[1] + box[3] > by,
      );
      if (hit || !m.label) return [];
      placed.push(box);
      return [{key: m.key, x: box[0], y: y + 4, text: m.label}];
    });

  const keys = markers.filter((m) => m.aria).map((m) => m.key);
  const onKey = (e: KeyboardEvent, key: string) => {
    const i = keys.indexOf(key);
    let next: string | undefined;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = keys[i + 1];
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = keys[i - 1];
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPick?.(key);
      return;
    }
    if (next) {
      e.preventDefault();
      setFocusKey(next);
      requestAnimationFrame(() =>
        svgRef.current
          ?.querySelector<SVGGElement>(`[data-key="${CSS.escape(next!)}"]`)
          ?.focus(),
      );
    }
  };
  const stop = focusKey ?? keys[0];

  return (
    <svg
      ref={svgRef}
      className="gv-map-svg"
      role="group"
      aria-label={groupLabel}
    >
      <defs>
        <marker
          id="gv-arrow"
          viewBox="0 0 10 10"
          refX="0"
          refY="5"
          markerUnits="strokeWidth"
          markerWidth="4"
          markerHeight="4"
          orient="auto"
        >
          <path d="M0 0L10 5L0 10z" className="gv-map-arrow" />
        </marker>
      </defs>
      <rect
        className="gv-map-water"
        width={size.w}
        height={size.h}
        aria-hidden="true"
      />
      <g transform={t.toString()} aria-hidden="true">
        {geo && (
          <>
            <path
              className="gv-map-land"
              d={path(geo.land as GeoJSON.Feature) ?? ''}
            />
            <path
              className="gv-map-border"
              d={path(geo.borders) ?? ''}
              strokeWidth={1 / t.k}
            />
          </>
        )}
      </g>
      <g aria-hidden="true">
        {flows.map((f, i) => (
          <path
            key={f.key}
            className="gv-map-flow"
            d={curve(
              at(...f.from),
              at(...f.to),
              f.r0,
              f.r1 + f.width * 4,
              i % 2 ? -24 : 24,
            )}
            strokeWidth={f.width}
            strokeDasharray={f.dashed ? '3 5' : undefined}
            markerEnd="url(#gv-arrow)"
          />
        ))}
      </g>
      {markers.map((m) => {
        const [x, y] = at(m.lon, m.lat);
        const common = {
          className: `gv-map-marker gv-map-marker--${m.look}${m.selected ? ' gv-map-marker--selected' : ''}`,
          transform: `translate(${x} ${y})`,
        };
        const body = (
          <>
            <circle r={m.r} />
            {m.inside && (
              <text y={4} textAnchor="middle">
                {m.inside}
              </text>
            )}
          </>
        );
        return m.aria ? (
          <g
            key={m.key}
            {...common}
            data-key={m.key}
            role="button"
            tabIndex={m.key === stop ? 0 : -1}
            aria-label={m.aria}
            aria-current={m.selected ? 'true' : undefined}
            onClick={() => onPick?.(m.key)}
            onKeyDown={(e) => onKey(e, m.key)}
          >
            {body}
          </g>
        ) : (
          <g key={m.key} {...common} aria-hidden="true">
            {body}
          </g>
        );
      })}
      <g aria-hidden="true" className="gv-map-labels">
        {labels.map((l) => (
          <text key={l.key} x={l.x} y={l.y}>
            {l.text}
          </text>
        ))}
      </g>
    </svg>
  );
}
