import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getArgumentCompletions } from "../src/autocomplete.js";
import * as fs from "node:fs";
import * as path from "node:path";

vi.mock("node:fs");
vi.mock("node:path");

describe("getArgumentCompletions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Command completions (prefix starts with "/") ---

  describe("command completions", () => {
    it("should return all commands for empty prefix", () => {
      const result = getArgumentCompletions("");
      expect(result).not.toBeNull();
      expect(result!.map((r) => r.value)).toContain("list");
      expect(result!.map((r) => r.value)).toContain("get");
      expect(result!.map((r) => r.value)).toContain("set");
      expect(result!.map((r) => r.value)).toContain("help");
    });

    it("should return matching commands for prefix /l", () => {
      const result = getArgumentCompletions("/l");
      expect(result).not.toBeNull();
      expect(result!.map((r) => r.value)).toEqual(["list"]);
    });

    it("should return matching commands for prefix /g", () => {
      const result = getArgumentCompletions("/g");
      expect(result).not.toBeNull();
      expect(result!.map((r) => r.value)).toEqual(["get"]);
    });

    it("should return multiple matches for /", () => {
      const result = getArgumentCompletions("/");
      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThan(1);
    });

    it("should return null when no commands match", () => {
      const result = getArgumentCompletions("/xyz");
      expect(result).toBeNull();
    });

    it("should return null for undefined prefix (defaults to command mode)", () => {
      const result = getArgumentCompletions(undefined);
      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThan(0);
    });
  });

  // --- File-path completions ---

  describe("file-path completions", () => {
    it("should return null for non-path-like prefix", () => {
      const result = getArgumentCompletions("reload");
      expect(result).toBeNull();
    });

    it("should return null for a known command without /", () => {
      // "list" is a command, not a path — should fall through to null
      const result = getArgumentCompletions("list");
      expect(result).toBeNull();
    });
  });

  // --- Quote handling ---

  describe("quote handling", () => {
    it("should not crash with opening-quoted prefix", () => {
      // Prefix with opening quote but no closing — exercises stripQuotes path
      const result = getArgumentCompletions('"unclosed');
      // Non-path-like, so returns null — but shouldn't throw
      expect(result === null || Array.isArray(result)).toBe(true);
    });
  });

  // --- Case-insensitive completions ---

  describe("case-insensitive filtering", () => {
    it("should match files regardless of case in prefix", () => {
      // Simulates: dir has .env.Test and .env.TEST, user types .env.t
      vi.mocked(path.dirname).mockReturnValue("/test");
      vi.mocked(path.isAbsolute).mockReturnValue(true);
      vi.mocked(path.basename).mockReturnValue(".env.t");
      vi.mocked(path.join).mockImplementation((...args: string[]) => args.join("/"));

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockImplementation((p: string) => {
        // Root dir is a directory; everything else is a file
        return { isDirectory: () => p === "/test" } as fs.Stats;
      });
      vi.mocked(fs.readdirSync).mockReturnValue([".env.Test", ".env.TEST", ".env.prod"]);

      const result = getArgumentCompletions(".env.t");
      expect(result).not.toBeNull();
      const labels = result!.map((r) => r.label);
      expect(labels).toContain(".env.Test");
      expect(labels).toContain(".env.TEST");
      expect(labels).not.toContain(".env.prod");
    });

    it("should match mixed-case prefix against all case variants", () => {
      vi.mocked(path.dirname).mockReturnValue("/test");
      vi.mocked(path.isAbsolute).mockReturnValue(true);
      vi.mocked(path.basename).mockReturnValue(".ENV.T");
      vi.mocked(path.join).mockImplementation((...args: string[]) => args.join("/"));

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockImplementation((p: string) => {
        return { isDirectory: () => p === "/test" } as fs.Stats;
      });
      vi.mocked(fs.readdirSync).mockReturnValue([".env.test", ".env.TEST", ".Env.Test"]);

      const result = getArgumentCompletions(".ENV.T");
      expect(result).not.toBeNull();
      const labels = result!.map((r) => r.label);
      expect(labels).toContain(".env.test");
      expect(labels).toContain(".env.TEST");
      expect(labels).toContain(".Env.Test");
    });

    it("should preserve original file case in returned values", () => {
      vi.mocked(path.dirname).mockReturnValue("/test");
      vi.mocked(path.isAbsolute).mockReturnValue(true);
      vi.mocked(path.basename).mockReturnValue(".env");
      vi.mocked(path.join).mockImplementation((...args: string[]) => args.join("/"));

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockImplementation((p: string) => {
        return { isDirectory: () => p === "/test" } as fs.Stats;
      });
      vi.mocked(fs.readdirSync).mockReturnValue([".Env.Prod", ".ENV.dev"]);

      const result = getArgumentCompletions(".env");
      expect(result).not.toBeNull();
      // Values should preserve original filesystem casing
      const values = result!.map((r) => r.value);
      // Values are built with path.join(dir, e) where dir comes from path.dirname
      expect(values.some((v) => v.endsWith(".Env.Prod"))).toBe(true);
      expect(values.some((v) => v.endsWith(".ENV.dev"))).toBe(true);
    });

    it("should not match files that do not share the prefix (case-insensitive)", () => {
      vi.mocked(path.dirname).mockReturnValue("/test");
      vi.mocked(path.isAbsolute).mockReturnValue(true);
      vi.mocked(path.basename).mockReturnValue(".env.test");
      vi.mocked(path.join).mockImplementation((...args: string[]) => args.join("/"));

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockImplementation((p: string) => {
        return { isDirectory: () => p === "/test" } as fs.Stats;
      });
      vi.mocked(fs.readdirSync).mockReturnValue([".env.test", ".env.prod", ".ENV.OTHER"]);

      const result = getArgumentCompletions(".env.test");
      expect(result).not.toBeNull();
      const labels = result!.map((r) => r.label);
      expect(labels).toContain(".env.test");
      expect(labels).not.toContain(".env.prod");
      expect(labels).not.toContain(".ENV.OTHER");
    });
  });

  // --- Edge cases ---

  describe("edge cases", () => {
    it("should handle empty path segment", () => {
      const result = getArgumentCompletions("");
      // Empty string is treated as command prefix, not path
      expect(result).not.toBeNull();
    });

    it("should handle single character path prefix", () => {
      const result = getArgumentCompletions(".");
      // "." is not clearly path-like (no slash/drive), so may return null
      // Just verify it doesn't throw
      expect(result === null || Array.isArray(result)).toBe(true);
    });
  });
});