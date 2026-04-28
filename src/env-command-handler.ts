/**
 * EnvCommandHandler - handles all /env commands
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { MAX_DISPLAY_ERRORS, MAX_DISPLAY_KEYS, PROTECTED_VARS } from "./constants.js";
import { VERSION } from "./version.js";
import { EnvParser } from "./parser.js";
import { EnvCollector } from "./collector.js";
import type { EnvProvider } from "./types.js";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { parseArgs, stripQuotes } from "./arg-parser.js";

/** All known /env subcommands */
const KNOWN_COMMANDS = new Set(["help", "set", "list", "get"]);

function isKnownCommand(arg: string): boolean {
  return KNOWN_COMMANDS.has(arg);
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
   * Execute the /env command with given arguments and context.
   *
   * Usage:
   *   /env                     -> load from .env
   *   /env <path>              -> load from custom file
   *   /env "path with spaces"  -> load from quoted path
   *   /env list                -> list all currently set env variables
   *   /env list <path>         -> list variables from file
   *   /env get KEY             -> get KEY from env
   *   /env get KEY <path>      -> get KEY from file
   *   /env set KEY VALUE       -> set KEY in process.env
   *   /env help                -> show help
   */
  async execute(args: string, ctx: ExtensionContext): Promise<void> {
    const parts = parseArgs(args);
    const firstArg = parts[0]?.toLowerCase() || "";
    const remainingArgs = parts.slice(1);
    const cwd = ctx.cwd;

    // If first argument is a known command
    if (isKnownCommand(firstArg)) {
      const command = firstArg;

      // list: /env list or /env list <path>
      if (command === "list") {
        if (remainingArgs.length === 0) {
          this.handleListEnv(ctx);
          return;
        }
        const pathArg = stripQuotes(remainingArgs[0]);
        const resolved = path.isAbsolute(pathArg) ? pathArg : path.join(cwd, pathArg);
        await this.handleListFromPath(resolved, ctx);
        return;
      }

      // get: /env get KEY or /env get KEY <path>
      if (command === "get") {
        const key = remainingArgs[0];
        if (!key) {
          ctx.ui.notify("Usage: /env get KEY or /env get KEY <PATH>", "warning");
          return;
        }
        if (remainingArgs.length >= 2) {
          const pathArg = stripQuotes(remainingArgs[1]);
          const resolved = path.isAbsolute(pathArg) ? pathArg : path.join(cwd, pathArg);
          await this.handleGetFromPath(resolved, key, ctx);
          return;
        }
        // /env get KEY — read from process.env
        this.handleGetEnv(key, ctx);
        return;
      }

      // set: /env set KEY VALUE
      if (command === "set") {
        this.handleSet(remainingArgs, ctx);
        return;
      }

      // help
      this.handleHelp(ctx);
      return;
    }

    // First arg is not a command — treat as file path
    if (firstArg) {
      const cleanFirstArg = stripQuotes(firstArg);
      const targetPath = path.isAbsolute(cleanFirstArg) ? cleanFirstArg : path.join(cwd, cleanFirstArg);
      await this.handleDefault(targetPath, ctx);
      return;
    }

    // No args — default .env
    await this.handleDefault(path.join(cwd, ".env"), ctx);
  }

  // ── Private helpers ──────────────────────────────────────────────

  /**
   * Load and parse a file. Returns vars on success, null on failure.
   */
  private async loadFile(targetPath: string, ctx: ExtensionContext): Promise<{ key: string; value: string }[] | null> {
    if (!fs.existsSync(targetPath)) {
      ctx.ui.notify(`File not found: ${targetPath}`, "warning");
      return null;
    }
    let content: string;
    try {
      content = fs.readFileSync(targetPath, "utf-8");
    } catch (error) {
      const msg = this.readErrorMessage(error, targetPath);
      if (msg) {
        ctx.ui.notify(msg, "error");
        return null;
      }
      ctx.ui.notify(`Failed to read file: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
      return null;
    }
    const result = this.parser.parse(content);
    if (result.errors.length > 0) {
      const limited = result.errors.slice(0, MAX_DISPLAY_ERRORS);
      ctx.ui.notify(
        `Parse warnings: ${limited.join("; ")}${result.errors.length > MAX_DISPLAY_ERRORS ? ` (+${result.errors.length - MAX_DISPLAY_ERRORS} more)` : ""}`,
        "warning"
      );
    }
    return result.vars;
  }

  /** Format a filesystem read error, or return null if it's generic. */
  private readErrorMessage(error: unknown, targetPath: string): string | null {
    if (!(error instanceof Error) || !("code" in error)) return null;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EACCES") return `Permission denied: ${targetPath}`;
    if (code === "ENOENT") return `File not found: ${targetPath}`;
    return null;
  }

  private handleHelp(ctx: ExtensionContext): void {
    ctx.ui.notify(
      [
        `Env Loader v${VERSION}`,
        "Usage:",
        "  /env                     Load variables from .env",
        "  /env <PATH_TO_FILE>      Load from custom file",
        '  /env "path with spaces"  Load from quoted path',
        "  /env list                List all currently set env variables",
        "  /env list <PATH>         List variables from file",
        "  /env get KEY             Get variable from env",
        "  /env get KEY <PATH>      Get variable from file",
        "  /env set KEY VALUE       Set variable in process.env",
        "  /env help                Show this help",
        "",
        "Supported .env syntax:",
        "  export KEY=value    Set variable",
        "  KEY?=value         Set only if not exists (default)",
        "  KEY+=value         Append to existing",
        "  KEY-=value         Prepend to existing",
      ].join("\n"),
      "info"
    );
  }

  // ── list ─────────────────────────────────────────────────────────

  /** /env list — show currently set variables. */
  private handleListEnv(ctx: ExtensionContext): void {
    const all = Object.entries(process.env);
    if (all.length === 0) {
      ctx.ui.notify("No environment variables are set", "info");
      return;
    }
    const lines: string[] = [];
    for (const [key, value] of all) {
      const strValue = value ?? "";
      let display = strValue;
      if (this.collector.isSecretKey(key)) {
        display = this.collector.maskValue(strValue);
      } else if (display.length > 50) {
        display = display.slice(0, 47) + "...";
      }
      lines.push(`${key}=${display}`);
    }
    ctx.ui.notify(`Found ${all.length} environment variable(s)`, "info");
    ctx.ui.notify(lines.join("\n"), "info");
  }

  /** /env list <path> — show variables from file. */
  private async handleListFromPath(targetPath: string, ctx: ExtensionContext): Promise<void> {
    const vars = await this.loadFile(targetPath, ctx);
    if (vars === null) return;
    this.handleList(vars, path.basename(targetPath), ctx);
  }

  private handleList(vars: { key: string; value: string }[], sourceName: string, ctx: ExtensionContext): void {
    const lines: string[] = [];
    for (const { key, value } of vars) {
      let display = value;
      if (this.collector.isSecretKey(key)) {
        display = this.collector.maskValue(value);
      } else if (display.length > 50) {
        display = display.slice(0, 47) + "...";
      }
      lines.push(`${key}=${display}`);
    }
    ctx.ui.notify(`Found ${vars.length} variable(s) in ${sourceName}`, "info");
    ctx.ui.notify(lines.join("\n"), "info");
  }

  // ── get ──────────────────────────────────────────────────────────

  /** /env get KEY — show currently set env variable. */
  private handleGetEnv(key: string, ctx: ExtensionContext): void {
    const value = process.env[key];
    if (value === undefined) {
      ctx.ui.notify(`Variable '${key}' is not set in environment`, "warning");
      return;
    }
    const display = this.collector.isSecretKey(key) ? this.collector.maskValue(value) : value;
    ctx.ui.notify(`${key}=${display}`, "info");
  }

  private async handleGetFromPath(targetPath: string, key: string, ctx: ExtensionContext): Promise<void> {
    const vars = await this.loadFile(targetPath, ctx);
    if (vars === null) return;
    const sourceName = path.basename(targetPath);
    const found = vars.find((v) => v.key === key);
    if (!found) {
      ctx.ui.notify(`Variable '${key}' not found in ${sourceName}`, "warning");
      return;
    }
    const value = this.collector.isSecretKey(key) ? this.collector.maskValue(found.value) : found.value;
    ctx.ui.notify(`${key}=${value}`, "info");
  }

  // ── set ──────────────────────────────────────────────────────────

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

    if (PROTECTED_VARS.has(setKey.toUpperCase())) {
      ctx.ui.notify(`Protected variable '${setKey}' cannot be modified`, "error");
      return;
    }

    const converted = setValue.trim();
    this.envProvider.set(setKey, converted);
    const display = this.collector.isSecretKey(setKey) ? this.collector.maskValue(setValue) : setValue;
    ctx.ui.notify(`Set ${setKey}=${display} (process.env only)`, "info");
  }

  // ── default load ─────────────────────────────────────────────────

  private async handleDefault(targetPath: string, ctx: ExtensionContext): Promise<void> {
    const vars = await this.loadFile(targetPath, ctx);
    if (vars === null) return;
    if (vars.length === 0) {
      ctx.ui.notify("File is empty or invalid", "info");
      return;
    }
    const changes = this.collector.collect(vars);
    this.collector.apply(changes);
    const loaded = changes.toSet.size;
    const protectedCount = changes.skipped.filter((s) => s.reason === "protected").length;
    const existsCount = changes.skipped.filter((s) => s.reason === "exists").length;

    if (loaded > 0) {
      const parts: string[] = [`Loaded ${loaded} new environment variable(s)`];
      if (existsCount > 0) parts.push(`(${existsCount} already set)`);
      if (protectedCount > 0) parts.push(`(${protectedCount} protected)`);
      ctx.ui.notify(parts.join(" "), "info");

      const keys = Array.from(changes.toSet.keys()).slice(0, MAX_DISPLAY_KEYS);
      const more = changes.toSet.size > MAX_DISPLAY_KEYS ? `, +${changes.toSet.size - MAX_DISPLAY_KEYS} more` : "";
      ctx.ui.notify(`Variables: ${keys.join(", ")}${more}`, "info");
    } else {
      const parts: string[] = [];
      if (existsCount > 0) parts.push(`${existsCount} already set`);
      if (protectedCount > 0) parts.push(`${protectedCount} protected`);
      ctx.ui.notify(
        parts.length > 0 ? `All variable(s) ${parts.join(", ")}` : "All variables already set",
        "info"
      );
    }
  }
}

// Export utility functions for testing
export { stripQuotes, parseArgs };
