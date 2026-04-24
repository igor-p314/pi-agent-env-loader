import { describe, it, expect } from 'vitest';
import { isPathLike, isSecretKey, isProtectedKey, maskValue, parseEnvFile, collectEnvChanges } from '../src/index.js';

describe('isPathLike extended tests', () => {
  it('should detect Unix paths', () => {
    expect(isPathLike('./config/env')).toBe(true);
    expect(isPathLike('/home/user/.env')).toBe(true);
    expect(isPathLike('../.env')).toBe(true);
  });

  it('should detect Windows paths', () => {
    expect(isPathLike('C:\\Projects\\.env')).toBe(true);
    expect(isPathLike('D:/config/dev.env')).toBe(true);
  });

  it('should detect Unicode (Cyrillic) paths', () => {
    expect(isPathLike('./проекты/настройки.env')).toBe(true);
    expect(isPathLike('C:\\Проекты\\.env')).toBe(true);
  });

  it('should detect file extensions', () => {
    expect(isPathLike('file.env')).toBe(true);
    expect(isPathLike('.env.local')).toBe(true);
  });

  it('should not match commands', () => {
    expect(isPathLike('reload')).toBe(false);
    expect(isPathLike('list')).toBe(false);
    expect(isPathLike('get')).toBe(false);
  });

  it('should detect relative paths with dots', () => {
    expect(isPathLike('.env')).toBe(true);
    expect(isPathLike('..env')).toBe(false);
  });

  it('should detect Windows drives', () => {
    expect(isPathLike('C:')).toBe(true);
  });

  it('should handle empty string', () => {
    expect(isPathLike('')).toBe(false);
  });

  it('should handle plain commands', () => {
    expect(isPathLike('help')).toBe(false);
    expect(isPathLike('set')).toBe(false);
  });
});

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
