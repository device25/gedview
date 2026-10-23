import {describe, expect, it} from 'vitest';
import {mockTree} from '../ui/mock/mockTree';
import {buildHash, DEFAULT_SCOPE, parseHash} from './hash';
import {scopeDrawn, scopePeople} from '../model/scope';
import {DEFAULT_SETTINGS, sanitizeSettings, loadPersisted} from './persist';
import {
  createInitialState,
  pickInitialId,
  chartScope,
  reducer,
  ZOOM_MAX,
  ZOOM_MIN,
  type AppState,
} from './reducer';

const initial = () => createInitialState({}, {}, 'en');
const loaded = (): AppState =>
  reducer(initial(), {type: 'loadDone', tree: mockTree});
const chartPeople = (s: AppState) =>
  scopePeople(s.tree!, s.settings, chartScope(s)!);

describe('initial state', () => {
  it('starts empty with defaults', () => {
    const s = initial();
    expect(s.tree).toBeUndefined();
    expect(s.scope).toEqual(DEFAULT_SCOPE);
    expect(s.theme).toBe('system');
    expect(s.settings).toEqual(DEFAULT_SETTINGS);
    expect(s.load).toEqual({phase: 'idle'});
  });

  it('takes the scope from the hash and settings from storage', () => {
    const s = createInitialState(
      {theme: 'dark', settings: {...DEFAULT_SETTINGS, showIds: true}},
      {level: 'cousins2', up: 1, down: 0},
      'ru',
    );
    // «Троюродные» need three generations up.
    expect(s.scope).toEqual({level: 'cousins2', up: 3, down: 0});
    expect(s.theme).toBe('dark');
    expect(s.settings.showIds).toBe(true);
    expect(s.lang).toBe('ru');
  });
});

describe('loading', () => {
  it('moves through loading to loaded and selects the first person', () => {
    const loading = reducer(initial(), {type: 'loadStart'});
    expect(loading.load.phase).toBe('loading');
    const s = reducer(loading, {type: 'loadDone', tree: mockTree});
    expect(s.load.phase).toBe('loaded');
    expect(s.selectedId).toBe('I1');
    expect(s.cardOpen).toBe(true);
  });

  it('prefers the person from the URL when it exists', () => {
    expect(pickInitialId(mockTree, 'I4')).toBe('I4');
    expect(pickInitialId(mockTree, 'nope')).toBe('I1');
  });

  it('keeps the open tree when a later load fails', () => {
    const s = reducer(loaded(), {type: 'loadFailed', code: 'NETWORK'});
    expect(s.tree).toBe(mockTree);
    expect(s.load).toEqual({phase: 'error', code: 'NETWORK'});
    expect(reducer(s, {type: 'dismissError'}).load.phase).toBe('loaded');
  });

  it('dismisses an error to idle when there is no tree', () => {
    const s = reducer(initial(), {type: 'loadFailed', code: 'NOT_GEDCOM'});
    expect(reducer(s, {type: 'dismissError'}).load.phase).toBe('idle');
  });
});

describe('selection and hash', () => {
  it('selects a known person and reopens the card', () => {
    const closed = reducer(loaded(), {type: 'setCardOpen', open: false});
    const s = reducer(closed, {type: 'select', id: 'I5'});
    expect(s.selectedId).toBe('I5');
    expect(s.cardOpen).toBe(true);
  });

  it('ignores an unknown person', () => {
    const s = loaded();
    expect(reducer(s, {type: 'select', id: 'X99'})).toBe(s);
  });

  it('applies the scope, root and id from a hash change', () => {
    const s = reducer(loaded(), {
      type: 'hashChanged',
      hash: {level: 'all', id: 'I6', root: 'I2'},
    });
    expect(s.scope.level).toBe('all');
    expect(s.selectedId).toBe('I6');
    expect(s.rootId).toBe('I2');
    const t = reducer(s, {type: 'hashChanged', hash: {id: 'X99'}});
    expect(t.selectedId).toBe('I6');
    expect(t.rootId).toBe('I2');
  });

  it('round-trips the hash and ignores junk', () => {
    const scope = {level: 'siblings', up: 3, down: 2, rootId: 'I1'} as const;
    expect(buildHash(scope, 'I12')).toBe(
      '#id=I12&root=I1&level=siblings&up=3&down=2',
    );
    expect(parseHash('#id=I12&root=I1&level=siblings&up=3&down=2')).toEqual({
      id: 'I12',
      root: 'I1',
      level: 'siblings',
      up: 3,
      down: 2,
    });
    // The root is left out when it is the selected person.
    expect(buildHash({...scope, rootId: 'I12'}, 'I12')).toBe(
      '#id=I12&level=siblings&up=3&down=2',
    );
    // Old links named a view.
    expect(parseHash('#view=relatives&id=I12')).toEqual({
      id: 'I12',
      level: 'all',
    });
    expect(parseHash('#view=hourglass')).toEqual({level: 'direct'});
    expect(parseHash('#view=fancy&id=I12')).toEqual({id: 'I12'});
    expect(parseHash('#level=bogus&up=x&down=99')).toEqual({down: 12});
    expect(parseHash('')).toEqual({});
  });
});

