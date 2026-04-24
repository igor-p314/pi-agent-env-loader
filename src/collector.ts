/**
 * EnvCollector - collects and applies environment changes
 */

import { PROTECTED_VARS, MAX_INTERPOLATION_DEPTH, DEFAULT_SEPARATOR, MAX_INTERPOLATED_LENGTH, isSecretKeyPattern } from "./constants.js";
import type { EnvChangesResult, ParseOperation, EnvProvider } from "./types.js";
import { ProcessEnvProvider } from "./types.js";
import { EnvInterpolator } from "./interpolator.js";

export class EnvCollector {
  private interpolator: EnvInterpolator;
  private envProvider: EnvProvider;

  constructor(envProvider: EnvProvider = new ProcessEnvProvider()) {
    this.interpolator = new EnvInterpolator();
    this.envProvider = envProvider;
  }

  /**
   * Check if a key matches secret patterns (e.g., *_KEY, *_SECRET)
   */
  isSecretKey(key: string): boolean {
    return isSecretKeyPattern(key);
  }

  /**
   * Check if a key is in the protected list (e.g., PATH, HOME)
   */
  isProtectedKey(key: string): boolean {
    return PROTECTED_VARS.has(key.toUpperCase());
  }

  /**
   * Mask a value for display, showing only the first few characters
   * @param value - The value to mask
   * @param showChars - Number of characters to leave visible (default: 2)
   */
  maskValue(value: string, showChars: number = 2): string {
    // If the value is short enough to be fully visible, show it as is
    if (value.length <= showChars) {
      return value;
    }
    const visible = value.slice(0, Math.max(0, showChars));
    const maskedLength = value.length - visible.length;
    const masked = "*".repeat(maskedLength);
    return visible + masked;
  }

  /**
   * Collect environment changes from parsed variables
   * @param vars - Array of parsed variables
   * @param env - Environment to check against (default: process.env)
   * @param forceOverwrite - If true, overwrite existing variables
   */
  collect(
    vars: { key: string; value: string; operation?: ParseOperation }[],
    env: Record<string, string | undefined> = process.env,
    forceOverwrite: boolean = false
  ): EnvChangesResult {
    const result: EnvChangesResult = {
      toSet: new Map(),
      skipped: [],
      warnings: [],
    };

    for (const { key, value, operation = "set" } of vars) {
      if (this.isProtectedKey(key)) {
        result.skipped.push({ key, reason: "protected" });
        continue;
      }

      let interpolated = this.interpolator.interpolate(value, MAX_INTERPOLATION_DEPTH, result.warnings, env).trim();
      
      // Safety: limit interpolated value length
      if (interpolated.length > MAX_INTERPOLATED_LENGTH) {
        interpolated = interpolated.slice(0, MAX_INTERPOLATED_LENGTH);
        result.warnings.push({ varName: key, originalValue: value });
      }
      // Use provided env object to check existing values
      const existing = env[key];
      const hasExisting = existing !== undefined;

      // "default" operation: skip if exists (never overwrites)
      if (operation === "default" && hasExisting) {
        result.skipped.push({ key, reason: "exists" });
        continue;
      }
      
      // "set" operation: skip if exists (unless forceOverwrite)
      if (!forceOverwrite && operation === "set" && hasExisting) {
        result.skipped.push({ key, reason: "exists" });
        continue;
      }

      // Apply operation with separator, avoiding double separators
      const endsWithSep = existing && (existing.endsWith(':') || existing.endsWith(';'));
      const startsWithSep = existing && (existing.startsWith(':') || existing.startsWith(';'));
      const newValue = operation === "append"
        ? (existing || "") + (endsWithSep ? "" : DEFAULT_SEPARATOR) + interpolated
        : operation === "prepend"
          ? interpolated + (startsWithSep ? "" : DEFAULT_SEPARATOR) + (existing || "")
          : interpolated;

      result.toSet.set(key, newValue);
    }

    return result;
  }

  /**
   * Apply collected changes to the environment provider
   * @param changes - The changes result from collect()
   */
  apply(changes: EnvChangesResult): void {
    for (const [key, value] of changes.toSet) {
      this.envProvider.set(key, value);
    }
  }
}