// The relationship chart: topola draws hourglass, relatives and fan charts,
// d3-zoom pans and zooms them. The imperative part lives in ChartEngine.
import {useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import type {ChartProps} from '../gedcom/types';
import {displayName} from '../ui/format';
import {ChartEngine, type Tip} from './engine';
import './chart.css';

export function ChartView({
  tree,
  view,
  selectedId,
  onSelect,
  settings,
  zoom,
  onZoomChange,
  fitRequest,
}: ChartProps) {
  const intl = useIntl();
  const svgRef = useRef<SVGSVGElement>(null);
  const engineRef = useRef<ChartEngine | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  // The engine outlives renders; it calls the latest handlers and reads the
  // latest zoom and messages through this ref. (The intl object is new on
  // every render of the provider, so it must not trigger a redraw itself.)
  const latest = useRef({onSelect, onZoomChange, zoom, intl});
  useEffect(() => {
    latest.current = {onSelect, onZoomChange, zoom, intl};
  });

  useEffect(() => {
    const engine = new ChartEngine(svgRef.current!, {
      onSelect: (id) => latest.current.onSelect(id),
      onZoom: (z) => latest.current.onZoomChange(z),
      onTip: setTip,
    });
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.update({
      tree,
      view,
      settings,
      intl: latest.current.intl,
      selectedId,
      zoom: latest.current.zoom,
    });
  }, [tree, view, settings, intl.locale, selectedId]);

  // A fit request wins over the zoom value that comes with it.
  const seenFit = useRef(fitRequest);
  useEffect(() => {
    if (seenFit.current !== fitRequest) {
      seenFit.current = fitRequest;
      engineRef.current?.fit();
    } else {
      engineRef.current?.setZoom(zoom);
    }
  }, [zoom, fitRequest]);

  const name = displayName(tree.indis.get(selectedId), selectedId);
  return (
    <div className="gv-chart">
      <svg
        ref={svgRef}
        className="gv-svg"
        role="group"
        aria-label={intl.formatMessage(
          {id: 'chart.graph'},
          {view: intl.formatMessage({id: `view.${view}`})},
        )}
      />
      {tip && (
        <div className="gv-tip" style={{left: tip.x, top: tip.y}} aria-hidden>
          {tip.text}
        </div>
      )}
      <div role="status" aria-live="polite" className="sr-only">
        {intl.formatMessage({id: 'chart.selected'}, {name})}
      </div>
    </div>
  );
}
