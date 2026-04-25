/**
 * Argument parsing utilities for the /env command.
 */

/**
 * Strip quotes from a string (both single and double).
 * Only removes quotes if they are properly balanced (both opening and closing).
 * @param str - String that may have quotes
 * @returns String without surrounding quotes
 */
export function stripQuotes(str: string): string {
  if (str.length >= 2) {
    // Only remove quotes if both opening and closing quotes are present
    if ((str.startsWith('"') && str.endsWith('"')) ||
        (str.startsWith("'") && str.endsWith("'"))) {
      return str.slice(1, -1);
    }
  }
  return str;
}

/**
 * Parse command arguments, handling quoted paths.
 * @param args - Raw command arguments string
 * @returns Array of parts with quotes stripped
 */
export function parseArgs(args: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let i = 0;

  while (i < args.length) {
    const char = args[i];

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      i++;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      i++;
      continue;
    }

    if (char === " " && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        parts.push(current);
        current = "";
      }
      i++;
      continue;
    }

    current += char;
    i++;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}
