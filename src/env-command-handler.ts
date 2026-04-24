/**
 * EnvCommandHandler - handles all /env commands
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { COMMANDS_NO_ENV, MAX_DISPLAY_ERRORS, MAX_DISPLAY_KEYS } from "./constants.js";
import { VERSION } from "./version.js";
import { EnvParser } from "./parser.js";
import { EnvCollector } from "./collector.js";
import type { EnvProvider } from "./types.js";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

/**
 * Strip quotes from a string (both single and double)
 * Only removes quotes if they are properly balanced (both opening and closing)
 * @param str - String that may have quotes
 * @returns String without surrounding quotes
 */
function stripQuotes(str: string): string {
  if (str.length >= 2) {
    // Only remove quotes if both opening and closing quotes are present
    if ((str.startsWith('"') && str.endsWith('"')) ||
        (str.startsWith("'") && str.endsWith("'"))) {
      return str.slice(1, -1);
    }
  }
  return str;
}

/**
 * Parse command arguments, handling quoted paths
 * @param args - Raw command arguments string
 * @returns Array of parts with quotes stripped
 */
function parseArgs(args: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let i = 0;

  while (i < args.length) {
    const char = args[i];

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      i++;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      i++;
      continue;
    }

    if (char === " " && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        parts.push(current);
        current = "";
      }
      i++;
      continue;
    }

    current += char;
    i++;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

export class EnvCommandHandler {
  private parser: EnvParser;
  private collector: EnvCollector;
  private envProvider: EnvProvider;

  constructor(parser: EnvParser, collector: EnvCollector, envProvider: EnvProvider) {
    this.parser = parser;
    this.collector = collector;
    this.envProvider = envProvider;
  }

  /**
   * Execute the /env command with given arguments and context
   *
   * Usage:
   *   /env                     -> load from .env
   *   /env <path>              -> load from custom file
   *   /env "path with spaces"  -> load from quoted path
   *   /env list                -> list variables from .env
   *   /env <path> list         -> list variables from custom file
   *   /env get KEY             -> get KEY from .env
   *   /env <path> get KEY      -> get KEY from custom file
   *   /env set KEY VALUE       -> set KEY in process.env
   *   /env help                -> show help
   */
  async execute(args: string, ctx: ExtensionContext): Promise<void> {
    const parts = parseArgs(args);
    const firstArg = parts[0]?.toLowerCase() || "";
    const remainingArgs = parts.slice(1);
    const cwd = ctx.cwd;

    // Determine if first argument is a command or a path
    const isCommand = COMMANDS_NO_ENV.has(firstArg) || ["list", "get"].includes(firstArg);

    let targetPath: string;
    let command: string;
    let commandParams: string[];

    if (isCommand) {
      // /env <command> - use default .env
      targetPath = path.join(cwd, ".env");
      command = firstArg;
      commandParams = remainingArgs;
    } else if (firstArg) {
      // /env <path> or /env <path> <command>
      // Strip quotes from path if present
      const cleanFirstArg = stripQuotes(firstArg);
      const firstArgPath = path.isAbsolute(cleanFirstArg) ? cleanFirstArg : path.join(cwd, cleanFirstArg);
      const secondArg = remainingArgs[0]?.toLowerCase() || "";

      if (COMMANDS_NO_ENV.has(secondArg) || ["list", "get"].includes(secondArg)) {
        // /env <path> <command>
        targetPath = firstArgPath;
        command = secondArg;
        commandParams = remainingArgs.slice(1);
      } else {
        // /env <path> - just load the file
        targetPath = firstArgPath;
        command = "";
        commandParams = [];
      }
    } else {
      // No args - use default .env
      targetPath = path.join(cwd, ".env");
      command = "";
      commandParams = [];
    }

    if (!COMMANDS_NO_ENV.has(command) && !fs.existsSync(targetPath)) {
      ctx.ui.notify(`File not found: ${targetPath}`, "warning");
      return;
    }

    let vars: { key: string; value: string }[] = [];
    if (fs.existsSync(targetPath)) {
      let content: string;
      try {
        content = fs.readFileSync(targetPath, "utf-8");
      } catch (error) {
        if (error instanceof Error && "code" in error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === "EACCES") {
            ctx.ui.notify(`Permission denied: ${targetPath}`, "error");
          } else if (code === "ENOENT") {
            ctx.ui.notify(`File not found: ${targetPath}`, "error");
          } else {
            ctx.ui.notify(`Failed to read file: ${error.message}`, "error");
          }
        } else {
          const message = error instanceof Error ? error.message : "Unknown error";
          ctx.ui.notify(`Failed to read file: ${message}`, "error");
        }
        return;
      }
      const result = this.parser.parse(content);
      if (result.errors.length > 0) {
        const limitedErrors = result.errors.slice(0, MAX_DISPLAY_ERRORS);
        ctx.ui.notify(
          `Parse warnings: ${limitedErrors.join("; ")}${result.errors.length > MAX_DISPLAY_ERRORS ? ` (+${result.errors.length - MAX_DISPLAY_ERRORS} more)` : ""}`,
          "warning"
        );
      }
      vars = result.vars;
    }

