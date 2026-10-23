import {useMemo} from 'react';
import {Button} from 'react-aria-components';
import {useIntl} from 'react-intl';
import {
  CHECK_GROUPS,
  placesWithoutCoordinates,
  runChecks,
  todayJdn,
  type CheckGroup,
  type CheckId,
} from '../model/checks';
import {ancestorGrid, summaryFigures} from '../model/summary';
import {useAppState, useDispatch} from '../store';
import {displayName} from './format';
import {Icon} from './icons';
import {RootPicker} from './ScopeControls';
import './summary.css';

/** «XIX» in Russian, «19th» in English. */
function centuryName(n: number, locale: string): string {
  if (locale.startsWith('ru')) {
    const roman: Array<[number, string]> = [
      [10, 'X'],
      [9, 'IX'],
      [5, 'V'],
      [4, 'IV'],
      [1, 'I'],
    ];
    let out = '';
    let rest = n;
    for (const [v, r] of roman)
      while (rest >= v) {
        out += r;
        rest -= v;
      }
    return out;
  }
  const suffix =
    {one: 'st', two: 'nd', few: 'rd', other: 'th'}[
      new Intl.PluralRules('en', {type: 'ordinal'}).select(n) as 'one'
    ] ?? 'th';
  return `${n}${suffix}`;
}

const GROUP_ORDER: CheckGroup[] = ['contradiction', 'review', 'gap'];
const GROUP_ICON: Record<CheckGroup, string> = {
  contradiction:
    'M12 8v5M12 16.5v.5M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  review: 'M12 8v5M12 16.5v.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  gap: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12h8',
};

/** «Сводка»: the known ancestors, what needs attention, sources, births
 *  and surnames. */
