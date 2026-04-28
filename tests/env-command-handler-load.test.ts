import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EnvCommandHandler } from "../src/env-command-handler.js";
import { EnvParser } from "../src/parser.js";
import { EnvCollector } from "../src/collector.js";
import { ProcessEnvProvider } from "../src/types.js";
import * as fs from "node:fs";
import * as path from "node:path";

vi.mock("node:fs");
vi.mock("node:path");

describe("EnvCommandHandler - Load and Error Handling", () => {
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

  describe("default load command", () => {
    it("should load variables from .env", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("NEW_VAR=newvalue");
      await handler.execute("", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Loaded"), "info");
    });

    it("should load from custom path", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("CUSTOM=test");
      vi.mocked(path.isAbsolute).mockReturnValue(false);
      await handler.execute(".env.local", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Loaded"), "info");
    });

    it("should notify if file empty", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("");
      await handler.execute("", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith("File is empty or invalid", "info");
    });

    it("should notify file not found for custom path", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      await handler.execute("/custom/path/.env", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("File not found"), "warning");
    });

    it("should notify correctly when all vars are protected", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("PATH=/usr/bin\nHOME=/home/user");
      await handler.execute("", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("protected"), "info");
    });

    it("should notify correctly when all vars already exist", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("_ALREADY_SET_VAR=test");
      process.env._ALREADY_SET_VAR = "existing";
      await handler.execute("", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("already set"), "info");
      delete process.env._ALREADY_SET_VAR;
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
      await handler.execute(".env list", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Permission denied"), "error");
    });

    it("should handle ENOENT file read error", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockImplementation(() => {
        const error: any = new Error("File not found");
        error.code = "ENOENT";
        throw error;
      });
      await handler.execute(".env list", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("File not found"), "error");
    });

    it("should handle generic file read error", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockImplementation(() => {
        throw new Error("Unknown error");
      });
      await handler.execute(".env list", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Unknown error"), "error");
    });
  });
});
