/**
 * Platform utilities for env-loader
 */

/**
 * Check if the current platform is Windows
 */
export function isWindows(): boolean {
  return typeof process !== "undefined" && process.platform === "win32";
}

/**
 * Platform helper object for platform-specific functionality
 */
export const PLATFORM = {
  isWindows,
};
