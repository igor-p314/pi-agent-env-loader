import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseEnvFile, collectEnvChanges, maskValue, isSecretKey, isProtectedKey, isPathLike, applyEnvChanges } from '../src/index.js';

// Helper to create env with type safety
function makeEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
  return env;
}

describe('parseEnvFile', () => {
  it('should parse simple KEY=value', () => {
    const result = parseEnvFile('KEY=value');
    expect(result.vars).toHaveLength(1);
    expect(result.vars[0].key).toBe('KEY');
    expect(result.vars[0].value).toBe('value');
  });

  it('should parse operators ?=, +=, -=', () => {
    const result = parseEnvFile('A?=1\nB+=2\nC-=3');
    expect(result.vars[0].operation).toBe('default');
    expect(result.vars[1].operation).toBe('append');
    expect(result.vars[2].operation).toBe('prepend');
  });

  it('should NOT support Unicode (Cyrillic) variable names', () => {
    const result = parseEnvFile('ПЕРЕМЕННАЯ=значение\nKEY_С_КИРИЛЛИЦЕЙ=value');
    // Should not parse Cyrillic variable names
    expect(result.vars).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should handle Unicode paths in values', () => {
    const result = parseEnvFile('PATH=/проекты/тест:/home/user');
    expect(result.vars).toHaveLength(1);
    expect(result.vars[0].value).toBe('/проекты/тест:/home/user');
  });

  it('should handle export prefix', () => {
    const result = parseEnvFile('export KEY=value');
    expect(result.vars).toHaveLength(1);
    expect(result.vars[0].key).toBe('KEY');
  });

  it('should handle quoted values', () => {
    const result = parseEnvFile('KEY="value with spaces"\nSINGLE=\'single quoted\'');
    expect(result.vars[0].value).toBe('value with spaces');
    expect(result.vars[1].value).toBe('single quoted');
  });

  it('should handle escape sequences', () => {
    const result = parseEnvFile('NEWLINE="line1\\nline2"\nTAB="col1\\tcol2"');
    expect(result.vars[0].value).toBe('line1\nline2');
    expect(result.vars[1].value).toBe('col1\tcol2');
  });

  it('should handle multiline values (backslash at end)', () => {
    const result = parseEnvFile('MULTI=line1\\\nline2\\\nline3');
    expect(result.vars).toHaveLength(1);
    expect(result.vars[0].value).toBe('line1line2line3');
  });

  it('should handle inline comments', () => {
    const result = parseEnvFile('KEY=value # this is a comment');
    expect(result.vars).toHaveLength(1);
    expect(result.vars[0].value).toBe('value');
  });

  it('should skip empty lines and comments', () => {
    const result = parseEnvFile('# Comment\n\nKEY=value\n\n# Another comment');
    expect(result.vars).toHaveLength(1);
  });

  it('should report invalid keys', () => {
    const result = parseEnvFile('123INVALID=value\n!@#=bad');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should handle interpolation syntax in values', () => {
    const result = parseEnvFile('BASE=/api\nURL=${BASE}/v1');
    expect(result.vars).toHaveLength(2);
    expect(result.vars[1].value).toBe('${BASE}/v1');
  });
});

describe('collectEnvChanges', () => {
  it('should skip existing vars by default', () => {
    const env = makeEnv({ EXISTING: 'old' });
    const vars = [{ key: 'EXISTING', value: 'new' }];
    const result = collectEnvChanges(vars, env);
    expect(result.toSet.has('EXISTING')).toBe(false);
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0].reason).toBe('exists');
  });

  it('should skip "default" (?=) vars even with forceOverwrite', () => {
    const env = makeEnv({ EXISTING: 'old' });
    const vars = [{ key: 'EXISTING', value: 'new', operation: 'default' as const }];
    // Even with forceOverwrite=true, "default" should not overwrite
    const result = collectEnvChanges(vars, env, true);
    expect(result.toSet.has('EXISTING')).toBe(false);
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0].reason).toBe('exists');
  });

  it('should overwrite "set" vars with forceOverwrite', () => {
    const env = makeEnv({ EXISTING: 'old' });
    const vars = [{ key: 'EXISTING', value: 'new', operation: 'set' as const }];
    const result = collectEnvChanges(vars, env, true);
    expect(result.toSet.has('EXISTING')).toBe(true);
    expect(result.toSet.get('EXISTING')).toBe('new');
  });

  it('should use correct separator for append (Unix vs Windows)', () => {
    const env = makeEnv({ MY_PATH: '/usr/bin' });
    const vars = [{ key: 'MY_PATH', value: '/opt/bin', operation: 'append' as const }];
    const result = collectEnvChanges(vars, env);
    // Default separator is ':' on non-Windows, ';' on Windows
    const separator = process.platform === 'win32' ? ';' : ':';
    expect(result.toSet.get('MY_PATH')).toBe('/usr/bin' + separator + '/opt/bin');
  });

  it('should avoid double separators on append', () => {
    const env = makeEnv({ MY_PATH: '/usr/bin:' });
    const vars = [{ key: 'MY_PATH', value: '/opt/bin', operation: 'append' as const }];
    const result = collectEnvChanges(vars, env);
    const separator = process.platform === 'win32' ? ';' : ':';
    // Should not have double separator
    expect(result.toSet.get('MY_PATH')).not.toBe('/usr/bin::/opt/bin');
    expect(result.toSet.get('MY_PATH')).toBe('/usr/bin:' + '/opt/bin');
  });

  it('should avoid double separators on prepend', () => {
    const env = makeEnv({ MY_PATH: '/usr/bin' });
    const vars = [{ key: 'MY_PATH', value: '/opt/bin', operation: 'prepend' as const }];
    const result = collectEnvChanges(vars, env);
    const separator = process.platform === 'win32' ? ';' : ':';
    expect(result.toSet.get('MY_PATH')).toBe('/opt/bin' + separator + '/usr/bin');
  });

  it('should limit interpolated value length', () => {
    const longValue = 'A'.repeat(5000);
    const env = makeEnv({ LONG: longValue });
    const vars = [{ key: 'TEST', value: '${LONG}' }];
    const result = collectEnvChanges(vars, env);
    // Value should be truncated to MAX_INTERPOLATED_LENGTH (4096)
    const testValue = result.toSet.get('TEST');
    expect(testValue?.length).toBeLessThanOrEqual(4096);
  });

  it('should interpolate variables', () => {
    const env = makeEnv({ BASE_URL: 'https://api.example.com' });
    const vars = [{ key: 'API_URL', value: '${BASE_URL}/v1' }];
    const result = collectEnvChanges(vars, env);
    expect(result.toSet.get('API_URL')).toBe('https://api.example.com/v1');
  });

  it('should handle missing interpolation vars', () => {
    const env = makeEnv({});
    const vars = [{ key: 'TEST', value: '${MISSING}' }];
    const result = collectEnvChanges(vars, env);
    // Missing var should result in empty string
    expect(result.toSet.get('TEST')).toBe('');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should skip protected vars', () => {
    const env = makeEnv({});
    const vars = [{ key: 'PATH', value: '/new/path' }];
    const result = collectEnvChanges(vars, env);
    expect(result.toSet.has('PATH')).toBe(false);
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0].reason).toBe('protected');
  });
});

