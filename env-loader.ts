/**
 * Env Loader Extension
 *
 * Loads environment variables from .env file in the project root.
 *
 * Usage:
 * 1. Place this file in .pi/extensions/ or ~/.pi/agent/extensions/
 * 2. Use /env to load variables from .env file
 * 3. Use /env reload to reload variables from .env file
 * 4. Use /env list to list all variables in .env file
 * 5. Use /env get KEY to get a specific variable
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Protected environment variables that should not be overwritten
 */
const PROTECTED_VARS = new Set([
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

/**
 * Keys that should be masked in output
 */
const SECRET_KEY_PATTERNS: RegExp[] = [
  /_KEY$/i,
  /_SECRET(S|_)?$/i,   // _SECRET or _SECRETS
  /_PASSWORD$/i,
  /_TOKEN$/i,
  /_AUTH$/i,
  /_CREDENTIALS?$/i,
  /_PRIVATE$/i,
  /API_KEY/i,
  /^PASSWORD$/i,
  /^TOKEN$/i,
  /^SECRET$/i,
];

/**
 * Parse operation type for extended syntax
 */
export type ParseOperation = "set" | "append" | "prepend" | "default";

/**
 * Parsed env variable
 */
export interface ParsedVar {
  key: string;
  value: string;
  operation: ParseOperation;
}

/**
 * Result of parsing .env file
 */
export interface ParseResult {
  vars: ParsedVar[];
  errors: string[];
}

/**
 * Check if a key should be masked
 */
export function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Mask a secret value
 */
export function maskValue(value: string, showChars: number = 2): string {
  if (value.length <= showChars) {
    return "*".repeat(value.length);
  }
  const visible = value.slice(0, showChars);
  return visible + "*".repeat(Math.max(value.length - showChars, 3));
}

/**
 * Protected environment variables that should not be overwritten
 */
export function isProtectedKey(key: string): boolean {
  return PROTECTED_VARS.has(key.toUpperCase());
}

/**
 * Check if line starts with a specific operator (as whole word)
 */
export function startsWithOperator(line: string, operator: string): boolean {
  const trimmed = line.trimStart();
  // Examples: KEY?=value, KEY+=value, KEY-=value
  // The operator appears between key and value (no extra = needed)
  const idx = trimmed.indexOf(operator);
  if (idx === -1) return false;
  // Check it's at position of the key's last char
  const before = trimmed.slice(0, idx);
  const after = trimmed.slice(idx + operator.length);
  // Valid if there's a valid key before and non-empty value after
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(before) && after.length > 0;
}

/**
 * Check if a character is escaped
 */
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
 * Parse escape sequences in a string (handles \n, \t, \r, \", \', \\)
 * Used by unquoteValue for double-quoted strings
 */
function parseEscapes(str: string): string {
  const result: string[] = [];
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === "\\" && i + 1 < str.length) {
      const next = str[i + 1];
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

/**
 * Remove outer quotes only (no escape processing)
 * Escape sequences are processed separately by processEscapes
 */
export function unquoteValue(value: string): string {
  // Handle double quotes
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  
  // Handle single quotes (no escape processing)
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  
  return value;
}

/**
 * Process escape sequences in unquoted value
 */
export function processEscapes(value: string): string {
  return parseEscapes(value);
}

/**
 * Parse .env file content and return as array of parsed variables
 * Supports:
 * - Multiline values (backslash at end)
 * - Variable interpolation ${VAR} or $VAR
 * - Escape sequences \n, \t, \", \', \\
 * - Extended syntax: export, -=, ?=, +=
 * - Proper operator detection (not matching in value)
 */
export function parseEnvFile(content: string): ParseResult {
  const vars: ParsedVar[] = [];
  const errors: string[] = [];
  
  // Handle multiline: join lines ending with \
  const normalized = content.replace(/\\\r?\n/g, "");
  
  const lines = normalized.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    // Trim whitespace
    const line = lines[i];
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    
    // Check for inline comments (# not inside quotes)
    let workingLine = trimmed;
    let inDoubleQuote = false;
    let inSingleQuote = false;
    
    for (let j = 0; j < workingLine.length; j++) {
      const char = workingLine[j];
      if (char === '"' && !inSingleQuote && !isEscaped(workingLine, j)) {
        inDoubleQuote = !inDoubleQuote;
      } else if (char === "'" && !inDoubleQuote && !isEscaped(workingLine, j)) {
        inSingleQuote = !inSingleQuote;
      } else if (char === "#" && !inDoubleQuote && !inSingleQuote) {
        workingLine = workingLine.slice(0, j).trimEnd();
        break;
      }
    }
    
    // Skip if line became empty after comment removal
    if (!workingLine) {
      continue;
    }
    
    // Handle extended syntax
    let key: string;
    let value: string;
    let operation: ParseOperation = "set";
    
    // Check for export prefix
    let processed = workingLine;
    if (processed.startsWith("export ")) {
      processed = processed.slice(7);
    }
    
    // Check for special operators in order (check at start of line)
    // Try each operator and extract valid key
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
      // Standard key=value
      const equalIndex = processed.indexOf("=");
      if (equalIndex === -1) {
        errors.push(`Line ${i + 1}: Missing "=" in "${trimmed.slice(0, 50)}"`);
        continue;
      }
      key = processed.slice(0, equalIndex).trim();
      value = processed.slice(equalIndex + 1).trim();
    }
    
    // For extended syntax, validate key WITHOUT the operator char
    const keyForValidation = operation !== "set" ? key.replace(/[?+= -]$/, "") : key;
    
    // Validate key format
    if (!key) {
      errors.push(`Line ${i + 1}: Empty key`);
      continue;
    }
    
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyForValidation)) {
      errors.push(`Line ${i + 1}: Invalid key "${keyForValidation}"`);
      continue;
    }
    
    // Use the cleaned key (without operator char) for valid keys
    if (key !== keyForValidation) {
      key = keyForValidation;
    }
    
    // Remove quotes and process escapes (single pass)
    const processedValue = unquoteValue(value);
    const finalValue = processEscapes(processedValue);
    
    vars.push({
      key,
      value: finalValue,
      operation,
    });
  }
  
  return { vars, errors };
}

