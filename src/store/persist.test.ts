import {describe, expect, it} from 'vitest';
import {DEFAULT_SETTINGS, sanitizeSettings} from './persist';

describe('date style setting', () => {
  it('defaults to the Russian traditional notation for new users', () => {
    expect(DEFAULT_SETTINGS.dateStyle).toBe('both');
    expect(sanitizeSettings(undefined).dateStyle).toBe('both');
    expect(sanitizeSettings({}).dateStyle).toBe('both');
  });

  it('keeps a stored choice', () => {
    expect(sanitizeSettings({dateStyle: 'source'}).dateStyle).toBe('source');
    expect(sanitizeSettings({dateStyle: 'gregorian'}).dateStyle).toBe(
      'gregorian',
    );
    expect(sanitizeSettings({dateStyle: 'nonsense'}).dateStyle).toBe('both');
  });
});

describe('source reliability setting', () => {
  it('shows all sources by default, also for settings saved before it', () => {
    expect(DEFAULT_SETTINGS.minSourceQuality).toBe('all');
    expect(sanitizeSettings({sexColors: false}).minSourceQuality).toBe('all');
  });

  it('keeps a stored threshold and rejects anything else', () => {
    expect(sanitizeSettings({minSourceQuality: '0'}).minSourceQuality).toBe(
      '0',
    );
    expect(sanitizeSettings({minSourceQuality: '3'}).minSourceQuality).toBe(
      '3',
    );
    for (const bad of ['4', 2, null]) {
      expect(sanitizeSettings({minSourceQuality: bad}).minSourceQuality).toBe(
        'all',
      );
    }
  });
});