describe('maskValue', () => {
  it('should mask long values', () => {
    const masked = maskValue('supersecretpassword');
    // Length is 19. showChars=2 -> 'su' + 17 stars
    expect(masked).toBe('su' + '*'.repeat(17));
    expect(masked.length).toBe(19);
  });

  it('should handle short values', () => {
    expect(maskValue('ab')).toBe('ab');
    expect(maskValue('a')).toBe('a');
  });

  it('should show correct number of chars', () => {
    const result = maskValue('12345', 3);
    // '123' + '**'
    expect(result).toBe('123' + '*'.repeat(2));
    expect(result.length).toBe(5);
  });

  it('should handle empty string', () => {
    expect(maskValue('')).toBe('');
  });
});

describe('isSecretKey / isProtectedKey', () => {
  it('should detect secret keys', () => {
    expect(isSecretKey('API_KEY')).toBe(true);
    expect(isSecretKey('MY_PASSWORD')).toBe(true);
    expect(isSecretKey('MY_SECRET')).toBe(true);
    expect(isSecretKey('AUTH_TOKEN')).toBe(true);
    expect(isSecretKey('RSA_PRIVATE')).toBe(true);
    expect(isSecretKey('NORMAL_VAR')).toBe(false);
  });

  it('should detect protected keys', () => {
    expect(isProtectedKey('PATH')).toBe(true);
    expect(isProtectedKey('HOME')).toBe(true);
    expect(isProtectedKey('USER')).toBe(true);
    expect(isProtectedKey('MY_VAR')).toBe(false);
  });

  it('should not detect Unicode names as secret (Cyrillic)', () => {
    // These should not be parsed as valid env var names anyway
    expect(isSecretKey('API_КЛЮЧ')).toBe(false);
    expect(isSecretKey('МОЙ_ПАРОЛЬ')).toBe(false);
  });
});

describe('isPathLike', () => {
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
    expect(isPathLike('..env')).toBe(false); // Not a path
  });
});

describe('interpolation edge cases', () => {
  it('should handle recursive interpolation with depth limit', () => {
    const env = makeEnv({ A: '$B', B: '$A' });
    const result = collectEnvChanges([{ key: 'TEST', value: '${A}' }], env);
    // Should stop at MAX_INTERPOLATION_DEPTH and warn about cycle
    expect(result.warnings.length).toBeGreaterThan(0);
    const cycleWarning = result.warnings.find(w => w.varName === '__CYCLE__');
    expect(cycleWarning).toBeDefined();
  });

  it('should handle $VAR and ${VAR} syntax', () => {
    const env = makeEnv({ NAME: 'world' });
    const vars = [
      { key: 'TEST1', value: 'Hello $NAME' },
      { key: 'TEST2', value: 'Hello ${NAME}' }
    ];
    const result = collectEnvChanges(vars, env);
    expect(result.toSet.get('TEST1')).toBe('Hello world');
    expect(result.toSet.get('TEST2')).toBe('Hello world');
  });

  it('should handle Windows paths in interpolation', () => {
    const env = makeEnv({ USER: 'testuser' });
    const vars = [{ key: 'PATH', value: 'C:\\Users\\$USER\\bin' }];
    // PATH is protected, but testing interpolation logic
    const result = collectEnvChanges(vars, env);
    // PATH is protected, so it should be skipped
    expect(result.toSet.has('PATH')).toBe(false);
  });
});

describe('applyEnvChanges', () => {
  it('should apply changes to process.env', () => {
    const vars = [{ key: 'TEST_APPLY_VAR', value: 'test_value' }];
    const result = collectEnvChanges(vars, {});
    expect(result.toSet.has('TEST_APPLY_VAR')).toBe(true);
    
    // Apply the changes
    applyEnvChanges(result);
    expect(process.env['TEST_APPLY_VAR']).toBe('test_value');
    
    // Cleanup
    delete process.env['TEST_APPLY_VAR'];
  });
});
