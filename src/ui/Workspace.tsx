import {Button} from 'react-aria-components';
import {useIntl} from 'react-intl';
import {ChartView} from '../chart/ChartView';
import {useAppState, useDispatch, useIsMobile} from '../store';
import {chartScope} from '../store/reducer';
import {FileActions} from './FileActions';
import {Icon} from './icons';
import {PersonCard} from './PersonCard';
import {ScopeBar, ScopeSheet} from './ScopeControls';
import {Summary} from './Summary';
import {treeTitle} from './treeInfo';
import './workspace.css';

/** Header, chart, legend, zoom and the person card of a loaded tree. */
export function Workspace() {
  const state = useAppState();
  const {tree, selectedId, settings, zoom, fitRequest, cardOpen} = state;
  const dispatch = useDispatch();
  const intl = useIntl();
  const isMobile = useIsMobile();
  const scope = chartScope(state);
  if (!tree || !selectedId || !scope) return null;
  const summary = state.mode === 'summary';
  const t = (id: string) => intl.formatMessage({id});

  const count = tree.indis.size;
  const version = tree.parse.version.raw;
  const meta = intl.formatMessage(
    {id: version ? 'header.meta' : 'header.metaNoVersion'},
    {file: tree.source.name, version, count},
  );

  return (
    <div className="workspace">
      <header className="header">
        <div className="header__main">
          <h1 className="header__title">{treeTitle(tree)}</h1>
          {isMobile && !summary && <ScopeSheet />}
        </div>
        {isMobile ? (
          <Button
            className="icon-btn icon-btn--large"
            aria-label={t('people.openSearch')}
            onPress={() => dispatch({type: 'openFlyout', id: 'people'})}
          >
            <Icon name="search" size={20} strokeWidth={2} />
          </Button>
        ) : (
          <>
            <span className="header__meta">{meta}</span>
            <FileActions />
          </>
        )}
        {!isMobile && !summary && <ScopeBar />}
      </header>

      {summary ? (
        <Summary />
      ) : (
        <>
          <div className={cardOpen ? 'chart chart--card' : 'chart'}>
            <ChartView
              tree={tree}
              scope={scope}
              selectedId={selectedId}
              settings={settings}
              onSelect={(id) => dispatch({type: 'select', id})}
              zoom={zoom}
              onZoomChange={(z) => dispatch({type: 'setZoom', zoom: z})}
              fitRequest={fitRequest}
            />
            {/* The card floats over the chart, under the header. */}
            <PersonCard />
          </div>

          <div className="legend">
            <span className="legend__item">
              <svg width="28" height="8" aria-hidden="true">
                <path d="M0 4H28" stroke="var(--line)" strokeWidth="1.5" />
              </svg>
              {t('legend.solid')}
            </span>
            <span className="legend__item">
              <svg width="28" height="8" aria-hidden="true">
                <path
                  d="M0 4H28"
                  stroke="var(--warn-line)"
                  strokeWidth="2"
                  strokeDasharray="6 4"
                />
              </svg>
              {t('legend.dashed')}
            </span>
            <span>{t('legend.marriage')}</span>
            <span className="legend__item">
              <svg width="28" height="8" aria-hidden="true">
                <path
                  d="M2 4H26"
                  stroke="var(--control)"
                  strokeWidth="2"
                  strokeDasharray="2 5"
                  strokeLinecap="round"
                />
              </svg>
              {t('legend.copies')}
            </span>
            <span>{t('legend.julian')}</span>
            <span className="legend__keys">{t('legend.keys')}</span>
          </div>

          <div
            className={cardOpen ? 'zoom zoom--card' : 'zoom'}
            role="group"
            aria-label={t('zoom.label')}
          >
            <Button
              className="zoom__btn zoom__btn--sign"
              aria-label={t('zoom.out')}
              onPress={() => dispatch({type: 'zoom', mode: 'out'})}
            >
              −
            </Button>
            <Button
              className="zoom__btn"
              aria-label={intl.formatMessage(
                {id: 'zoom.fitLabel'},
                {percent: `${Math.round(zoom * 100)}%`},
              )}
              onPress={() => dispatch({type: 'zoom', mode: 'fit'})}
            >
              {`${Math.round(zoom * 100)}%`}
            </Button>
            <Button
              className="zoom__btn zoom__btn--sign"
              aria-label={t('zoom.in')}
              onPress={() => dispatch({type: 'zoom', mode: 'in'})}
            >
              +
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