describe('chart scope', () => {
  it('counts from the first person after loading', () => {
    expect(loaded().rootId).toBe('I1');
  });

  it('a level raises «вверх» to what it needs', () => {
    let s = reducer(loaded(), {type: 'setScope', patch: {up: 1}});
    s = reducer(s, {type: 'setScope', patch: {level: 'cousins1'}});
    expect(s.scope).toMatchObject({level: 'cousins1', up: 2});
  });

  it('re-roots on request, and when the selected person is off the chart', () => {
    let s = reducer(loaded(), {type: 'reroot', id: 'I4'});
    expect(s.rootId).toBe('I4');
    expect(s.selectedId).toBe('I4');
    s = reducer(loaded(), {
      type: 'setScope',
      patch: {level: 'direct', up: 1, down: 0},
    });
    const far = [...mockTree.indis.keys()].find(
      (id) => !scopeDrawn(mockTree, chartPeople(s)).has(id),
    );
    if (far) {
      const t = reducer(s, {type: 'select', id: far});
      expect(t.rootId).toBe(far);
    }
    // A spouse is on the chart too: selecting keeps the root.
    const near = [...scopeDrawn(mockTree, chartPeople(s))].find(
      (id) => !chartPeople(s).has(id),
    );
    if (near) {
      expect(reducer(s, {type: 'select', id: near}).rootId).toBe(s.rootId);
    }
  });
});

describe('flyouts and card', () => {
  it('opens one flyout at a time and ignores a stale close', () => {
    let s = reducer(loaded(), {type: 'openFlyout', id: 'people'});
    s = reducer(s, {type: 'openFlyout', id: 'settings'});
    expect(s.flyout).toBe('settings');
    expect(reducer(s, {type: 'closeFlyout', id: 'people'}).flyout).toBe(
      'settings',
    );
    expect(reducer(s, {type: 'closeFlyout', id: 'settings'}).flyout).toBeNull();
    expect(reducer(s, {type: 'closeFlyout'}).flyout).toBeNull();
  });

  it('selecting a person closes the open flyout', () => {
    const s = reducer(loaded(), {type: 'openFlyout', id: 'people'});
    expect(reducer(s, {type: 'select', id: 'I2'}).flyout).toBeNull();
  });

  it('toggles card minimise and full card', () => {
    let s = reducer(loaded(), {type: 'toggleCardExpanded'});
    expect(s.cardExpanded).toBe(false);
    s = reducer(s, {type: 'setFullCard', open: true});
    expect(s.fullCardOpen).toBe(true);
  });
});

describe('sections', () => {
  it('choosing a person keeps the map and leaves the summary for the chart', () => {
    const map = reducer(loaded(), {type: 'setMode', mode: 'map'});
    expect(reducer(map, {type: 'select', id: 'I2'}).mode).toBe('map');
    const summary = reducer(loaded(), {type: 'setMode', mode: 'summary'});
    expect(reducer(summary, {type: 'select', id: 'I2'}).mode).toBe('chart');
  });

  it('remembers the map view', () => {
    const s = reducer(loaded(), {type: 'setMapView', view: 'spread'});
    expect(s.mapView).toBe('spread');
  });
});

describe('settings, theme, zoom', () => {
  it('merges settings patches', () => {
    const s = reducer(initial(), {type: 'setSettings', patch: {showIds: true}});
    expect(s.settings).toEqual({...DEFAULT_SETTINGS, showIds: true});
  });

  it('sets theme and language', () => {
    let s = reducer(initial(), {type: 'setTheme', theme: 'dark'});
    s = reducer(s, {type: 'setLang', lang: 'ru'});
    expect(s.theme).toBe('dark');
    expect(s.lang).toBe('ru');
  });

  it("zoom buttons scale by a fixed factor and are each other's inverse", () => {
    let s = reducer(initial(), {type: 'zoom', mode: 'in'});
    expect(s.zoom).toBe(1.25);
    s = reducer(s, {type: 'zoom', mode: 'out'});
    expect(s.zoom).toBeCloseTo(1, 10);
  });

  it('clamps zoom and resets it on fit', () => {
    let s = initial();
    for (let i = 0; i < 30; i++) s = reducer(s, {type: 'zoom', mode: 'in'});
    expect(s.zoom).toBe(ZOOM_MAX);
    for (let i = 0; i < 30; i++) s = reducer(s, {type: 'zoom', mode: 'out'});
    expect(s.zoom).toBe(ZOOM_MIN);
    expect(reducer(s, {type: 'zoom', mode: 'fit'}).zoom).toBe(1);
  });
});

describe('persisted values', () => {
  it('sanitises stored settings', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(
      sanitizeSettings({
        showIds: true,
        sexColors: 'yes',
        disproven: 'dotted',
        dateStyle: 'weird',
        extra: 1,
      }),
    ).toEqual({...DEFAULT_SETTINGS, showIds: true, disproven: 'dotted'});
  });

  it('survives missing storage', () => {
    expect(loadPersisted()).toEqual({});
  });
});
