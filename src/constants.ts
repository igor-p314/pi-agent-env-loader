/**
 * Constants for env-loader
 */

// === Display constants ===
/** Maximum number of errors to display */
export const MAX_DISPLAY_ERRORS = 3;
/** Maximum number of keys to display */
export const MAX_DISPLAY_KEYS = 5;
/** Maximum length of interpolated value to prevent abuse */
export const MAX_INTERPOLATED_LENGTH = 4096;

const _PROTECTED_VARS = new Set([
  "PATH",
  "PATHEXT",
  "HOME",
  "USER",
  "USERNAME",
  "SHELL",
  "TERM",
  "PWD",
  "LD_LIBRARY_PATH",
  "DYLD_LIBRARY_PATH",
  "SYSTEMROOT",
  "WINDIR",
  "TEMP",
  "TMP",
  "OS",
  "PROCESSOR_ARCHITECTURE",
  "COMPUTERNAME",
] as const);

export type ProtectedVar = typeof _PROTECTED_VARS extends Set<infer T> ? T : never;

export const PROTECTED_VARS: ReadonlySet<string> = _PROTECTED_VARS;

// === Config constants ===

/** Maximum depth for variable interpolation to prevent infinite loops */
export const MAX_INTERPOLATION_DEPTH = 10;

/** Default separator for append/prepend operations (platform-aware) */
export const DEFAULT_SEPARATOR = 
  typeof globalThis !== 'undefined' && globalThis.process?.platform === 'win32' ? ';' : ':';


// === Secret key patterns ===

const _SECRET_KEY_PATTERNS = [
  // Patterns for end of variable name
  /_KEY$/i,
  /_SECRET$/i,        // MY_SECRET — да, MY_SECRET_VALUE — нет
  /_PASSWORD$/i,
  /_TOKEN$/i,
  /_AUTH$/i,
  /_PRIVATE$/i,
  
  // Patterns for start of variable name
  /^API_KEY$/i,
  /^PASSWORD$/i,
  /^TOKEN$/i,
  /^SECRET$/i,
];

/** Compiled regex patterns for secret key matching */
export const SECRET_KEY_PATTERNS = Object.freeze(_SECRET_KEY_PATTERNS);

/**
 * Check if a key matches any secret pattern
 * Uses pre-compiled patterns for better performance
 */
export function isSecretKeyPattern(key: string): boolean {
  return _SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

// === Commands ===

export const COMMANDS = ["list", "get", "set", "help"] as const;
export const COMMANDS_NO_ENV = new Set(["help", "set"]);

// === Path constants ===
/** Regex to detect Windows drive paths like C:\ or D:/ (supports Unicode paths) */
export const WINDOWS_DRIVE_REGEX = /^[A-Za-z]:/;
/** Regex to detect path-like strings (contain slashes or backslashes) */
export const PATH_LIKE_REGEX = /[\/\\]/;
/** Regex for valid file extensions (including Unicode characters in paths) */
export const FILE_EXTENSION_REGEX = /\.[\p{L}\p{N}_.\u0400-\u04FF]+$/u;
/** Regex for valid env variable keys (ASCII letters only) */
export const ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;