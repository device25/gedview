import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  availableCodes,
  detectLanguage,
  getMessagesOf,
  languages,
  messagesFor,
} from '.';

const placeholders = (msg: string) =>
  [...msg.matchAll(/\{\s*(\w+)\s*[,}]/g)].map((m) => m[1]).sort();

describe('message files', () => {
  it('has ru and en with exactly the same keys', () => {
    const ru = Object.keys(getMessagesOf('ru')).sort();
    const en = Object.keys(getMessagesOf('en')).sort();
    expect(ru).toEqual(en);
  });

  it('uses the same placeholders in ru and en', () => {
    const ru = getMessagesOf('ru');
    const en = getMessagesOf('en');
    for (const key of Object.keys(en)) {
      expect(placeholders(ru[key] ?? ''), key).toEqual(
        placeholders(en[key] ?? ''),
      );
    }
  });

  it('has no empty messages', () => {
    for (const code of availableCodes) {
      for (const [key, msg] of Object.entries(getMessagesOf(code))) {
        expect(msg.trim(), `${code}:${key}`).not.toBe('');
      }
    }
  });

  it('has every message id used in the source', () => {
    const en = getMessagesOf('en');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx?)$/.test(name) && !/\.test\./.test(name))
          files.push(p);
      }
    };
    walk(join(import.meta.dirname, '..'));
    const used = new Set<string>();
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(
        /(?:\bid: |\bt\(|countPart\(intl, )'([a-zA-Z0-9_.]+)'/g,
      )) {
        const id = m[1];
        if (id?.includes('.')) used.add(id);
      }
    }
    expect(used.size).toBeGreaterThan(40);
    for (const id of used) expect(en, id).toHaveProperty([id]);
  });
});

describe('languages', () => {
  it('lists a language per message file with its own name', () => {
    expect(languages.map((l) => l.code)).toEqual(['en', 'ru']);
    expect(languages.find((l) => l.code === 'ru')).toMatchObject({
      name: 'Русский',
      short: 'RU',
      coverage: 1,
    });
  });

  it('falls back to English for unknown languages', () => {
    expect(messagesFor('xx')).toEqual(getMessagesOf('en'));
  });

  it('picks ru for Russian browsers and en otherwise', () => {
    expect(detectLanguage(['ru-RU', 'en'])).toBe('ru');
    expect(detectLanguage(['ru'])).toBe('ru');
    expect(detectLanguage(['de-DE', 'ru'])).toBe('ru');
    expect(detectLanguage(['de-DE'])).toBe('en');
    expect(detectLanguage([])).toBe('en');
  });
});
