/**
 * Env Loader Extension for pi
 *
 * Loads environment variables from .env files.
 * Entry point: registers the extension and re-exports public API.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { COMMANDS, COMMANDS_NO_ENV, MAX_DISPLAY_ERRORS, isSecretKeyPattern, PROTECTED_VARS } from "./constants.js";
import { EnvParser } from "./parser.js";
import { EnvCollector } from "./collector.js";
import { EnvInterpolator } from "./interpolator.js";
import { VERSION } from "./version.js";
import { isEscaped, startsWithOperator, unquoteValue, processEscapes } from "./parser.js";
import type { EnvProvider, ParseResult, ParsedVar, EnvChangesResult, InterpolationWarning, ParseOperation } from "./types.js";
import { ProcessEnvProvider } from "./types.js";
import { isPathLike } from "./path-utils.js";
import { EnvCommandHandler } from "./env-command-handler.js";

// Module-level stateless instances (reused to avoid unnecessary allocations)
const parserInstance = new EnvParser();
const interpolatorInstance = new EnvInterpolator();

// === Re-export types ===
export type { EnvProvider, ParseResult, ParsedVar, EnvChangesResult, InterpolationWarning, ParseOperation };
export { ProcessEnvProvider, VERSION };
export { isPathLike };
export { MAX_INTERPOLATION_DEPTH, DEFAULT_SEPARATOR } from "./constants.js";

// === Public API functions ===

export function isSecretKey(key: string): boolean {
  return isSecretKeyPattern(key);
}

export function isProtectedKey(key: string): boolean {
  return PROTECTED_VARS.has(key.toUpperCase());
}

export function maskValue(value: string, showChars?: number): string {
  const collector = new EnvCollector();
  return collector.maskValue(value, showChars);
}

export function trimValue(value: string): string {
  return value.trim();
}

export function parseEnvFile(content: string): ParseResult {
  return parserInstance.parse(content);
}

export function interpolateValue(
  value: string,
  maxDepth?: number,
  warnings?: InterpolationWarning[],
  env?: Record<string, string | undefined>
): string {
  return interpolatorInstance.interpolate(value, maxDepth, warnings, env);
}

export function collectEnvChanges(
  vars: { key: string; value: string; operation?: ParseOperation }[],
  env?: Record<string, string | undefined>,
  forceOverwrite: boolean = false
): EnvChangesResult {
  const collector = new EnvCollector();
  return collector.collect(vars, env, forceOverwrite);
}

export function applyEnvChanges(
  changes: EnvChangesResult,
  envProvider?: EnvProvider
): void {
  const collector = new EnvCollector(envProvider);
  return collector.apply(changes);
}

// === Re-export parser utilities ===
export { isEscaped, startsWithOperator, unquoteValue, processEscapes };

export default function envLoaderExtension(pi: ExtensionAPI) {
  // Create a new provider per extension instance to avoid global state pollution
  const envProvider = new ProcessEnvProvider();
  const collector = new EnvCollector(envProvider);
  const parser = new EnvParser();
  const commandHandler = new EnvCommandHandler(parser, collector, envProvider);

  pi.registerCommand("env", {
    description: "Load environment variables from .env file",
    getArgumentCompletions: (prefix) => {
      if (!prefix || prefix.startsWith("/")) {
        const filtered = COMMANDS.filter((o) => o.startsWith(prefix?.replace(/^\//, "") || ""));
        return filtered.length > 0 ? filtered.map((o) => ({ value: o, label: o })) : null;
      }

      // Strip quotes from prefix for path handling
      let cleanPrefix = prefix.replace(/^["']|["']$/g, "");
      
      // Get platform-appropriate path separator
      const isWindows = globalThis.process?.platform === "win32";
      const pathSep = isWindows ? "\\" : "/";

      // Check if it looks like a path (use cleaned prefix without quotes)
      if (isPathLike(cleanPrefix)) {
        try {
          const cwd = process.cwd();
          // Normalize path separators based on platform
          const normalizedPrefix = isWindows 
            ? cleanPrefix.replace(/\//g, "\\") 
            : cleanPrefix.replace(/\\/g, "/");
          
          const dir = path.dirname(normalizedPrefix || ".");
          const resolvedDir = path.isAbsolute(dir) ? dir : path.join(cwd, dir);
          const baseName = path.basename(normalizedPrefix || "");

          if (fs.existsSync(resolvedDir) && fs.statSync(resolvedDir).isDirectory()) {
            const entries = fs.readdirSync(resolvedDir);
            const filtered = entries.filter(e => e.startsWith(baseName) || !baseName);
            return filtered.slice(0, 10).map(e => {
              const fullPath = path.join(resolvedDir, e);
              const isDir = fs.statSync(fullPath).isDirectory();
              const fullPathWithSep = path.join(dir, e) + (isDir ? pathSep : "");
              
              // Determine if the entire path needs quoting because it contains spaces or special chars
              const entirePathNeedsQuotes = fullPathWithSep.includes(" ") || 
                                           fullPathWithSep.includes("(") || 
                                           fullPathWithSep.includes(")");
              
              // Check if user already typed an opening quote at the beginning of prefix
              const prefixHasQuote = (prefix.startsWith('"') && !prefix.endsWith('"')) ||
                                    (prefix.startsWith("'") && !prefix.endsWith("'"));
              
              // Build the resulting path, making sure to preserve any existing opening quote
              let resultPath = fullPathWithSep;
              if (entirePathNeedsQuotes) {
                resultPath = `"${fullPathWithSep}`;
              }
              if (prefixHasQuote) {
                const openingQuote = prefix[0]; // either " or '
                if (!resultPath.startsWith(openingQuote)) {
                  resultPath = openingQuote + resultPath;
                }
              }
              const quotedPath = resultPath;
              
              return {
                value: quotedPath,
                label: e + (isDir ? pathSep : "")
              };
            });
          }
        } catch {
          // Ignore errors
        }
      }

      return null;
    },
    handler: async (args, ctx) => {
      await commandHandler.execute(args, ctx);
    },
  });
}

