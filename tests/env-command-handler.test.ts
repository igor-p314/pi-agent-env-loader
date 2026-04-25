import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EnvCommandHandler, stripQuotes, parseArgs } from "../src/env-command-handler.js";
import { EnvParser } from "../src/parser.js";
import { EnvCollector } from "../src/collector.js";
import { ProcessEnvProvider } from "../src/types.js";
import * as fs from "node:fs";
import * as path from "node:path";

vi.mock("node:fs");
vi.mock("node:path");

describe("EnvCommandHandler", () => {
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

  describe("help command", () => {
    it("should display help", async () => {
      await handler.execute("help", mockCtx);
      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify.mock.calls[0][0]).toContain("Env Loader");
    });
  });

  describe("set command", () => {
    it("should show usage when no key provided", async () => {
      await handler.execute("set", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith("Usage: /env set KEY VALUE", "warning");
    });

    it("should reject invalid key format", async () => {
      await handler.execute("set 123KEY value", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Invalid key format"), "error");
    });

    it("should reject protected key", async () => {
      await handler.execute("set PATH /new/path", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Protected variable"), "error");
    });

    it("should set valid key", async () => {
      await handler.execute("set MY_VAR test", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Set MY_VAR="), "info");
      expect(envProvider.get("MY_VAR")).toBe("test");
    });

    it("should mask secret key in notification", async () => {
      await handler.execute("set SECRET_KEY mysecret", mockCtx);
      const notifyCall = mockNotify.mock.calls.find((call) => call[0].includes("Set SECRET_KEY="));
      expect(notifyCall).toBeTruthy();
      expect(notifyCall[0]).toContain("*");
    });
  });

  describe("list command", () => {
    it("should notify if file not found", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      await handler.execute("list", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("File not found"), "warning");
    });

    it("should list variables from file", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("KEY1=value1\nSECRET=confidential");
      await handler.execute("list", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Found"), "info");
    });

    it("should list variables from custom path", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("CUSTOM_VAR=custom");
      vi.mocked(path.basename).mockReturnValue(".env.local");
      await handler.execute(".env.local list", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("in .env.local"), "info");
    });

    it("should handle file not found for custom path", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      await handler.execute("/abs/path/to/.env list", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("File not found"), "warning");
    });

    // --- Missing branch: custom path file not found with no vars ---
    it("should notify when custom path file not found", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      await handler.execute("/custom/path/.env", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("File not found"), "warning");
    });
  });

  describe("get command", () => {
    it("should show usage when no key provided", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("KEY1=value1");
      await handler.execute("get", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith("Usage: /env get KEY or /env <PATH> get KEY", "warning");
    });

    it("should notify if variable not found", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("KEY1=value1");
      await handler.execute("get NONEXISTENT", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("not found"), "warning");
    });

    it("should get existing variable", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("KEY1=value1");
      await handler.execute("get KEY1", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith("KEY1=value1", "info");
    });

    it("should get variable from custom path", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("DB_HOST=localhost");
      await handler.execute(".env.prod get DB_HOST", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("DB_HOST=localhost"), "info");
    });

    it("should mask secret key in get", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("MY_SECRET=supersecret");
      await handler.execute("get MY_SECRET", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("MY_SECRET=su"), "info");
    });

    // --- Missing branch: get with custom path, variable not found ---
    it("should notify not found when variable absent in custom path file", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("OTHER_VAR=exists");
      vi.mocked(path.basename).mockReturnValue(".env.prod");
      await handler.execute(".env.prod get MISSING_KEY", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(
        expect.stringContaining("Variable 'MISSING_KEY' not found in .env.prod"),
        "warning"
      );
    });
  });

  describe("default load command", () => {
    it("should load variables from .env", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("NEW_VAR=newvalue");
      await handler.execute("", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Loaded"), "info");
    });

    it("should notify if file empty", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("");
      await handler.execute("", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith("File is empty or invalid", "info");
    });

    // --- Missing branch: all vars protected/skipped ---
    it("should notify correctly when all vars are protected", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("PATH=/usr/bin\nHOME=/home/user");
      await handler.execute("", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(
        expect.stringContaining("protected"),
        "info"
      );
    });

    it("should notify correctly when all vars already exist", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("NEW_VAR=newvalue");
      // Set env vars so they already exist
      process.env.NEW_VAR = "existing";
      await handler.execute("", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(
        expect.stringContaining("already set"),
        "info"
      );
      delete process.env.NEW_VAR;
    });
  });

  describe("error handling", () => {
    it("should handle file read permission error", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockImplementation(() => {
        const error: any = new Error("Permission denied");
        error.code = "EACCES";
        throw error;
      });
      await handler.execute("list", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Permission denied"), "error");
    });

    it("should handle ENOENT file read error", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockImplementation(() => {
        const error: any = new Error("File not found");
        error.code = "ENOENT";
        throw error;
      });
      await handler.execute("list", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("File not found"), "error");
    });

    it("should handle generic file read error", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockImplementation(() => {
        throw new Error("Unknown error");
      });
      await handler.execute("list", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Unknown error"), "error");
    });
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
      expect(parseArgs('list "C:\\path" KEY')).toEqual(["list", "C:\\path", "KEY"]);
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

    it("should strip only balanced quotes (both opening and closing)", () => {
      expect(stripQuotes('"C:\\Program Files\\app"')).toBe("C:\\Program Files\\app");
      expect(stripQuotes("'path with spaces'")).toBe("path with spaces");
    });

    it("should NOT strip quotes that are not at start and end", () => {
      expect(stripQuotes('something"more"')).toBe('something"more"');
      expect(stripQuotes('start"middle')).toBe('start"middle');
    });
  });

  describe("quoted path handling", () => {
    it("should handle double-quoted path", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("QUOTED_VAR=test");
      vi.spyOn(path, "basename").mockReturnValue("test.env");

      await handler.execute('"C:\\tmp\\test.env" list', mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Found"), "info");
    });

    it("should handle single-quoted path", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("SINGLE_QUOTED=value");
      vi.spyOn(path, "basename").mockReturnValue(".env");

      await handler.execute("'./custom.env' list", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Found"), "info");
    });

    it("should handle quoted path with spaces", async () => {
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

      await handler.execute('"C:\\config\\.env" get DB_PASSWORD', mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("DB_PASSWORD="), "info");
    });
  });
});