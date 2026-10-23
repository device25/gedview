// @vitest-environment jsdom
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {htmlToText, safeHref, SafeHtml} from './html';

const render = (html: string) => renderToStaticMarkup(<SafeHtml html={html} />);

describe('sanitizeHtml', () => {
  it('keeps the allowed formatting', () => {
    expect(
      render('<p>a <b>b</b> <em>c</em> H<sub>2</sub>O<sup>x</sup></p>'),
    ).toBe('<p>a <b>b</b> <em>c</em> H<sub>2</sub>O<sup>x</sup></p>');
    expect(render('<ul><li>one</li><li>two</li></ul><ol><li>x</li></ol>')).toBe(
      '<ul><li>one</li><li>two</li></ul><ol><li>x</li></ol>',
    );
    expect(render('<blockquote>q</blockquote>')).toBe(
      '<blockquote>q</blockquote>',
    );
  });

  it('drops script, style, iframe, object, embed, svg, math with content', () => {
    for (const bad of [
      '<script>alert(1)</script>',
      '<style>p{color:red}</style>',
      '<iframe src="https://evil.example"></iframe>',
      '<iframe srcdoc="<script>1</script>">inner</iframe>',
      '<object data="x">inner</object>',
      '<embed src="x">',
      '<svg><script>alert(1)</script><text>inner</text></svg>',
      '<svg><g><foreignObject><p>inner</p></foreignObject></g></svg>',
      '<math><mi>inner</mi></math>',
      '<noscript><img src=x onerror=alert(1)></noscript>',
      '<template><p>inner</p></template>',
    ]) {
      const out = render(`<p>ok</p>${bad}<p>end</p>`);
      expect(out, bad).toBe('<p>ok</p><p>end</p>');
    }
  });

  it('strips every attribute except a safe href', () => {
    const out = render(
      '<p onclick="alert(1)" style="x" class="c" id="i">t</p>' +
        '<b onmouseover="alert(1)">b</b>' +
        '<span style="background:url(javascript:1)" data-x="1">s</span>',
    );
    expect(out).toBe('<p>t</p><b>b</b><span>s</span>');
  });

  it('unwraps unknown elements to their text', () => {
    expect(
      render('<p><font color="red">x</font><img src=x onerror=alert(1)> y</p>'),
    ).toBe('<p>x y</p>');
    expect(
      render('<form action="/x"><input value="v"><button>go</button></form>'),
    ).toBe('go');
  });

  it('keeps line structure of unwrapped blocks', () => {
    expect(render('<div>a</div><div>b</div>')).toBe('a<br/>b');
    expect(render('<h2>Title</h2><p>text</p>')).toBe('Title<p>text</p>');
    expect(render('a<br>b')).toBe('a<br/>b');
  });

  it('turns text containing markup characters into text, not markup', () => {
    expect(render('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
    expect(render('<p>1 &lt; 2 &amp;&amp; 3 &gt; 2</p>')).toBe(
      '<p>1 &lt; 2 &amp;&amp; 3 &gt; 2</p>',
    );
  });

  it('renders http, https and mailto links with safe attributes', () => {
    for (const href of [
      'https://example.org/a?b=1',
      'http://example.org/',
      'mailto:someone@example.org',
    ]) {
      const out = render(
        `<a href="${href}" onclick="x()" target="_self">l</a>`,
      );
      expect(out).toContain(
        `href="${new URL(href).href.replace(/&/g, '&amp;')}"`,
      );
      expect(out).toContain('target="_blank"');
      expect(out).toContain('rel="noopener noreferrer"');
      expect(out).not.toContain('onclick');
      expect(out).not.toContain('_self');
    }
  });

  it('unwraps links with unsafe or relative targets, keeping their text', () => {
    for (const href of [
      'javascript:alert(1)',
      ' JaVaScRiPt:alert(1)',
      'java\tscript:alert(1)',
      'java&#10;script:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:x',
      'file:///etc/passwd',
      '//evil.example/x',
      '/relative',
      '#frag',
      '',
    ]) {
      expect(render(`<a href="${href}">label</a>`), href).toBe('label');
    }
    expect(render('<a>no href</a>')).toBe('no href');
  });

  it('survives deeply nested and broken markup', () => {
    const deep = '<b>'.repeat(5000) + 'x' + '</b>'.repeat(5000);
    expect(htmlToText(deep)).toContain('x');
    expect(render('<p><b>unclosed <i>tags')).toBe(
      '<p><b>unclosed <i>tags</i></b></p>',
    );
  });

  it('survives hostile combinations', () => {
    const out = render(
      '<svg><a xlink:href="javascript:1"><text>x</text></a></svg>' +
        '<a href="https://ok.example/"><script>alert(1)</script>ok</a>' +
        '<img src="https://track.example/p.gif">' +
        '<p title="<script>">t</p><!-- <script>1</script> -->',
    );
    expect(out).not.toMatch(/script|svg|img|javascript|track|title/i);
    expect(out).toContain('>ok</a>');
  });
});

describe('safeHref', () => {
  it('accepts only http, https and mailto', () => {
    expect(safeHref('https://a.example')).toBe('https://a.example/');
    expect(safeHref('mailto:a@b.example')).toBe('mailto:a@b.example');
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('data:text/plain,x')).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
  });
});

describe('htmlToText', () => {
  it('returns the plain text', () => {
    expect(htmlToText('<p>a <b>b</b></p><p>c</p><script>x</script>')).toBe(
      'a b\nc',
    );
  });
});
