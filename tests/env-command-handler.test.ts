import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EnvCommandHandler } from "../src/env-command-handler.js";
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
      expect(mockNotify).toHaveBeenCalledTimes(2); // title + content
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
      // The notification should contain masked value
      const notifyCall = mockNotify.mock.calls.find(call => call[0].includes("Set SECRET_KEY="));
      expect(notifyCall).toBeTruthy();
      expect(notifyCall[0]).toContain("*"); // masked
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
      // Should notify about found variables
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Found"), "info");
    });
  });

  describe("get command", () => {
    it("should show usage when no key provided", async () => {
      // Mock file exists and has content
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("KEY1=value1");
      await handler.execute("get", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith("Usage: /env get KEY", "warning");
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
  });

  describe("reload command", () => {
    it("should reload variables", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("KEY1=value1");
      await handler.execute("reload", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Reloaded"), "info");
    });
  });

  describe("default load command", () => {
    it("should load variables from .env", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("NEW_VAR=newvalue");
      await handler.execute("", mockCtx); // no command, default load
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Loaded"), "info");
    });

    it("should notify if file empty", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("");
      await handler.execute("", mockCtx);
      expect(mockNotify).toHaveBeenCalledWith("File is empty or invalid", "info");
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
  });
});
