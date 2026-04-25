/**
 * Env Loader Extension for pi
 *
 * Loads environment variables from .env files.
 * Entry point: registers the extension and re-exports public API.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isSecretKeyPattern, PROTECTED_VARS } from "./constants.js";
import { EnvCollector } from "./collector.js";
import { EnvInterpolator } from "./interpolator.js";
import { VERSION } from "./version.js";
import { EnvParser, isEscaped, startsWithOperator, unquoteValue, processEscapes } from "./parser.js";
import type { EnvProvider, ParseResult, ParsedVar, EnvChangesResult, InterpolationWarning, ParseOperation } from "./types.js";
import { ProcessEnvProvider } from "./types.js";
import { isPathLike } from "./path-utils.js";
import { EnvCommandHandler } from "./env-command-handler.js";
import { getArgumentCompletions } from "./autocomplete.js";

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
    getArgumentCompletions,
    handler: async (args, ctx) => {
      await commandHandler.execute(args, ctx);
    },
  });
}

