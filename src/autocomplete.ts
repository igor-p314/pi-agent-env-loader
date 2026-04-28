import * as fs from "node:fs";
import * as path from "node:path";
import { COMMANDS } from "./constants";
import { isWindows } from "./platform";
import { isPathLike } from "./path-utils";

/** Commands that can follow a path: /env <path> list, /env <path> get KEY */
const PATH_POST_COMMANDS = ["list", "get"] as const;

/**
 * Returns argument completions for the `env` command.
 * Format: /env <path> <command>
 *   - After /env (no prefix): suggest all commands
 *   - Path-like prefix: suggest file/directory paths
 *   - Otherwise: try commands (top-level and post-path)
 */
export function getArgumentCompletions(prefix?: string): Array<{ value: string; label: string }> | null {
  // Empty or undefined — show all top-level options
  if (!prefix) {
    return COMMANDS.map((o) => ({ value: o, label: o }));
  }

  // Strip quotes from prefix for analysis
  const cleanPrefix = prefix.replace(/^["']|["']$/g, "");

  // Get platform-appropriate path separator
  const isWin = isWindows();
  const pathSep = isWin ? "\\" : "/";

  // Check if it looks like a path
  if (isPathLike(cleanPrefix)) {
    return getPathCompletions(cleanPrefix, prefix, isWin, pathSep);
  }

  // Could be a top-level command
  const topLevelMatches = COMMANDS.filter((c) => c.startsWith(cleanPrefix.toLowerCase()));
  if (topLevelMatches.length > 0) {
    return topLevelMatches.map((o) => ({ value: o, label: o }));
  }

  // Could be a post-path command (list, get) — shown after a path was typed
  const postPathMatches = PATH_POST_COMMANDS.filter((c) => c.startsWith(cleanPrefix.toLowerCase()));
  if (postPathMatches.length > 0) {
    return postPathMatches.map((o) => ({ value: o, label: o }));
  }

  // Try path completion as fallback for any non-empty prefix
  return getPathCompletions(cleanPrefix, prefix, isWin, pathSep);
}

/** Resolve file/directory completions */
function getPathCompletions(
  cleanPrefix: string,
  originalPrefix: string,
  isWin: boolean,
  pathSep: string
): Array<{ value: string; label: string }> | null {
  try {
    const cwd = process.cwd();
    const normalizedPrefix = isWin
      ? cleanPrefix.replace(/\//g, "\\")
      : cleanPrefix.replace(/\\/g, "/");

    const dir = path.dirname(normalizedPrefix || ".");
    const resolvedDir = path.isAbsolute(dir) ? dir : path.join(cwd, dir);
    const baseName = path.basename(normalizedPrefix || "");

    if (fs.existsSync(resolvedDir) && fs.statSync(resolvedDir).isDirectory()) {
      const entries = fs.readdirSync(resolvedDir);
      const filtered = entries.filter((e) => e.toLowerCase().startsWith(baseName.toLowerCase()) || !baseName);
      return filtered.slice(0, 10).map((e) => {
        const fullPath = path.join(resolvedDir, e);
        const isDir = fs.statSync(fullPath).isDirectory();
        const fullPathWithSep = path.join(dir, e) + (isDir ? pathSep : "");

        // Determine if the entire path needs quoting because it contains spaces or special chars
        const entirePathNeedsQuotes =
          fullPathWithSep.includes(" ") ||
          fullPathWithSep.includes("(") ||
          fullPathWithSep.includes(")");

        // Check if user already typed an opening quote at the beginning of prefix
        const prefixHasQuote =
          (originalPrefix.startsWith('"') && !originalPrefix.endsWith('"')) ||
          (originalPrefix.startsWith("'") && !originalPrefix.endsWith("'"));

        // Build the resulting path, making sure to preserve any existing opening quote
        let resultPath = fullPathWithSep;
        if (entirePathNeedsQuotes) {
          resultPath = `"${fullPathWithSep}`;
        }
        if (prefixHasQuote) {
          const openingQuote = originalPrefix[0]; // either " or '
          if (!resultPath.startsWith(openingQuote)) {
            resultPath = openingQuote + resultPath;
          }
        }
        const quotedPath = resultPath;

        return {
          value: quotedPath,
          label: e + (isDir ? pathSep : ""),
        };
      });
    }
  } catch {
    // Ignore errors
  }

  return null;
}