    if (vars.length === 0 && !COMMANDS_NO_ENV.has(command)) {
      ctx.ui.notify("File is empty or invalid", "info");
      return;
    }

    const param = commandParams.join(" ");
    switch (command) {
      case "help":
        this.handleHelp(ctx);
        return;
      case "list":
        this.handleList(vars, targetPath, ctx);
        return;
      case "get":
        this.handleGet(vars, param, targetPath, ctx);
        return;
      case "set":
        this.handleSet(commandParams, ctx);
        return;
      default:
        this.handleDefault(vars, ctx);
        return;
    }
  }

  private handleHelp(ctx: ExtensionContext): void {
    ctx.ui.notify(
      [
        `Env Loader v${VERSION}`,
        "Usage:",
        "  /env                     Load variables from .env",
        "  /env <PATH_TO_FILE>      Load from custom file",
        "  /env \"path with spaces\"  Load from quoted path",
        "  /env list                List all variables in .env",
        "  /env <PATH> list         List variables from custom file",
        "  /env get KEY             Get variable from .env",
        "  /env <PATH> get KEY      Get variable from custom file",
        "  /env set KEY VALUE       Set variable in process.env",
        "  /env help                Show this help",
        "",
        "Supports extended Syntax in .env:",
        "  export KEY=value    Set variable",
        "  KEY?=value         Set only if not exists (default)",
        "  KEY+=value         Append to existing (colon-separated)",
        "  KEY-=value         Prepend to existing"
      ].join("\n"),
      "info"
    );
  }

  private handleList(vars: { key: string; value: string }[], targetPath: string, ctx: ExtensionContext): void {
    const fileName = path.basename(targetPath);
    const varList: string[] = [];
    for (const { key, value } of vars) {
      let displayValue = value;
      if (this.collector.isSecretKey(key)) {
        displayValue = this.collector.maskValue(value);
      } else if (displayValue.length > 50) {
        displayValue = displayValue.slice(0, 47) + "...";
      }
      varList.push(`${key}=${displayValue}`);
    }
    ctx.ui.notify(`Found ${vars.length} variable(s) in ${fileName}`, "info");
    ctx.ui.notify(varList.join("\n"), "info");
  }

  private handleGet(
    vars: { key: string; value: string }[],
    param: string,
    targetPath: string,
    ctx: ExtensionContext
  ): void {
    if (!param) {
      ctx.ui.notify("Usage: /env get KEY or /env <PATH> get KEY", "warning");
      return;
    }
    const fileName = path.basename(targetPath);
    const found = vars.find((v) => v.key === param);
    if (!found) {
      ctx.ui.notify(`Variable '${param}' not found in ${fileName}`, "warning");
      return;
    }
    const value = this.collector.isSecretKey(param) ? this.collector.maskValue(found.value) : found.value;
    ctx.ui.notify(`${param}=${value}`, "info");
  }

  private handleSet(paramParts: string[], ctx: ExtensionContext): void {
    const setKey = paramParts[0];
    const setValue = paramParts.slice(1).join(" ");

    if (!setKey) {
      ctx.ui.notify("Usage: /env set KEY VALUE", "warning");
      return;
    }

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(setKey)) {
      ctx.ui.notify(`Invalid key format: ${setKey}`, "error");
      return;
    }

    if (this.collector.isProtectedKey(setKey)) {
      ctx.ui.notify(`Protected variable '${setKey}' cannot be modified`, "error");
      return;
    }

    const converted = setValue.trim();
    this.envProvider.set(setKey, converted);
    const display = this.collector.isSecretKey(setKey) ? this.collector.maskValue(setValue) : setValue;
    ctx.ui.notify(`Set ${setKey}=${display} (process.env only)`, "info");
  }

  private handleDefault(vars: { key: string; value: string }[], ctx: ExtensionContext): void {
    const changes = this.collector.collect(vars);
    this.collector.apply(changes);
    const loaded = changes.toSet.size;
    const protectedCount = changes.skipped.filter((s) => s.reason === "protected").length;
    const existsCount = changes.skipped.filter((s) => s.reason === "exists").length;

    if (loaded > 0) {
      const partsList: string[] = [`Loaded ${loaded} new environment variable(s)`];
      if (existsCount > 0) partsList.push(`(${existsCount} already set)`);
      if (protectedCount > 0) partsList.push(`(${protectedCount} protected)`);
      ctx.ui.notify(partsList.join(" "), "info");

      const loadedKeys = Array.from(changes.toSet.keys()).slice(0, MAX_DISPLAY_KEYS);
      const keyList = loadedKeys.join(", ");
      const more = changes.toSet.size > MAX_DISPLAY_KEYS ? `, +${changes.toSet.size - MAX_DISPLAY_KEYS} more` : "";
      ctx.ui.notify(`Variables: ${keyList}${more}`, "info");
    } else {
      const partsList: string[] = [];
      if (existsCount > 0) partsList.push(`${existsCount} already set`);
      if (protectedCount > 0) partsList.push(`${protectedCount} protected`);
      ctx.ui.notify(partsList.length > 0 ? `All variable(s) ${partsList.join(", ")}` : "All variables already set", "info");
    }
  }
}

// Export utility functions for testing
export { stripQuotes, parseArgs };