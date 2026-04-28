/**
 * EnvParser - parses .env file content
 */

import type { ParsedVar, ParseResult, ParseOperation } from "./types";

export function isEscaped(str: string, index: number): boolean {
  let backslashes = 0;
  let i = index - 1;
  while (i >= 0 && str[i] === "\\") {
    backslashes++;
    i--;
  }
  return backslashes % 2 === 1;
}

/**
 * Check if a line starts with a specific operator (e.g., "?=", "+=") outside of quotes.
 * Respects escape sequences and string literals.
 */
export function startsWithOperator(line: string, operator: string): boolean {
  let inDoubleQuote = false;
  let inSingleQuote = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"' && !inSingleQuote && !isEscaped(line, i)) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (char === "'" && !inDoubleQuote && !isEscaped(line, i)) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (!inDoubleQuote && !inSingleQuote) {
      if (line.slice(i).startsWith(operator)) {
        const before = line.slice(0, i);
        const after = line.slice(i + operator.length);

        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(before) && after.length > 0) {
          return true;
        }
      }
    }
  }

  return false;
}

export function unquoteValue(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}

export function processEscapes(value: string): string {
  const result: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === "\\" && i + 1 < value.length) {
      const next = value[i + 1];
      switch (next) {
        case "n": result.push("\n"); i++; break;
        case "t": result.push("\t"); i++; break;
        case "r": result.push("\r"); i++; break;
        case '"': result.push('"'); i++; break;
        case "'": result.push("'"); i++; break;
        case "\\": result.push("\\"); i++; break;
        default: result.push(char); break;
      }
    } else {
      result.push(char);
    }
  }
  return result.join("");
}

export class EnvParser {
  parse(content: string): ParseResult {
    const vars: ParsedVar[] = [];
    const errors: string[] = [];
    // Handle multiline values (backslash at end of line, properly escaped)
    // Only join lines if backslash is the last character AND not escaped
    const lines: string[] = [];
    const rawLines = content.split(/\r?\n/);
    let currentLine = '';

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      // Check if line ends with backslash and backslash is not escaped
      if (line.endsWith('\\') && !isEscaped(line, line.length - 1)) {
        currentLine += line.slice(0, -1); // Remove trailing backslash
      } else {
        currentLine += line;
        lines.push(currentLine);
        currentLine = '';
      }
    }
    // Push any remaining content
    if (currentLine) {
      lines.push(currentLine);
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      let workingLine = trimmed;

      // Find the position of # outside quotes
      let commentIndex = -1;
      let inDoubleQuote = false;
      let inSingleQuote = false;

      for (let j = 0; j < workingLine.length; j++) {
        const char = workingLine[j];
        if (char === '"' && !inSingleQuote && !isEscaped(workingLine, j)) {
          inDoubleQuote = !inDoubleQuote;
        } else if (char === "'" && !inDoubleQuote && !isEscaped(workingLine, j)) {
          inSingleQuote = !inSingleQuote;
        } else if (char === "#" && !inDoubleQuote && !inSingleQuote) {
          commentIndex = j;
          break;
        }
      }

      if (commentIndex !== -1) {
        workingLine = workingLine.slice(0, commentIndex).trimEnd();
      }

      if (!workingLine) {
        continue;
      }

      let key: string;
      let value: string;
      let operation: ParseOperation = "set";
      let processed = workingLine;

      if (processed.startsWith("export ")) {
        processed = processed.slice(7);
      }

      if (startsWithOperator(processed, "?=")) {
        operation = "default";
        const idx = processed.indexOf("?=");
        key = processed.slice(0, idx).trim();
        value = processed.slice(idx + 2).trim();
      } else if (startsWithOperator(processed, "+=")) {
        operation = "append";
        const idx = processed.indexOf("+=");
        key = processed.slice(0, idx).trim();
        value = processed.slice(idx + 2).trim();
      } else if (startsWithOperator(processed, "-=")) {
        operation = "prepend";
        const idx = processed.indexOf("-=");
        key = processed.slice(0, idx).trim();
        value = processed.slice(idx + 2).trim();
      } else {
        const equalIndex = processed.indexOf("=");
        if (equalIndex === -1) {
          errors.push(`Line ${i + 1}: Missing "=" in "${trimmed.slice(0, 50)}"`);
          continue;
        }
        key = processed.slice(0, equalIndex).trim();
        value = processed.slice(equalIndex + 1).trim();
        operation = "set";
      }

      // Операторы уже удалены при парсинге (slice(idx + 2)),
      // ключ уже обрезан выше — дополнительная очистка не требуется
      if (!key) {
        errors.push(`Line ${i + 1}: Empty key`);
        continue;
      }

      // Only allow ASCII letters, digits, and underscores in env var names
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        errors.push(`Line ${i + 1}: Invalid key "${key}"`);
        continue;
      }

      const processedValue = unquoteValue(value);
      const finalValue = processEscapes(processedValue);

      vars.push({ key, value: finalValue, operation });
    }

    return { vars, errors };
  }
}