/**
 * Warning collected during interpolation
 */
export interface InterpolationWarning {
  varName: string;
  originalValue: string;
}

/**
 * Interpolate variables in a value with cycle detection
 * Supports ${VAR} and $VAR syntax
 * @param value - String with variables to interpolate
 * @param maxDepth - Maximum nesting depth (default 10)
 * @param warnings - Optional array to collect unknown variable warnings
 * @param env - Optional environment object for dependency injection (defaults to process.env)
 */
export function interpolateValue(
  value: string,
  maxDepth: number = 10,
  warnings?: InterpolationWarning[],
  env: Record<string, string | undefined> = process.env
): string {
  let result = value;
  let prev = "";
  let depth = 0;
  // Track seen variables to prevent infinite loops
  const seenVars = new Set<string>();
  
  while (result !== prev && depth < maxDepth) {
    prev = result;
    result = result.replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
      (_, brace, plain) => {
        const varName = brace || plain;
        // Skip already seen variables to prevent cycles
        if (seenVars.has(varName)) {
          return "";
        }
        seenVars.add(varName);
        const envValue = env[varName];
        // Warn if variable is not defined
        if (envValue === undefined) {
          if (warnings) {
            warnings.push({ varName, originalValue: value });
          }
          return "";
        }
        return envValue;
      }
    );
    depth++;
  }
  
  if (depth >= maxDepth) {
    console.warn(`Possible interpolation cycle detected in value: ${value}`);
  }
  
  return result;
}

/**
 * Result of collecting environment changes
 */
export interface EnvChangesResult {
  /** Variables to be set (key -> value) */
  toSet: Map<string, string>;
  /** Variables that will be skipped and why */
  skipped: { key: string; reason: "protected" | "exists" }[];
  /** Warnings for unknown interpolation variables */
  warnings: InterpolationWarning[];
}

/**
 * Collect environment changes from parsed variables
 * Does not mutate process.env - returns data for batch application
 * @param vars - Parsed variables from .env file
 * @param env - Optional environment object for dependency injection (defaults to process.env)
 */
export function collectEnvChanges(
  vars: ParsedVar[],
  env: Record<string, string | undefined> = process.env
): EnvChangesResult {
  const result: EnvChangesResult = {
    toSet: new Map(),
    skipped: [],
    warnings: [],
  };

  for (const { key, value, operation } of vars) {
    if (isProtectedKey(key)) {
      result.skipped.push({ key, reason: "protected" });
      continue;
    }

    if (operation === "default") {
      if (env[key] !== undefined) {
        result.skipped.push({ key, reason: "exists" });
        continue;
      }
      const interpolated = interpolateValue(value, 10, result.warnings, env);
      const converted = trimValue(interpolated);
      result.toSet.set(key, converted);
    } else if (operation === "append") {
      const existing = env[key] || "";
      const interpolated = interpolateValue(value, 10, result.warnings, env);
      const converted = trimValue(interpolated);
      result.toSet.set(key, existing ? `${existing}:${converted}` : converted);
    } else if (operation === "prepend") {
      const existing = env[key] || "";
      const interpolated = interpolateValue(value, 10, result.warnings, env);
      const converted = trimValue(interpolated);
      result.toSet.set(key, existing ? `${converted}:${existing}` : converted);
    } else {
      // Standard set
      if (env[key] !== undefined) {
        result.skipped.push({ key, reason: "exists" });
        continue;
      }
      const interpolated = interpolateValue(value, 10, result.warnings, env);
      const converted = trimValue(interpolated);
      result.toSet.set(key, converted);
    }
  }

  return result;
}

