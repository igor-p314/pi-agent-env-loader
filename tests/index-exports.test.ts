import { describe, it, expect } from 'vitest';
import { isSecretKey, isProtectedKey, maskValue, parseEnvFile, collectEnvChanges } from '../index.js';
import { isPathLike } from '../src/path-utils.js';



describe('index.ts exports integration', () => {
  it('should export and work with parseEnvFile', () => {
    const result = parseEnvFile('KEY=value');
    expect(result.vars.length).toBe(1);
    expect(result.vars[0].key).toBe('KEY');
  });

  it('should export and work with collectEnvChanges', () => {
    const env = { EXISTING: 'old' };
    const vars = [{ key: 'NEW_VAR', value: 'new' }];
    const result = collectEnvChanges(vars, env);
    expect(result.toSet.has('NEW_VAR')).toBe(true);
  });

  it('should export isSecretKey correctly', () => {
    expect(isSecretKey('API_KEY')).toBe(true);
    expect(isSecretKey('NORMAL')).toBe(false);
  });

  it('should export isProtectedKey correctly', () => {
    expect(isProtectedKey('PATH')).toBe(true);
    expect(isProtectedKey('MY_VAR')).toBe(false);
  });

  it('should export maskValue correctly', () => {
    expect(maskValue('secret')).toBe('se****');
  });
});
