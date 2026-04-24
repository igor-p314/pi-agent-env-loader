import { describe, it, expect } from 'vitest';
import { parseEnvFile, processEscapes, unquoteValue, isEscaped, startsWithOperator } from '../src/index.js';

describe('parser edge cases - coverage improvement', () => {
  describe('processEscapes - unknown escape sequences', () => {
    it('should handle unknown escape sequences (not \\n, \\t, \\r, \\", \\\', \\\\)', () => {
      // In JS string: 'test\\a' means test\a in actual string
      // processEscapes sees \a where \ is not a known escape, so keeps \a
      expect(processEscapes('test\\a')).toBe('test\\a');
      expect(processEscapes('test\\b')).toBe('test\\b');
      expect(processEscapes('test\\c')).toBe('test\\c');
      expect(processEscapes('test\\1')).toBe('test\\1');
    });

    it('should handle backslash at end of string', () => {
      // 'test\\' in JS = test\ in actual
      // processEscapes: last char is \, next char doesn't exist, so just push \
      expect(processEscapes('test\\')).toBe('test\\');
    });

    it('should handle multiple unknown escapes', () => {
      expect(processEscapes('\\a\\b\\c')).toBe('\\a\\b\\c');
    });
  });

  describe('unquoteValue - edge cases', () => {
    it('should not unquote partial quotes', () => {
      expect(unquoteValue('"value')).toBe('"value');
      expect(unquoteValue('value"')).toBe('value"');
      expect(unquoteValue("'value")).toBe("'value");
      expect(unquoteValue("value'")).toBe("value'");
    });

    it('should handle empty quotes', () => {
      expect(unquoteValue('""')).toBe('');
      expect(unquoteValue("''")).toBe('');
    });
  });

  describe('isEscaped - edge cases', () => {
    it('should detect escaped characters correctly', () => {
      // 'test\\"' in JS = test\" in actual string
      // At index 5: character is ", backslash at index 4 escapes it -> true
      expect(isEscaped('test\\"', 5)).toBe(true);

      // 'test\\\\' in JS = test\\ in actual string
      // At index 5: character is \, backslash at index 4 escapes it -> true
      expect(isEscaped('test\\\\', 5)).toBe(true);

      // 'test\\n' in JS = test\n in actual string
      // At index 5: character is n, backslash at index 4 escapes it -> true
      expect(isEscaped('test\\n', 5)).toBe(true);
    });

    it('should detect non-escaped characters', () => {
      // 'test"' in JS = test" in actual string
      // At index 4: character is ", no backslash before -> false
      expect(isEscaped('test"', 4)).toBe(false);
    });

    it('should handle multiple backslashes', () => {
      // 'test\\\\\\"' in JS = test\\\" in actual string
      // String: t e s t \ \ \ "
      // Indices: 0 1 2 3 4 5 6 7
      // At index 7: character is ", count backslashes at 6,5,4 = 3 (odd) -> escaped = true
      expect(isEscaped('test\\\\\\"', 7)).toBe(true);

      // 'test\\\\\\\\\\"' in JS = test\\\\\" in actual string
      // At index 8: character is ", count backslashes at 7,6,5,4 = 4 (even) -> escaped = false
      expect(isEscaped('test\\\\\\\\\\"', 8)).toBe(false);
    });
  });

  describe('startsWithOperator - edge cases', () => {
    it('should not detect operator inside quotes', () => {
      expect(startsWithOperator('"KEY?=value"', '?=')).toBe(false);
      expect(startsWithOperator("'KEY+=value'", '+=')).toBe(false);
    });

    it('should detect operator outside quotes', () => {
      expect(startsWithOperator('KEY?=value', '?=')).toBe(true);
      expect(startsWithOperator('KEY+=value', '+=')).toBe(true);
    });
  });

  describe('parseEnvFile - edge cases for coverage', () => {
    it('should handle lines with only comments after trimming', () => {
      const result = parseEnvFile('  # only comment  ');
      expect(result.vars).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle empty key after operator parsing', () => {
      const result = parseEnvFile('?=value');
      // This produces key "?" which is invalid since it doesn't match ^[A-Za-z_]
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Invalid key');
    });

    it('should handle value with only quotes', () => {
      const result = parseEnvFile('KEY=""');
      expect(result.vars).toHaveLength(1);
      expect(result.vars[0].value).toBe('');
    });

    it('should handle value with only single quotes', () => {
      const result = parseEnvFile("KEY=''");
      expect(result.vars).toHaveLength(1);
      expect(result.vars[0].value).toBe('');
    });

    it('should handle multiline with escaped backslash at end', () => {
      // In .env content: KEY=value\\ (line ends with escaped backslash)
      // In JS string: 'KEY=value\\\\' produces KEY=value\\ in actual
      // Parser: line ends with \, check if escaped: yes (odd number of \ before)
      // So NOT treated as multiline
      const result = parseEnvFile('KEY=value\\\\');
      expect(result.vars).toHaveLength(1);
      // processEscapes converts \\ to \, so value becomes value\
      expect(result.vars[0].value).toBe('value\\');
    });

    it('should handle inline comment with special characters', () => {
      const result = parseEnvFile('KEY=value # comment with = and ?= and += signs');
      expect(result.vars).toHaveLength(1);
      expect(result.vars[0].value).toBe('value');
    });

    it('should handle value with # inside quotes', () => {
      const result = parseEnvFile('KEY="value # not a comment"');
      expect(result.vars).toHaveLength(1);
      expect(result.vars[0].value).toBe('value # not a comment');
    });

    it('should handle value with # inside single quotes', () => {
      const result = parseEnvFile("KEY='value # not a comment'");
      expect(result.vars).toHaveLength(1);
      expect(result.vars[0].value).toBe("value # not a comment");
    });

    it('should report error for missing =', () => {
      const result = parseEnvFile('KEY_WITHOUT_EQUALS');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Missing "="');
    });

    it('should handle key with trailing spaces before =', () => {
      const result = parseEnvFile('KEY   =value');
      expect(result.vars).toHaveLength(1);
      expect(result.vars[0].key).toBe('KEY');
    });

    it('should handle value with leading spaces after =', () => {
      const result = parseEnvFile('KEY=  value');
      expect(result.vars).toHaveLength(1);
      expect(result.vars[0].value).toBe('value');
    });

    it('should skip lines that become empty after comment removal', () => {
      const result = parseEnvFile('   #');
      expect(result.vars).toHaveLength(0);
    });
  });

  describe('parseEnvFile - Windows paths in values', () => {
    it('should handle Windows paths with backslashes', () => {
      // To get C:\Users\test\bin in .env content, need double backslashes in JS
      const result = parseEnvFile('PATH=C:\\\\Users\\\\test\\\\bin');
      expect(result.vars).toHaveLength(1);
      expect(result.vars[0].value).toBe('C:\\Users\\test\\bin');
    });

    it('should handle Windows paths with forward slashes', () => {
      const result = parseEnvFile('PATH=C:/Users/test/bin');
      expect(result.vars).toHaveLength(1);
      expect(result.vars[0].value).toBe('C:/Users/test/bin');
    });
  });

  describe('parseEnvFile - complex escape sequences', () => {
    it('should handle multiple escape sequences in one value', () => {
      const result = parseEnvFile('KEY="line1\\nline2\\tcol1\\tcol2\\\\backslash"');
      expect(result.vars).toHaveLength(1);
      expect(result.vars[0].value).toBe('line1\nline2\tcol1\tcol2\\backslash');
    });

    it('should handle escaped quotes inside quoted value', () => {
      const result = parseEnvFile('KEY="say \\"hello\\""');
      expect(result.vars).toHaveLength(1);
      expect(result.vars[0].value).toBe('say "hello"');
    });

    it('should handle escaped single quotes inside single quoted value', () => {
      const result = parseEnvFile("KEY='say \\'hello\\''");
      expect(result.vars).toHaveLength(1);
      expect(result.vars[0].value).toBe("say 'hello'");
    });
  });
});
