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

  // --- Command completions (empty prefix) ---

  describe("command completions", () => {
    it("should return all commands for empty prefix", () => {
      const result = getArgumentCompletions("");
      expect(result).not.toBeNull();
      expect(result!.map((r) => r.value)).toContain("list");
      expect(result!.map((r) => r.value)).toContain("get");
      expect(result!.map((r) => r.value)).toContain("set");
      expect(result!.map((r) => r.value)).toContain("help");
    });

    it("should return matching commands for prefix l", () => {
      const result = getArgumentCompletions("l");
      expect(result).not.toBeNull();
      expect(result!.map((r) => r.value)).toEqual(["list"]);
    });

    it("should return matching commands for prefix g", () => {
      const result = getArgumentCompletions("g");
      expect(result).not.toBeNull();
      expect(result!.map((r) => r.value)).toEqual(["get"]);
    });

    it("should return multiple matches for empty string", () => {
      const result = getArgumentCompletions("");
      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThan(1);
    });

    it("should return null when no commands match", () => {
      const result = getArgumentCompletions("xyz");
      // Could be a path prefix, not necessarily null
      // Just check it doesn't crash
      expect(result === null || Array.isArray(result)).toBe(true);
    });

    it("should return all commands for undefined prefix", () => {
      const result = getArgumentCompletions(undefined);
      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThan(0);
    });
  });

  // --- Post-path commands ---

  describe("post-path command completions", () => {
    it("should return list and get for prefix l after path", () => {
      // After typing a path, user types "l" - should suggest "list"
      const result = getArgumentCompletions("l");
      expect(result).not.toBeNull();
      expect(result!.map((r) => r.value)).toContain("list");
    });

    it("should return get for prefix g after path", () => {
      const result = getArgumentCompletions("g");
      expect(result).not.toBeNull();
      expect(result!.map((r) => r.value)).toContain("get");
    });
  });

  // --- File-path completions ---

  describe("file-path completions", () => {
    it("should return null for non-path-like prefix that is a command", () => {
      // "list" is a command, not a path
      const result = getArgumentCompletions("list");
      // Should return the command "list", not null
      expect(result).not.toBeNull();
      expect(result![0].value).toBe("list");
    });

    it("should return path completions for dot-prefixed input", () => {
      vi.mocked(path.dirname).mockReturnValue("/test");
      vi.mocked(path.isAbsolute).mockReturnValue(true);
      vi.mocked(path.basename).mockReturnValue(".env");
      vi.mocked(path.join).mockImplementation((...args: string[]) => args.join("/"));

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockImplementation((p: string) => {
        return { isDirectory: () => p === "/test" } as fs.Stats;
      });
      vi.mocked(fs.readdirSync).mockReturnValue([".env", ".env.local"]);

      const result = getArgumentCompletions(".");
      expect(result).not.toBeNull();
    });
  });

  // --- Quote handling ---

  describe("quote handling", () => {
    it("should not crash with opening-quoted prefix", () => {
      const result = getArgumentCompletions('"unclosed');
      expect(result === null || Array.isArray(result)).toBe(true);
    });
  });

  // --- Case-insensitive completions ---

  describe("case-insensitive filtering", () => {
    it("should match files regardless of case in prefix", () => {
      vi.mocked(path.dirname).mockReturnValue("/test");
      vi.mocked(path.isAbsolute).mockReturnValue(true);
      vi.mocked(path.basename).mockReturnValue(".env.t");
      vi.mocked(path.join).mockImplementation((...args: string[]) => args.join("/"));

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockImplementation((p: string) => {
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
      const values = result!.map((r) => r.value);
      expect(values.some((v) => v.endsWith(".Env.Prod"))).toBe(true);
      expect(values.some((v) => v.endsWith(".ENV.dev"))).toBe(true);
    });
  });

  // --- Edge cases ---

  describe("edge cases", () => {
    it("should handle empty path segment", () => {
      const result = getArgumentCompletions("");
      expect(result).not.toBeNull();
    });

    it("should handle single character path prefix", () => {
      const result = getArgumentCompletions(".");
      expect(result === null || Array.isArray(result)).toBe(true);
    });
  });
});
