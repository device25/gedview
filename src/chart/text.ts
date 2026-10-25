// Text fitting for the person boxes. SVG has no text wrapping, so names are
// measured and broken into lines here.

export type Measure = (text: string) => number;

/** Width of text in a canvas font; falls back to an estimate without canvas
 *  (server-side rendering, jsdom). Results are cached per string. */
export function canvasMeasure(font: string, fallbackPx: number): Measure {
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null =
    null;
  try {
    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(1, 1)
        : typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)
          ? null
          : document.createElement('canvas');
    ctx = canvas?.getContext('2d') ?? null;
    if (ctx) ctx.font = font;
  } catch {
    ctx = null;
  }
  const cache = new Map<string, number>();
  return (text) => {
    let w = cache.get(text);
    if (w === undefined) {
      w = ctx ? ctx.measureText(text).width : text.length * fallbackPx * 0.55;
      cache.set(text, w);
    }
    return w;
  };
}

const ELLIPSIS = '…';

/** Cuts `text` so that it and an ellipsis fit into `max`. */
function ellipsize(text: string, max: number, measure: Measure): string {
  if (measure(text) <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(text.slice(0, mid).trimEnd() + ELLIPSIS) <= max) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + ELLIPSIS;
}

/**
 * Breaks a name into at most `maxLines` lines of at most `max` pixels. The
 * last line ends with an ellipsis when the name does not fit.
 */
export function wrapName(
  name: string,
  max: number,
  measure: Measure,
  maxLines = 2,
): string[] {
  const words = name.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  let i = 0;
  for (; i < words.length && lines.length < maxLines; i++) {
    const word = words[i]!;
    const next = line ? `${line} ${word}` : word;
    if (measure(next) <= max) {
      line = next;
    } else if (line) {
      lines.push(line);
      line = '';
      i--; // the word starts the next line
    } else {
      // A single word wider than the line.
      lines.push(ellipsize(word, max, measure));
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (i < words.length && lines.length > 0) {
    // Text is left over: the last line must say so.
    const rest = [lines.pop()!, ...words.slice(i)].join(' ');
    lines.push(ellipsize(rest, max, measure));
  }
  return lines.length ? lines : [''];
}

/** The dash between birth and death when either side has spaces: a
 *  no-break space before it, a space after (see joinRange). */
const DASH = /\u00a0(\S+) /;

/**
 * Life dates in at most `maxLines` lines of at most `max` pixels. Too long
 * for a line, they break after the dash, birth above and death below; with
 * one line only, the birth stays and an ellipsis stands for the rest.
 */
export function wrapLife(
  life: string,
  max: number,
  measure: Measure,
  maxLines: number,
): string[] {
  if (measure(life) <= max) return [life];
  const m = DASH.exec(life);
  if (m) {
    const birth = `${life.slice(0, m.index)}\u00a0${m[1]}`;
    const death = life.slice(m.index + m[0].length);
    if (maxLines > 1 && measure(birth) <= max && measure(death) <= max)
      return [birth, death];
    if (maxLines === 1 && measure(`${birth} ${ELLIPSIS}`) <= max)
      return [`${birth} ${ELLIPSIS}`];
  }
  return wrapName(life, max, measure, maxLines);
}
