/**
 * Path utilities for env-loader
 * Supports Unix paths, Windows paths, and Unicode characters
 */

import { COMMANDS, WINDOWS_DRIVE_REGEX, PATH_LIKE_REGEX, FILE_EXTENSION_REGEX } from "./constants.js";

/**
 * Determines if input looks like a file path rather than a command
 * Supports Unix paths, Windows paths (C:\\, D:/), and Unicode characters
 */
export function isPathLike(prefix: string, commands: readonly string[] = COMMANDS): boolean {
  if (commands.includes(prefix.toLowerCase())) {
    return false;
  }
  
  // Check for relative path patterns (./ or ../)
  if (prefix === '.' || prefix === '..' || prefix.startsWith('./') || prefix.startsWith('../')) {
    return true;
  }
  
  // Handle dot-prefixed strings
  if (prefix.startsWith('.')) {
    // ., .., ./, ../ are paths
    if (prefix === '.' || prefix === '..' || prefix.startsWith('./') || prefix.startsWith('../')) {
      return true;
    }
    // If it starts with ".." but not followed by / or \, it's likely a filename like "..env"
    if (prefix.startsWith('..') && !prefix.startsWith('../') && !prefix.startsWith('..\\')) {
      return false;
    }
    // .env, .config - hidden files, treat as paths
    return true;
  }
  
  return (
    prefix.includes("/") ||                    // Unix path separator
    prefix.includes("\\") ||                   // Windows path separator
    prefix.startsWith(".") ||                   // Relative path
    WINDOWS_DRIVE_REGEX.test(prefix) ||          // Windows drive (C:, D:)
    FILE_EXTENSION_REGEX.test(prefix) ||          // Has file extension
    PATH_LIKE_REGEX.test(prefix)                 // Contains any path separator
  );
}
