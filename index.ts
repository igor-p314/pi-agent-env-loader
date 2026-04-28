/**
 * Env Loader Extension for pi
 *
 * Loads environment variables from .env files.
 * Entry point: registers the extension and re-exports public API.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isSecretKeyPattern, PROTECTED_VARS } from "./src/constants";
import { EnvCollector } from "./src/collector";
import { EnvInterpolator } from "./src/interpolator";
import { EnvParser, isEscaped, startsWithOperator, unquoteValue, processEscapes } from "./src/parser";
import type { EnvProvider, ParseResult, ParsedVar, EnvChangesResult, InterpolationWarning, ParseOperation } from "./src/types";
import { ProcessEnvProvider } from "./src/types";
import { EnvCommandHandler } from "./src/env-command-handler";
import { getArgumentCompletions } from "./src/autocomplete";

// Module-level stateless instances (reused to avoid unnecessary allocations)
const parserInstance = new EnvParser();
const interpolatorInstance = new EnvInterpolator();

// === Re-export types ===
export type { EnvProvider, ParseResult, ParsedVar, EnvChangesResult, InterpolationWarning, ParseOperation };
export { ProcessEnvProvider };
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