/**
 * Apply collected environment changes to process.env
 */
export function applyEnvChanges(changes: EnvChangesResult): void {
  for (const [key, value] of changes.toSet) {
    process.env[key] = value;
  }
}

/**
 * Trim whitespace from environment variable value
 * Does not convert types - values are stored as-is
 */
export function trimValue(value: string): string {
  return value.trim();
}

export default function envLoaderExtension(pi: ExtensionAPI) {
  pi.registerCommand("env", {
    description: "Load environment variables from .env file",
    getArgumentCompletions: (prefix) => {
      const options = ["reload", "list", "get", "set", "from", "help"];
      const filtered = options.filter((o) => o.startsWith(prefix));
      return filtered.length > 0 ? filtered.map((o) => ({ value: o, label: o })) : null;
    },
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      const action = parts[0]?.toLowerCase() || "";
      const param = parts[1];
      const cwd = ctx.cwd;
      const envPath = path.join(cwd, ".env");
      
      // Check if .env file exists
      if (!fs.existsSync(envPath)) {
        ctx.ui.notify("No .env file found in project root", "warning");
        return;
      }
      
      // Read .env file with error handling
      let content: string;
      try {
        content = fs.readFileSync(envPath, "utf-8");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        ctx.ui.notify(`Failed to read .env file: ${message}`, "error");
        return;
      }
      
      const { vars, errors } = parseEnvFile(content);
      
      // Show parsing errors if any
      if (errors.length > 0) {
        const limitedErrors = errors.slice(0, 3);
        ctx.ui.notify(`Parse warnings: ${limitedErrors.join("; ")}${errors.length > 3 ? ` (+${errors.length - 3} more)` : ""}`, "warning");
      }
      
      if (vars.length === 0) {
        ctx.ui.notify(".env file is empty or invalid", "info");
        return;
      }
      
      // Help mode: show usage information
      if (action === "help") {
        ctx.ui.notify("Env Loader - .env file loader", "info");
        ctx.ui.notify([
          "Usage:",
          "  /env           Load variables from .env",
          "  /env reload    Reload all variables (overwrites existing)",
          "  /env list      List all variables in .env",
          "  /env get KEY   Get a specific variable",
          "  /env set KEY VALUE  Set a variable directly",
          "  /env from PATH   Load from custom file path",
          "  /env help     Show this help",
          "",
          "Extended Syntax in .env:",
          "  export KEY=value    Set variable",
          "  KEY?=value         Set only if not exists (default)",
          "  KEY+=value         Append to existing (colon-separated)",
          "  KEY-=value         Prepend to existing",
          "",
          "Features:",
          "  - Variable interpolation: ${VAR} or $VAR",
          "  - Escape sequences: \\n, \\t, \\r, \\\", \\'",
          "  - Multiline values (backslash at end of line)",
          "  - Inline comments (stripped outside quotes)",
          "  - Protected vars (PATH, HOME, etc.) skipped",
          "  - Secret masking (* for KEY, SECRET, TOKEN, PASSWORD)",
        ].join("\n"), "info");
        return;
      }
      
      // List mode: show all variables
      if (action === "list") {
        const varList: string[] = [];
        for (const { key, value } of vars) {
          let displayValue = value;
          if (isSecretKey(key)) {
            displayValue = maskValue(value);
          } else if (displayValue.length > 50) {
            displayValue = displayValue.slice(0, 47) + "...";
          }
          varList.push(`${key}=${displayValue}`);
        }
        ctx.ui.notify(`Found ${vars.length} variable(s) in .env`, "info");
        ctx.ui.notify(varList.join("\n"), "info");
        return;
      }
      
      // Get mode: show specific variable
      if (action === "get") {
        if (!param) {
          ctx.ui.notify("Usage: /env get KEY", "warning");
          return;
        }
        const found = vars.find((v) => v.key === param);
        if (!found) {
          ctx.ui.notify(`Variable '${param}' not found in .env`, "warning");
          return;
        }
        const value = isSecretKey(param) ? maskValue(found.value) : found.value;
        ctx.ui.notify(`${param}=${value}`, "success");
        return;
      }
      
      // From mode: load from custom path
      if (action === "from") {
        const customPath = param;
        if (!customPath) {
          ctx.ui.notify("Usage: /env from PATH", "warning");
          return;
        }
        const resolvedPath = path.isAbsolute(customPath) ? customPath : path.join(cwd, customPath);
        if (!fs.existsSync(resolvedPath)) {
          ctx.ui.notify(`File not found: ${resolvedPath}`, "error");
          return;
        }
        let customContent: string;
        try {
          customContent = fs.readFileSync(resolvedPath, "utf-8");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          ctx.ui.notify(`Failed to read file: ${message}`, "error");
          return;
        }
        const { vars: customVars, errors: customErrors } = parseEnvFile(customContent);
        if (customErrors.length > 0) {
          ctx.ui.notify(`Parse warnings: ${customErrors.slice(0, 3).join("; ")}`, "warning");
        }
        if (customVars.length === 0) {
          ctx.ui.notify("File is empty or invalid", "info");
          return;
        }
        const { toSet, skipped, warnings } = collectEnvChanges(customVars);
        applyEnvChanges({ toSet, skipped, warnings });
        const loaded = toSet.size;
        const protectedCount = skipped.filter(s => s.reason === "protected").length;
        const existsCount = skipped.filter(s => s.reason === "exists").length;
        const partsList: string[] = [`Loaded ${loaded} variable(s) from ${resolvedPath}`];
        if (existsCount > 0) partsList.push(`(${existsCount} already set)`);
        if (protectedCount > 0) partsList.push(`(${protectedCount} protected)`);
        ctx.ui.notify(partsList.join(" "), "success");
        return;
      }
      
      // Set mode: set a variable directly (KEY VALUE)
      if (action === "set") {
        const setKey = param;
        const setValue = parts.slice(2).join(" ");
        
        if (!setKey) {
          ctx.ui.notify("Usage: /env set KEY VALUE", "warning");
          return;
        }
        
        // Validate key format
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(setKey)) {
          ctx.ui.notify(`Invalid key format: ${setKey}`, "error");
          return;
        }
        
        // Check protected variables
        if (isProtectedKey(setKey)) {
          ctx.ui.notify(`Protected variable '${setKey}' cannot be modified`, "error");
          return;
        }
        
        // Convert and set value
        const converted = trimValue(setValue);
        process.env[setKey] = converted;
        ctx.ui.notify(`Set ${setKey}=${isSecretKey(setKey) ? maskValue(setValue) : setValue}`, "success");
        return;
      }
      
      // Reload mode: reload all variables
      if (action === "reload") {
        const { toSet, skipped, warnings } = collectEnvChanges(vars);
        applyEnvChanges({ toSet, skipped, warnings });
        const loaded = toSet.size;
        const protectedCount = skipped.filter(s => s.reason === "protected").length;
        ctx.ui.notify(`Reloaded ${loaded} environment variable(s)${protectedCount > 0 ? ` (${protectedCount} protected skipped)` : ""}`, "success");
        return;
      }
      
      // Load mode: load new variables (transactional)
      const { toSet, skipped, warnings } = collectEnvChanges(vars);
      
      // Apply all changes at once
      applyEnvChanges({ toSet, skipped, warnings });
      
      const loaded = toSet.size;
      const protectedCount = skipped.filter(s => s.reason === "protected").length;
      const existsCount = skipped.filter(s => s.reason === "exists").length;
      
      // Show notification with results
      if (loaded > 0) {
        const partsList: string[] = [`Loaded ${loaded} new environment variable(s)`];
        if (existsCount > 0) partsList.push(`(${existsCount} already set)`);
        if (protectedCount > 0) partsList.push(`(${protectedCount} protected)`);
        ctx.ui.notify(partsList.join(" "), "success");
        
        // List loaded variables (first 5)
        const loadedKeys = Array.from(toSet.keys()).slice(0, 5);
        const keyList = loadedKeys.join(", ");
        const more = toSet.size > 5 ? `, +${toSet.size - 5} more` : "";
        ctx.ui.notify(`Variables: ${keyList}${more}`, "info");
      } else {
        const partsList: string[] = [];
        if (existsCount > 0) partsList.push(`${existsCount} already set`);
        if (protectedCount > 0) partsList.push(`${protectedCount} protected`);
        ctx.ui.notify(partsList.length > 0 ? `All variable(s) ${partsList.join(", ")}` : "All variables already set", "info");
      }
    },
  });
}