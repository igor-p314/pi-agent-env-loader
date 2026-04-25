/**
 * EnvInterpolator - handles variable interpolation
 * Supports both Unix and Windows paths, mixed separators (Git Bash on Windows)
 */

import type { InterpolationWarning } from "./types.js";
import { MAX_INTERPOLATION_DEPTH, CYCLE_WARNING_KEY } from "./constants.js";

// Non-global regex to avoid state issues
const INTERPOLATION_REGEX = /\$\{([\p{L}_][\p{L}\p{N}_]*)\}|\$([\p{L}_][\p{L}\p{N}_]*)/gu;

export class EnvInterpolator {
  /**
   * Interpolate variables in a value string
   * @param value - The value string containing ${VAR} or $VAR placeholders
   * @param maxDepth - Maximum interpolation depth (default from constants)
   * @param warnings - Optional array to collect warnings for unknown variables
   * @param env - Environment variables to use for interpolation
   */
  interpolate(
    value: string,
    maxDepth: number = MAX_INTERPOLATION_DEPTH,
    warnings?: InterpolationWarning[],
    env: Record<string, string | undefined> = process.env
  ): string {
    let result = value;
    let prev = "";
    let depth = 0;

    while (result !== prev && depth < maxDepth) {
      prev = result;
      // Reset regex lastIndex to avoid state issues
      INTERPOLATION_REGEX.lastIndex = 0;
      
      const replaced = result.replace(
        INTERPOLATION_REGEX,
        (match, brace, plain) => {
          const varName = brace || plain;
          
          const envValue = env[varName];
          if (envValue === undefined) {
            if (warnings) {
              warnings.push({ varName, originalValue: value });
            }
            return "";
          }
          
          return envValue;
        }
      );
      
      result = replaced;
      depth++;
    }

    if (depth >= maxDepth && warnings) {
      warnings.push({ varName: CYCLE_WARNING_KEY, originalValue: value });
    }

    return result;
  }
}