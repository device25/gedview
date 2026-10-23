import type {ChartSettings} from '../gedcom/types';

export type ThemePref = 'system' | 'light' | 'dark';

export const DEFAULT_SETTINGS: ChartSettings = {
  sexColors: true,
  showIds: false,
  dashChallenged: true,
  disproven: 'hide',
  dateStyle: 'source',
  hideRestricted: true,
  loadRemoteMedia: true,
};

const KEYS = {
  theme: 'gedview.theme',
  lang: 'gedview.lang',
  settings: 'gedview.settings',
} as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be blocked (private window); the app works without it.
  }
}

export const isThemePref = (v: unknown): v is ThemePref =>
  v === 'system' || v === 'light' || v === 'dark';

/** Keeps known keys of the right type; anything else falls back to defaults. */
export function sanitizeSettings(raw: unknown): ChartSettings {
  const s = {...DEFAULT_SETTINGS};
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  for (const k of [
    'sexColors',
    'showIds',
    'dashChallenged',
    'hideRestricted',
    'loadRemoteMedia',
  ] as const) {
    if (typeof r[k] === 'boolean') s[k] = r[k];
  }
  if (r.disproven === 'hide' || r.disproven === 'dotted')
    s.disproven = r.disproven;
  if (
    r.dateStyle === 'source' ||
    r.dateStyle === 'both' ||
    r.dateStyle === 'gregorian'
  )
    s.dateStyle = r.dateStyle;
  return s;
}

export interface Persisted {
  theme?: ThemePref;
  lang?: string;
  settings?: ChartSettings;
}

export function loadPersisted(): Persisted {
  const out: Persisted = {};
  const theme = read(KEYS.theme);
  if (isThemePref(theme)) out.theme = theme;
  const lang = read(KEYS.lang);
  if (lang) out.lang = lang;
  const settings = read(KEYS.settings);
  if (settings) {
    try {
      out.settings = sanitizeSettings(JSON.parse(settings));
    } catch {
      // Corrupt value: ignore.
    }
  }
  return out;
}

export const saveTheme = (v: ThemePref) => write(KEYS.theme, v);
export const saveLang = (v: string) => write(KEYS.lang, v);
export const saveSettings = (v: ChartSettings) =>
  write(KEYS.settings, JSON.stringify(v));
