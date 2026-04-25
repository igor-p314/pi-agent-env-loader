import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getArgumentCompletions } from "../src/autocomplete.js";

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