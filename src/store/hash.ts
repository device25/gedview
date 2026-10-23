import type {ChartView} from '../gedcom/types';

export const VIEWS: ChartView[] = ['hourglass', 'relatives'];

export const isView = (v: unknown): v is ChartView =>
  typeof v === 'string' && (VIEWS as string[]).includes(v);

export interface HashState {
  view?: ChartView;
  id?: string;
}

/** The hash carries only the chart view and a person id: no names, no data. */
export function parseHash(hash: string): HashState {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const view = params.get('view');
  const id = params.get('id');
  return {
    ...(isView(view) ? {view} : {}),
    ...(id ? {id} : {}),
  };
}

export function buildHash(view: ChartView, id?: string): string {
  const params = new URLSearchParams({view});
  if (id) params.set('id', id);
  return `#${params.toString()}`;
}

/**
 * Absolute URL of a person in the current page. Absolute on purpose: it is
 * copyable and openable in a new tab, and is not mistaken for a skip link.
 */
export function personHref(view: ChartView, id: string): string {
  return `${location.origin}${location.pathname}${location.search}${buildHash(view, id)}`;
}
