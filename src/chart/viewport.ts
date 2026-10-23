// Pure geometry for pan and zoom: where the chart sits in the viewport.

export interface Size {
  w: number;
  h: number;
}

/** A d3-zoom transform without the class: screen = point * k + (x, y). */
export interface Xform {
  x: number;
  y: number;
  k: number;
}

/** Part of the chart that must stay on screen when panning, in pixels. */
export const KEEP_VISIBLE = 120;

/** Keeps at least KEEP_VISIBLE pixels of the chart inside the viewport. */
export function constrainXform(t: Xform, chart: Size, view: Size): Xform {
  const keepX = Math.min(KEEP_VISIBLE, view.w / 2, chart.w * t.k);
  const keepY = Math.min(KEEP_VISIBLE, view.h / 2, chart.h * t.k);
  return {
    k: t.k,
    x: Math.min(view.w - keepX, Math.max(keepX - chart.w * t.k, t.x)),
    y: Math.min(view.h - keepY, Math.max(keepY - chart.h * t.k, t.y)),
  };
}

/** The transform that puts the point (cx, cy) at the viewport centre. */
export function centerXform(cx: number, cy: number, k: number, view: Size) {
  return {k, x: view.w / 2 - cx * k, y: view.h / 2 - cy * k};
}

/**
 * Scale that fits the whole chart into the viewport, never above `max`.
 * `exact` tells whether the chart really fits: below `min` it does not, and
 * the caller should show the part around the selected person instead.
 */
export function fitScale(
  chart: Size,
  view: Size,
  min: number,
  max: number,
  margin = 24,
): {k: number; exact: boolean} {
  const k = Math.min(
    (view.w - 2 * margin) / chart.w,
    (view.h - 2 * margin) / chart.h,
  );
  return {k: Math.min(max, Math.max(min, k)), exact: k >= min};
}

/** The smallest pan (dx, dy) that brings a box fully into the viewport. */
export function panIntoView(
  box: {x: number; y: number; w: number; h: number},
  view: Size,
  margin = 24,
): {dx: number; dy: number} {
  const fix = (pos: number, len: number, avail: number) => {
    if (len + 2 * margin > avail) return avail / 2 - (pos + len / 2);
    if (pos < margin) return margin - pos;
    if (pos + len > avail - margin) return avail - margin - (pos + len);
    return 0;
  };
  return {dx: fix(box.x, box.w, view.w), dy: fix(box.y, box.h, view.h)};
}
