import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EnvCommandHandler } from "../src/env-command-handler.js";
import { EnvParser } from "../src/parser.js";
import { EnvCollector } from "../src/collector.js";
import { ProcessEnvProvider } from "../src/types.js";
import * as fs from "node:fs";
import * as path from "node:path";

vi.mock("node:fs");
vi.mock("node:path");

describe("EnvCommandHandler - Commands", () => {
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
      expect(mockNotify.mock.calls[0][0]).toContain("/env list");
      expect(mockNotify.mock.calls[0][0]).toContain("/env <PATH> list");
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
    describe("/env list — env vars", () => {
      it("should list currently set env variables", async () => {
        process.env._TEST_KEY_123 = "test_value";
        await handler.execute("list", mockCtx);
        expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("environment variable"), "info");
        const allNotify = mockNotify.mock.calls.map((c) => c[0]);
        const combined = allNotify.join("\n");
        expect(combined).toContain("_TEST_KEY_123=test_value");
        delete process.env._TEST_KEY_123;
      });

      it("should mask secret keys in list output", async () => {
        process.env._MY_SECRET = "s3cr3t_value";
        await handler.execute("list", mockCtx);
        const allNotify = mockNotify.mock.calls.map((c) => c[0]);
        const combined = allNotify.join("\n");
        expect(combined).toContain("_MY_SECRET");
        expect(combined).toContain("*");
        expect(combined).not.toContain("s3cr3t_value");
        delete process.env._MY_SECRET;
      });

      it("should truncate long values", async () => {
        process.env._TEST_LONG_123 = "x".repeat(100);
        await handler.execute("list", mockCtx);
        const allNotify = mockNotify.mock.calls.map((c) => c[0]);
        const combined = allNotify.join("\n");
        expect(combined).toContain("_TEST_LONG_123");
        expect(combined).toContain("...");
        delete process.env._TEST_LONG_123;
      });
    });

    describe("/env <path> list — from file", () => {
      it("should list variables from file", async () => {
        vi.spyOn(fs, "existsSync").mockReturnValue(true);
        vi.spyOn(fs, "readFileSync").mockReturnValue("KEY1=value1\nSECRET=confidential");
        vi.mocked(path.basename).mockReturnValue(".env");
        await handler.execute(".env list", mockCtx);
        expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Found"), "info");
      });

      it("should list variables from absolute path", async () => {
        vi.spyOn(fs, "existsSync").mockReturnValue(true);
        vi.spyOn(fs, "readFileSync").mockReturnValue("CUSTOM_VAR=custom");
        vi.mocked(path.isAbsolute).mockReturnValue(true);
        vi.mocked(path.basename).mockReturnValue(".env.local");
        await handler.execute("/abs/path/.env.local list", mockCtx);
        expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("in .env.local"), "info");
      });

      it("should notify file not found", async () => {
        vi.spyOn(fs, "existsSync").mockReturnValue(false);
        await handler.execute("/missing.env list", mockCtx);
        expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("File not found"), "warning");
      });
    });
  });

  describe("get command", () => {
    describe("/env get KEY — from env", () => {
      it("should show usage when no key provided", async () => {
        await handler.execute("get", mockCtx);
        expect(mockNotify).toHaveBeenCalledWith(
          expect.stringContaining("Usage: /env get KEY"),
          "warning"
        );
      });

      it("should get existing variable from process.env", async () => {
        process.env._GET_TEST_VAR = "hello_world";
        await handler.execute("get _GET_TEST_VAR", mockCtx);
        expect(mockNotify).toHaveBeenCalledWith("_GET_TEST_VAR=hello_world", "info");
        delete process.env._GET_TEST_VAR;
      });

      it("should notify when variable not set in env", async () => {
        await handler.execute("get _NONEXISTENT_KEY_XYZ", mockCtx);
        expect(mockNotify).toHaveBeenCalledWith(
          expect.stringContaining("not set in environment"),
          "warning"
        );
      });

      it("should mask secret key in get from env", async () => {
        process.env._TEST_TOKEN = "s3cr3t";
        await handler.execute("get _TEST_TOKEN", mockCtx);
        expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("_TEST_TOKEN=s3"), "info");
        delete process.env._TEST_TOKEN;
      });
    });

    describe("/env <path> get KEY — from file", () => {
      it("should get variable from file", async () => {
        vi.spyOn(fs, "existsSync").mockReturnValue(true);
        vi.spyOn(fs, "readFileSync").mockReturnValue("KEY1=value1");
        vi.mocked(path.basename).mockReturnValue(".env");
        await handler.execute(".env get KEY1", mockCtx);
        expect(mockNotify).toHaveBeenCalledWith("KEY1=value1", "info");
      });

      it("should notify when variable not found in file", async () => {
        vi.spyOn(fs, "existsSync").mockReturnValue(true);
        vi.spyOn(fs, "readFileSync").mockReturnValue("OTHER=exists");
        vi.mocked(path.basename).mockReturnValue(".env.prod");
        await handler.execute(".env.prod get MISSING_KEY", mockCtx);
        expect(mockNotify).toHaveBeenCalledWith(
          expect.stringContaining("Variable 'MISSING_KEY' not found"),
          "warning"
        );
      });

      it("should notify file not found for custom path", async () => {
        vi.spyOn(fs, "existsSync").mockReturnValue(false);
        await handler.execute("/missing/.env get KEY", mockCtx);
        expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("File not found"), "warning");
      });

      it("should show usage when key missing after path get", async () => {
        await handler.execute(".env get", mockCtx);
        expect(mockNotify).toHaveBeenCalledWith(
          expect.stringContaining("Usage: /env <PATH> get KEY"),
          "warning"
        );
      });
    });
  });
});
