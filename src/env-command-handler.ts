/**
 * EnvCommandHandler - handles all /env commands
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { COMMANDS, COMMANDS_NO_ENV, MAX_DISPLAY_ERRORS, MAX_DISPLAY_KEYS } from "./constants.js";
import { EnvParser } from "./parser.js";
import { EnvCollector } from "./collector.js";
import type { EnvProvider } from "./types.js";
import { ProcessEnvProvider } from "./types.js";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent"; // Adjust if needed

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
   */
  async execute(args: string, ctx: ExtensionContext): Promise<void> {
    const [inputRaw, ...paramParts] = args.trim().split(/\s+/);
    const input = inputRaw?.toLowerCase() || "";
    const param = paramParts.join(" ");
    const cwd = ctx.cwd;

    const isCommand = COMMANDS_NO_ENV.has(input) || ["reload", "list", "get"].includes(input);
    const targetPath = isCommand || !input
      ? path.join(cwd, ".env")
      : path.isAbsolute(input) ? input : path.join(cwd, input);

    if (!COMMANDS_NO_ENV.has(input) && !fs.existsSync(targetPath)) {
      ctx.ui.notify(`File not found: ${targetPath}`, "warning");
      return;
    }

    let vars: { key: string; value: string }[] = [];
    if (fs.existsSync(targetPath)) {
      let content: string;
      try {
        content = fs.readFileSync(targetPath, "utf-8");
      } catch (error) {
        if (error instanceof Error && 'code' in error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === 'EACCES') {
            ctx.ui.notify(`Permission denied: ${targetPath}`, "error");
          } else if (code === 'ENOENT') {
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
        ctx.ui.notify(`Parse warnings: ${limitedErrors.join("; ")}${result.errors.length > MAX_DISPLAY_ERRORS ? ` (+${result.errors.length - MAX_DISPLAY_ERRORS} more)` : ""}`, "warning");
      }
      vars = result.vars;
    }

    if (vars.length === 0 && !COMMANDS_NO_ENV.has(input)) {
      ctx.ui.notify("File is empty or invalid", "info");
      return;
    }

    switch (input) {
      case "help":
        this.handleHelp(ctx);
        return;
      case "list":
        this.handleList(vars, ctx);
        return;
      case "get":
        this.handleGet(vars, param, ctx);
        return;
      case "set":
        this.handleSet(paramParts, ctx);
        return;
      case "reload":
        this.handleReload(vars, ctx);
        return;
      default:
        this.handleDefault(vars, ctx);
        return;
    }
  }

  private handleHelp(ctx: ExtensionContext): void {
    ctx.ui.notify("Env Loader - .env file loader", "info");
    ctx.ui.notify([
      "Usage:",
      "  /env                     Load variables from .env",
      "  /env <PATH_TO_FILE>      Load from custom file path",
      "  /env reload              Reload all variables (overwrites existing)",
      "  /env list                List all variables in .env",
      "  /env get KEY             Get a specific variable",
      "  /env set KEY VALUE       Set variable in process.env",
      "  /env help                Show this help",
      "",
      "Extended Syntax in .env:",
      "  export KEY=value    Set variable",
      "  KEY?=value         Set only if not exists (default)",
      "  KEY+=value         Append to existing (colon-separated)",
      "  KEY-=value         Prepend to existing",
      "",
      "Features:",
      "  - Variable interpolation: ${VAR} or $VAR",
      "  - Escape sequences: \\n, \\t, \\r, \\\", \\'",
      "  - Multiline values (backslash at end of line)",
      "  - Inline comments (stripped outside quotes)",
      "  - Protected vars (PATH, HOME, etc.) skipped",
      "  - Secret masking (* for KEY, SECRET, TOKEN, PASSWORD)",
    ].join("\n"), "info");
  }

  private handleList(vars: { key: string; value: string }[], ctx: ExtensionContext): void {
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
    ctx.ui.notify(`Found ${vars.length} variable(s) in .env`, "info");
    ctx.ui.notify(varList.join("\n"), "info");
  }

  private handleGet(vars: { key: string; value: string }[], param: string, ctx: ExtensionContext): void {
    if (!param) {
      ctx.ui.notify("Usage: /env get KEY", "warning");
      return;
    }
    const found = vars.find((v) => v.key === param);
    if (!found) {
      ctx.ui.notify(`Variable '${param}' not found in .env`, "warning");
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

  private handleReload(vars: { key: string; value: string }[], ctx: ExtensionContext): void {
    // Force overwrite existing variables for "set" operations
    // Note: "default" (?=) operations are NEVER overwritten, even with forceOverwrite
    const changes = this.collector.collect(vars, process.env, true);
    this.collector.apply(changes);
    const loaded = changes.toSet.size;
    const protectedCount = changes.skipped.filter(s => s.reason === "protected").length;
    ctx.ui.notify(`Reloaded ${loaded} environment variable(s)${protectedCount > 0 ? ` (${protectedCount} protected skipped)` : ""}${loaded > 0 ? " (overwritten)" : ""}`, "info");
  }

  private handleDefault(vars: { key: string; value: string }[], ctx: ExtensionContext): void {
    const changes = this.collector.collect(vars);
    this.collector.apply(changes);
    const loaded = changes.toSet.size;
    const protectedCount = changes.skipped.filter(s => s.reason === "protected").length;
    const existsCount = changes.skipped.filter(s => s.reason === "exists").length;

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
