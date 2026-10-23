import {describe, expect, it} from 'vitest';
import {mockTree} from '../ui/mock/mockTree';
import {parseHash, buildHash} from './hash';
import {DEFAULT_SETTINGS, sanitizeSettings, loadPersisted} from './persist';
import {
  createInitialState,
  pickInitialId,
  reducer,
  ZOOM_MAX,
  ZOOM_MIN,
  type AppState,
} from './reducer';

const initial = () => createInitialState({}, {}, 'en');
const loaded = (): AppState =>
  reducer(initial(), {type: 'loadDone', tree: mockTree});

describe('initial state', () => {
  it('starts empty with defaults', () => {
    const s = initial();
    expect(s.tree).toBeUndefined();
    expect(s.view).toBe('hourglass');
    expect(s.theme).toBe('system');
    expect(s.settings).toEqual(DEFAULT_SETTINGS);
    expect(s.load).toEqual({phase: 'idle'});
  });

  it('takes the view from the hash and settings from storage', () => {
    const s = createInitialState(
      {theme: 'dark', settings: {...DEFAULT_SETTINGS, showIds: true}},
      {view: 'relatives'},
      'ru',
    );
    expect(s.view).toBe('relatives');
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

  it('applies view and id from a hash change, ignoring unknown ids', () => {
    const s = reducer(loaded(), {
      type: 'hashChanged',
      hash: {view: 'relatives', id: 'I6'},
    });
    expect(s.view).toBe('relatives');
    expect(s.selectedId).toBe('I6');
    const t = reducer(s, {type: 'hashChanged', hash: {id: 'X99'}});
    expect(t.selectedId).toBe('I6');
  });

  it('round-trips the hash and ignores junk', () => {
    expect(buildHash('relatives', 'I12')).toBe('#view=relatives&id=I12');
    expect(parseHash('#view=relatives&id=I12')).toEqual({
      view: 'relatives',
      id: 'I12',
    });
    // The fan view was removed: old links fall back to the default view.
    expect(parseHash('#view=fancy&id=I12')).toEqual({id: 'I12'});
    expect(parseHash('#view=bogus')).toEqual({});
    expect(parseHash('')).toEqual({});
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
