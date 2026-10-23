// PLACEHOLDER for part C: lists persons as focusable buttons in a grid.
// Part C replaces the internals with the topola chart; the props stay.
import {useIntl} from 'react-intl';
import type {ChartProps} from '../gedcom/types';
import {displayName, lifeSpan} from '../ui/format';
import './chart.css';

const LIMIT = 300;

export function ChartView({tree, selectedId, onSelect, settings}: ChartProps) {
  const intl = useIntl();
  const people = [...tree.indis.values()];
  const shown = people.slice(0, LIMIT);

  return (
    <div className="chart-placeholder">
      <ul
        className="chart-grid"
        aria-label={intl.formatMessage({id: 'chart.people'})}
      >
        {shown.map((indi) => {
          const challenged = indi.famc.some(
            (l) =>
              tree.childLinkStatus.get(`${l.famId}|${indi.id}`)?.status ===
              'CHALLENGED',
          );
          const name = displayName(indi);
          const life = lifeSpan(indi, {
            locale: intl.locale,
            style: settings.dateStyle,
          });
          const dashed = challenged && settings.dashChallenged;
          return (
            <li key={indi.id}>
              <button
                type="button"
                className="person-box"
                data-dashed={dashed || undefined}
                aria-current={indi.id === selectedId ? 'true' : undefined}
                onClick={() => onSelect(indi.id)}
              >
                <span className="person-box__name">
                  <span
                    className="person-box__dot"
                    data-sex={settings.sexColors ? indi.sex : undefined}
                    aria-hidden="true"
                  />
                  {name}
                </span>
                <span className="person-box__life">{life}</span>
                {settings.showIds && (
                  <span className="person-box__id">{indi.id}</span>
                )}
                {challenged && (
                  <span className="person-box__badge">
                    {intl.formatMessage({id: 'chart.disputedShort'})}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {people.length > LIMIT && (
        <p className="chart-placeholder__more">
          {intl.formatMessage(
            {id: 'chart.more'},
            {count: people.length - LIMIT},
          )}
        </p>
      )}
    </div>
  );
}
