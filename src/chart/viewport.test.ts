import {describe, expect, it} from 'vitest';
import {
  centerXform,
  constrainXform,
  fitScale,
  KEEP_VISIBLE,
  panIntoView,
} from './viewport';

const view = {w: 800, h: 600};

describe('centerXform', () => {
  it('puts the point at the middle of the view', () => {
    const t = centerXform(500, 300, 2, view);
    expect(500 * t.k + t.x).toBe(400);
    expect(300 * t.k + t.y).toBe(300);
  });
});

describe('fitScale', () => {
  it('fits both dimensions with a margin and never magnifies past max', () => {
    expect(fitScale({w: 1504, h: 400}, view, 0.05, 1)).toEqual({
      k: 0.5,
      exact: true,
    });
    expect(fitScale({w: 100, h: 100}, view, 0.05, 1).k).toBe(1);
  });

  it('reports a chart too big for the smallest scale', () => {
    const fit = fitScale({w: 100_000, h: 500}, view, 0.05, 1);
    expect(fit).toEqual({k: 0.05, exact: false});
  });
});

describe('constrainXform', () => {
  const chart = {w: 2000, h: 1000};
  it('leaves a transform that shows the chart alone', () => {
    const t = {x: -300, y: 20, k: 1};
    expect(constrainXform(t, chart, view)).toEqual(t);
  });

  it('keeps part of the chart on screen when dragged away', () => {
    const far = constrainXform({x: -9000, y: 9000, k: 1}, chart, view);
    expect(far.x).toBe(KEEP_VISIBLE - chart.w);
    expect(far.y).toBe(view.h - KEEP_VISIBLE);
    const near = constrainXform({x: 9000, y: -9000, k: 1}, chart, view);
    expect(near.x).toBe(view.w - KEEP_VISIBLE);
    expect(near.y).toBe(KEEP_VISIBLE - chart.h);
  });

  it('keeps the scale', () => {
    expect(constrainXform({x: 0, y: 0, k: 0.3}, chart, view).k).toBe(0.3);
  });
});

describe('panIntoView', () => {
  it('does nothing for a box that is inside', () => {
    expect(panIntoView({x: 100, y: 100, w: 220, h: 72}, view)).toEqual({
      dx: 0,
      dy: 0,
    });
  });

  it('pans the least that shows the box with a margin', () => {
    expect(panIntoView({x: 700, y: 100, w: 220, h: 72}, view)).toEqual({
      dx: 800 - 24 - 920,
      dy: 0,
    });
    expect(panIntoView({x: 100, y: -50, w: 220, h: 72}, view)).toEqual({
      dx: 0,
      dy: 74,
    });
  });
});
