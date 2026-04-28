import * as fs from "node:fs";
import * as path from "node:path";
import { COMMANDS } from "./constants.js";
import { isWindows } from "./constants.js";
import { isPathLike } from "./path-utils.js";

/**
 * Returns argument completions for the `env` command.
 * Handles both subcommand completion (prefix starts with `/`) and file-path completion.
 */
export function getArgumentCompletions(prefix?: string): Array<{ value: string; label: string }> | null {
  // Subcommand completions — prefix starts with "/"
  if (!prefix || prefix.startsWith("/")) {
    const filtered = COMMANDS.filter((o) => o.startsWith(prefix?.replace(/^\//, "") || ""));
    return filtered.length > 0 ? filtered.map((o) => ({ value: o, label: o })) : null;
  }

  // Strip quotes from prefix for path handling
  let cleanPrefix = prefix.replace(/^["']|["']$/g, "");

  // Get platform-appropriate path separator
  const isWin = isWindows();
  const pathSep = isWin ? "\\" : "/";

  // Check if it looks like a path (use cleaned prefix without quotes)
  if (isPathLike(cleanPrefix)) {
    try {
      const cwd = process.cwd();
      // Normalize path separators based on platform
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
            (prefix.startsWith('"') && !prefix.endsWith('"')) ||
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
            label: e + (isDir ? pathSep : ""),
          };
        });
      }
    } catch {
      // Ignore errors
    }
  }

  return null;
}
