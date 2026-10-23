import {createElement, type ReactNode} from 'react';

/**
 * Sanitiser for GEDCOM notes with MIME text/html. The markup is parsed by the
 * browser's DOMParser (an inert document: nothing runs or loads), walked, and
 * rebuilt from an allowlist as React elements. Nothing is injected as HTML.
 */

export type SafeNode =
  string | {tag: SafeTag; href?: string; soft?: boolean; children: SafeNode[]};

const ALLOWED = [
  'p',
  'br',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'sub',
  'sup',
  'ul',
  'ol',
  'li',
  'blockquote',
  'a',
  'span',
] as const;
type SafeTag = (typeof ALLOWED)[number];
const allowed = new Set<string>(ALLOWED);

/** Dropped together with their content (never shown as text). */
const DROPPED = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
  'noscript',
  'template',
  'head',
  'title',
  'link',
  'meta',
  'base',
  'frame',
  'frameset',
  'applet',
]);

/** Unwrapped elements that still start a new line. */
const BLOCKS = new Set([
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'pre',
  'section',
  'article',
  'header',
  'footer',
  'table',
  'tr',
  'dl',
  'dt',
  'dd',
  'figure',
  'figcaption',
  'address',
  'details',
  'summary',
  'hr',
]);

const MAX_DEPTH = 48;
const SAFE_LINK = new Set(['http:', 'https:', 'mailto:']);

/** The normalised href when it is http(s) or mailto, else undefined. */
export function safeHref(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw.trim());
    return SAFE_LINK.has(url.protocol) ? url.href : undefined;
  } catch {
    return undefined; // relative or malformed
  }
}

function walk(parent: Node, depth: number): SafeNode[] {
  const out: SafeNode[] = [];
  parent.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      if (child.nodeValue) out.push(child.nodeValue);
      return;
    }
    if (child.nodeType !== 1) return; // comments, processing instructions
    const el = child as Element;
    const tag = el.tagName.toLowerCase();
    if (DROPPED.has(tag)) return;
    if (depth >= MAX_DEPTH) {
      if (el.textContent) out.push(el.textContent);
      return;
    }
    const kids = walk(el, depth + 1);
    if (allowed.has(tag)) {
      if (tag === 'br') {
        out.push({tag: 'br', children: []});
      } else if (tag === 'a') {
        const href = safeHref(el.getAttribute('href'));
        if (href) out.push({tag: 'a', href, children: kids});
        else out.push(...kids);
      } else {
        out.push({tag: tag as SafeTag, children: kids});
      }
    } else if (BLOCKS.has(tag)) {
      const soft: SafeNode = {tag: 'br', soft: true, children: []};
      out.push(soft, ...kids, soft);
    } else {
      out.push(...kids);
    }
  });
  return out;
}

const isBlock = (n: SafeNode) =>
  typeof n !== 'string' &&
  ['p', 'ul', 'ol', 'blockquote', 'li'].includes(n.tag);
const isBr = (n: SafeNode) => typeof n !== 'string' && n.tag === 'br';
const isSoft = (n: SafeNode) => typeof n !== 'string' && !!n.soft;

/**
 * Drops line breaks that touch the edges or a block (they add no meaning) and
 * merges the breaks added for unwrapped blocks into one.
 */
function tidy(nodes: SafeNode[]): SafeNode[] {
  const kept = nodes.map((n) =>
    typeof n === 'string' ? n : {...n, children: tidy(n.children)},
  );
  const out: SafeNode[] = [];
  kept.forEach((n, i) => {
    if (isBr(n)) {
      const prev = out[out.length - 1];
      const next = kept[i + 1];
      if (!prev || !next || isBlock(prev) || isBlock(next)) return;
      if (isSoft(n) && isBr(prev)) return;
    }
    out.push(n);
  });
  return out;
}

/** Parses and sanitises an HTML fragment into a tree of allowed nodes. */
export function sanitizeHtml(html: string): SafeNode[] {
  if (typeof DOMParser === 'undefined') return [html.replace(/<[^>]*>/g, '')];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return tidy(walk(doc.body, 0));
}

/** Plain text of sanitised HTML (for places where markup is not wanted). */
export function htmlToText(html: string): string {
  const text = (nodes: SafeNode[]): string =>
    nodes
      .map((n) =>
        typeof n === 'string'
          ? n
          : n.tag === 'br'
            ? '\n'
            : text(n.children) + (n.tag === 'p' ? '\n' : ''),
      )
      .join('');
  return text(sanitizeHtml(html)).trim();
}

function render(nodes: SafeNode[], prefix: string): ReactNode[] {
  return nodes.map((n, i) => {
    if (typeof n === 'string') return n;
    const key = `${prefix}${i}`;
    if (n.tag === 'br') return createElement('br', {key});
    const props: Record<string, unknown> = {key};
    if (n.tag === 'a') {
      props.href = n.href;
      props.target = '_blank';
      props.rel = 'noopener noreferrer';
      props.className = 'link link--ul';
    }
    return createElement(n.tag, props, ...render(n.children, `${key}.`));
  });
}

export function SafeHtml({html}: {html: string}) {
  return <>{render(sanitizeHtml(html), '')}</>;
}
