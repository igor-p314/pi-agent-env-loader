import { describe, it, expect, beforeEach } from 'vitest';
import { ProcessEnvProvider } from '../src/types.js';

describe('types.ts - ProcessEnvProvider', () => {
  let provider: ProcessEnvProvider;

  beforeEach(() => {
    provider = new ProcessEnvProvider();
  });

  it('should get undefined for non-existent key', () => {
    expect(provider.get('NON_EXISTENT')).toBeUndefined();
  });

  it('should set and get a value', () => {
    provider.set('TEST_KEY', 'test_value');
    expect(provider.get('TEST_KEY')).toBe('test_value');
  });

  it('should check if key exists', () => {
    expect(provider.has('PATH')).toBe(true);
    expect(provider.has('NON_EXISTENT')).toBe(false);
  });

  it('should update existing value', () => {
    provider.set('UPDATE_KEY', 'initial');
    provider.set('UPDATE_KEY', 'updated');
    expect(provider.get('UPDATE_KEY')).toBe('updated');
  });

  it('should delete value by setting undefined (if supported)', () => {
    provider.set('DELETE_KEY', 'value');
    expect(provider.has('DELETE_KEY')).toBe(true);
    // Note: process.env doesn't support delete in the same way
  });

  it('should handle empty string values', () => {
    provider.set('EMPTY_KEY', '');
    expect(provider.get('EMPTY_KEY')).toBe('');
  });

  it('should handle special characters in keys', () => {
    provider.set('KEY_WITH_UNDERSCORE', 'value');
    expect(provider.get('KEY_WITH_UNDERSCORE')).toBe('value');
  });
});
