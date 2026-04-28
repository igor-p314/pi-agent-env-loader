import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EnvCommandHandler, stripQuotes, parseArgs } from "../src/env-command-handler.js";
import { EnvParser } from "../src/parser.js";
import { EnvCollector } from "../src/collector.js";
import { ProcessEnvProvider } from "../src/types.js";
import * as fs from "node:fs";
import * as path from "node:path";

vi.mock("node:fs");
vi.mock("node:path");

describe("EnvCommandHandler - Utilities", () => {
  let parser: EnvParser;
  let collector: EnvCollector;
  let envProvider: ProcessEnvProvider;
  let handler: EnvCommandHandler;
  let mockNotify: ReturnType<typeof vi.fn>;
  let mockCtx: any;

  beforeEach(() => {
    parser = new EnvParser();
    envProvider = new ProcessEnvProvider();
    collector = new EnvCollector(envProvider);
    handler = new EnvCommandHandler(parser, collector, envProvider);
    mockNotify = vi.fn();
    mockCtx = {
      cwd: "/fake",
      ui: { notify: mockNotify },
    };
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("parseArgs function", () => {
    it("should parse simple args", () => {
      expect(parseArgs("list")).toEqual(["list"]);
      expect(parseArgs("get KEY")).toEqual(["get", "KEY"]);
      expect(parseArgs("set KEY value")).toEqual(["set", "KEY", "value"]);
    });

    it("should handle double-quoted paths with spaces", () => {
      expect(parseArgs('"path with spaces"')).toEqual(["path with spaces"]);
      expect(parseArgs('list "path with spaces"')).toEqual(["list", "path with spaces"]);
    });

    it("should handle single-quoted paths with spaces", () => {
      expect(parseArgs("'path with spaces'")).toEqual(["path with spaces"]);
      expect(parseArgs("list 'path with spaces'")).toEqual(["list", "path with spaces"]);
    });

    it("should handle mixed quotes", () => {
      expect(parseArgs('get KEY "C:\\path"')).toEqual(["get", "KEY", "C:\\path"]);
    });

    it("should handle empty string", () => {
      expect(parseArgs("")).toEqual([]);
    });

    it("should handle quotes at start only", () => {
      expect(parseArgs('"unclosed')).toEqual(["unclosed"]);
    });
  });

  describe("stripQuotes function", () => {
    it("should strip double quotes", () => {
      expect(stripQuotes('"hello"')).toBe("hello");
      expect(stripQuotes('""')).toBe("");
    });

    it("should strip single quotes", () => {
      expect(stripQuotes("'hello'")).toBe("hello");
      expect(stripQuotes("''")).toBe("");
    });

    it("should not strip unmatched quotes", () => {
      expect(stripQuotes('"hello')).toBe('"hello');
      expect(stripQuotes("hello'")).toBe("hello'");
    });

    it("should handle no quotes", () => {
      expect(stripQuotes("hello")).toBe("hello");
    });

    it("should NOT strip quote if only opening quote present", () => {
      expect(stripQuotes('"C:\\Program Files\\app')).toBe('"C:\\Program Files\\app');
      expect(stripQuotes("'single quote only")).toBe("'single quote only");
    });

    it("should strip only balanced quotes", () => {
      expect(stripQuotes('"C:\\Program Files\\app"')).toBe("C:\\Program Files\\app");
      expect(stripQuotes("'path with spaces'")).toBe("path with spaces");
    });

    it("should NOT strip quotes that are not at start and end", () => {
      expect(stripQuotes('something"more"')).toBe('something"more"');
      expect(stripQuotes('start"middle')).toBe('start"middle');
    });
  });

  describe("quoted path handling", () => {
    it("should handle double-quoted path with list", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("QUOTED_VAR=test");
      vi.spyOn(path, "basename").mockReturnValue("test.env");

      await handler.execute('"C:\\tmp\\test.env" list', mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Found"), "info");
    });

    it("should handle single-quoted path with list", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("SINGLE_QUOTED=value");
      vi.spyOn(path, "basename").mockReturnValue(".env");

      await handler.execute("'./custom.env' list", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Found"), "info");
    });

    it("should handle quoted path with spaces for list", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("SPACED_VAR=works");
      vi.spyOn(path, "basename").mockReturnValue("переменные.txt");

      await handler.execute('"C:\\tmp\\Тестовая папка\\переменные.txt" list', mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Found"), "info");
    });

    it("should handle quoted path with get command", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("DB_PASSWORD=secret123");
      vi.spyOn(path, "basename").mockReturnValue(".env");

      await handler.execute('".env" get DB_PASSWORD', mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("DB_PASSWORD="), "info");
    });
  });
});
