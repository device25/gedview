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