export function Summary() {
  const {tree, settings, rootId} = useAppState();
  const dispatch = useDispatch();
  const intl = useIntl();
  const t = (id: string, v?: Record<string, unknown>) =>
    intl.formatMessage({id}, v as Record<string, string>);
  const figures = useMemo(
    () => (tree ? summaryFigures(tree) : undefined),
    [tree],
  );
  const checks = useMemo(
    () => (tree ? runChecks(tree, todayJdn()) : undefined),
    [tree],
  );
  const noCoords = useMemo(
    () => (tree ? placesWithoutCoordinates(tree).length : 0),
    [tree],
  );
  const grid = useMemo(
    () => (tree && rootId ? ancestorGrid(tree, settings, rootId) : undefined),
    [tree, settings, rootId],
  );
  if (!tree || !figures || !checks || !grid || !rootId) return null;
  const name = (id?: string) => (id ? displayName(tree.indis.get(id), id) : '');
  const root = tree.indis.get(rootId);

  const counts: Array<{
    id: CheckId | 'noCoordinates';
    group: CheckGroup;
    n: number;
  }> = [
    ...(Object.keys(CHECK_GROUPS) as CheckId[]).map((id) => ({
      id,
      group: CHECK_GROUPS[id],
      n: checks[id].length,
    })),
    {id: 'noCoordinates' as const, group: 'gap' as const, n: noCoords},
  ];
  const quayLabels = [3, 2, 1, 0, -1];
  const quayTotal = figures.quality.reduce((a, b) => a + b, 0);
  const maxDecade = Math.max(1, ...figures.decades.map((d) => d.count));
  const peaks = [...figures.decades]
    .sort((a, b) => b.count - a.count)
    .slice(0, 2);
  const maxSurname = Math.max(1, ...figures.surnames.map((s) => s.count));
  const share = figures.people
    ? Math.round((figures.sourced / figures.people) * 100)
    : 0;

  return (
    <div className="summary">
      <p className="summary__line">
        {t('summary.line', {
          people: figures.people,
          families: figures.families,
          from: figures.births?.[0] ?? '',
          to: figures.births?.[1] ?? '',
          share,
        })}
      </p>
      <div className="summary__top">
        <section
          className="summary-card summary-card--wide"
          aria-labelledby="sum-anc"
        >
          <div className="summary-card__head">
            <div>
              <h2 id="sum-anc">{t('summary.ancestors')}</h2>
              <p className="muted">{t('summary.ancestorsHint')}</p>
            </div>
            <div className="summary__root">
              <RootPicker />
              <p className="muted">{t('summary.sameRoot')}</p>
            </div>
          </div>
          <div
            className="ancestors"
            aria-label={t('summary.ancestorsOf', {name: name(rootId)})}
            role="group"
          >
            {[...grid.generations].reverse().map((gen, i) => {
              const g = grid.generations.length - i;
              const known = gen.filter((s) => s.id).length;
              const disputed = gen.filter((s) => s.disputed).length;
              return (
                <div className="ancestors__row" key={g}>
                  <span className="ancestors__label">
                    {t(`summary.gen${g}`)}
                  </span>
                  <div
                    className="ancestors__cells"
                    style={{
                      gridTemplateColumns: `repeat(${gen.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {gen.map((slot) =>
                      slot.id ? (
                        <Button
                          key={slot.index}
                          className="ancestors__cell"
                          data-disputed={slot.disputed || undefined}
                          aria-label={
                            name(slot.id) +
                            (slot.disputed
                              ? `; ${t('summary.disputedLink')}`
                              : '')
                          }
                          onPress={() =>
                            dispatch({type: 'select', id: slot.id!})
                          }
                        >
                          {g <= 2
                            ? name(slot.id)
                                .split(' ')
                                .slice(0, g === 1 ? 2 : 1)
                                .join(' ')
                            : ''}
                        </Button>
                      ) : (
                        <span
                          key={slot.index}
                          className="ancestors__cell ancestors__cell--empty"
                          aria-hidden="true"
                        />
                      ),
                    )}
                  </div>
                  <span className="ancestors__count">
                    {t('summary.knownOf', {known, of: gen.length})}
                    {disputed > 0 && (
                      <span className="ancestors__disputed">
                        {t('summary.disputedCount', {n: disputed})}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
            <div className="ancestors__row">
              <span className="ancestors__label">{t('chart.root')}</span>
              <span className="ancestors__root">{name(rootId)}</span>
              <span />
            </div>
          </div>
          <table className="ancestors-far">
            <caption>{t('summary.further')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('summary.line.col')}</th>
                <th scope="col">{t('summary.gen5')}</th>
                <th scope="col">{t('summary.gen67')}</th>
              </tr>
            </thead>
            <tbody>
              {grid.lines.map((l, q) => (
                <tr key={q}>
                  <th scope="row">
                    {l.grandparent
                      ? t('summary.byLine', {name: name(l.grandparent)})
                      : t(`summary.lineUnknown${q}`)}
                  </th>
                  <td>
                    {t('summary.knownOf', {known: l.known[0], of: l.of[0]})}
                  </td>
                  <td>
                    {t('summary.knownOf', {
                      known: (l.known[1] ?? 0) + (l.known[2] ?? 0),
                      of: (l.of[1] ?? 0) + (l.of[2] ?? 0),
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!root?.famc.length && (
            <p className="muted">{t('summary.noParents')}</p>
          )}
        </section>

        <section className="summary-card" aria-labelledby="sum-todo">
          <h2 id="sum-todo">{t('summary.attention')}</h2>
          <p className="muted">{t('summary.attentionHint')}</p>
          {GROUP_ORDER.map((group) => {
            const items = counts.filter((c) => c.group === group && c.n > 0);
            if (group === 'contradiction' && items.length === 0) {
              return (
                <p key={group} className="todo__none">
                  {t('summary.noContradictions')}
                </p>
              );
            }
            if (!items.length) return null;
            return (
              <div key={group} className={`todo todo--${group}`}>
                <h3>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={GROUP_ICON[group]} />
                  </svg>
                  {t(`check.group.${group}`)}
                </h3>
                <ul>
                  {items.map((c) => (
                    <li key={c.id}>
                      <Button
                        className="todo__row"
                        isDisabled={c.id === 'noCoordinates'}
                        onPress={() => {
                          if (c.id !== 'noCoordinates')
                            dispatch({type: 'showCheck', check: c.id});
                        }}
                      >
                        <span>{t(`check.${c.id}`)}</span>
                        <span className="todo__badge">{c.n}</span>
                        {c.id !== 'noCoordinates' && (
                          <Icon name="chevronRight" size={14} strokeWidth={2} />
                        )}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      </div>

      <div className="summary__bottom">
        <section className="summary-card" aria-labelledby="sum-src">
          <h2 id="sum-src">{t('summary.sources')}</h2>
          {quayTotal === 0 && figures.sourced === 0 ? (
            <p className="muted">{t('summary.noSources')}</p>
          ) : (
            <>
              <p className="muted">{t('summary.sourcedByCentury')}</p>
              <ul className="bars">
                {figures.byCentury.map((c) => (
                  <li key={c.century}>
                    <span>
                      {t('summary.century', {
                        name: centuryName(c.century, intl.locale),
                      })}
                    </span>
                    <span className="bar" aria-hidden="true">
                      <span
                        style={{
                          width: `${Math.round((c.sourced / c.of) * 100)}%`,
                        }}
                      />
                    </span>
                    <span className="muted">
                      {t('summary.knownOf', {known: c.sourced, of: c.of})}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="muted">{t('summary.quality', {n: quayTotal})}</p>
              <div className="quay" aria-hidden="true">
                {figures.quality.map((n, i) =>
                  n > 0 ? (
                    <span
                      key={i}
                      className={`quay__part quay__part--${quayLabels[i]}`}
                      style={{flex: n}}
                    />
                  ) : null,
                )}
              </div>
              <ul className="quay-list">
                {figures.quality.map((n, i) => (
                  <li key={i}>
                    <span
                      className={`quay__dot quay__part--${quayLabels[i]}`}
                      aria-hidden="true"
                    />
                    <span>{t(`summary.quay${quayLabels[i]}`)}</span>
                    <span className="muted">{n}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="summary-card" aria-labelledby="sum-births">
          <h2 id="sum-births">{t('summary.births')}</h2>
          <p className="muted">
            {t('summary.birthsHint', {
              dated: figures.dated,
              people: figures.people,
            })}
          </p>
          <div
            className="decades"
            role="img"
            aria-label={t('summary.birthsAria', {
              dated: figures.dated,
              peaks: peaks.map((p) => `${p.decade} (${p.count})`).join(', '),
            })}
          >
            {figures.decades.map((d) => (
              <div key={d.decade} className="decades__col">
                <span
                  className="decades__bar"
                  style={{height: `${(d.count / maxDecade) * 100}%`}}
                />
                <span className="decades__label">
                  {d.decade % 50 === 0 ? d.decade : ''}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="summary-card" aria-labelledby="sum-names">
          <h2 id="sum-names">{t('summary.surnames')}</h2>
          <p className="muted">{t('summary.surnamesHint')}</p>
          <ul className="bars">
            {figures.surnames.map((s) => (
              <li key={s.name}>
                <span>{s.name}</span>
                <span className="bar" aria-hidden="true">
                  <span
                    style={{
                      width: `${Math.round((s.count / maxSurname) * 100)}%`,
                    }}
                  />
                </span>
                <span className="muted">{s.count}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
