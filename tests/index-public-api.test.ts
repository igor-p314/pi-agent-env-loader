import { describe, it, expect } from "vitest";
import {
  interpolateValue,
  collectEnvChanges,
  maskValue,
  isSecretKey,
  isProtectedKey,
  parseEnvFile,
  applyEnvChanges,
} from "../src/index.js";

describe("index.ts — public API", () => {
  describe("interpolateValue", () => {
    it("should interpolate ${VAR} references", () => {
      const result = interpolateValue("Hello ${NAME}", undefined, [], { NAME: "world" });
      expect(result).toBe("Hello world");
    });

    it("should interpolate $VAR (no braces) references", () => {
      const result = interpolateValue("Path is $HOME/bin", undefined, [], { HOME: "/home/user" });
      expect(result).toBe("Path is /home/user/bin");
    });

    it("should return empty string for unknown vars", () => {
      const warnings: any[] = [];
      const result = interpolateValue("${UNKNOWN_VAR}", undefined, warnings);
      expect(result).toBe("");
      expect(warnings.length).toBeGreaterThan(0);
    });

    it("should handle recursive interpolation with depth limit", () => {
      const warnings: any[] = [];
      // A -> B -> C (depth 2)
      const result = interpolateValue("${A}", 2, warnings, { A: "${B}", B: "${C}" });
      expect(result).toBe("${C}"); // stops after 2 levels
    });

    it("should detect cycles and warn", () => {
      const warnings: any[] = [];
      interpolateValue("${A}", undefined, warnings, { A: "${B}", B: "${A}" });
      const cycleWarning = warnings.find((w: any) => w.varName === "__CYCLE__");
      expect(cycleWarning).toBeDefined();
    });

    it("should handle empty value", () => {
      const result = interpolateValue("", undefined, []);
      expect(result).toBe("");
    });

    it("should handle multiple interpolations in one value", () => {
      const result = interpolateValue("${A} and ${B}", undefined, [], { A: "first", B: "second" });
      expect(result).toBe("first and second");
    });

    it("should handle Windows-style paths with interpolation", () => {
      const result = interpolateValue("C:\\Users\\${USER}\\AppData", undefined, [], { USER: "admin" });
      expect(result).toBe("C:\\Users\\admin\\AppData");
    });

    it("should handle custom maxDepth parameter", () => {
      const warnings: any[] = [];
      // A -> B, depth=1 means only one level of interpolation
      const result = interpolateValue("${A}", 1, warnings, { A: "${B}", B: "final" });
      expect(result).toBe("${B}"); // stops after depth 1
    });

    it("should return empty string for undefined default env parameter", () => {
      const warnings: any[] = [];
      const result = interpolateValue("${VAR}", undefined, warnings);
      expect(result).toBe("");
    });
  });

  describe("collectEnvChanges", () => {
    it("should collect new variables from empty env", () => {
      const result = collectEnvChanges([{ key: "NEW_VAR", value: "val" }], {});
      expect(result.toSet.has("NEW_VAR")).toBe(true);
      expect(result.toSet.get("NEW_VAR")).toBe("val");
    });

    it("should handle append with existing value (adds separator on Win)", () => {
      const result = collectEnvChanges(
        [{ key: "VAR", value: "suffix", operation: "append" }],
        { VAR: "prefix" },
        false
      );
      const sep = process.platform === "win32" ? ";" : ":";
      expect(result.toSet.get("VAR")).toBe("prefix" + sep + "suffix");
    });

    it("should handle prepend with existing value (adds separator on Win)", () => {
      const result = collectEnvChanges(
        [{ key: "VAR", value: "new_", operation: "prepend" }],
        { VAR: "existing" },
        false
      );
      const sep = process.platform === "win32" ? ";" : ":";
      expect(result.toSet.get("VAR")).toBe("new_" + sep + "existing");
    });

    it("should skip protected variables", () => {
      const result = collectEnvChanges([{ key: "PATH", value: "/usr/bin" }], {});
      expect(result.toSet.has("PATH")).toBe(false);
      expect(result.skipped.some((s) => s.key === "PATH" && s.reason === "protected")).toBe(true);
    });

    it("should handle append with no existing env value", () => {
      const result = collectEnvChanges(
        [{ key: "NEW", value: "val", operation: "append" }],
        {},
        false
      );
      expect(result.toSet.has("NEW")).toBe(true);
      // When no existing value, append still adds separator prefix
      const sep = process.platform === "win32" ? ";" : ":";
      expect(result.toSet.get("NEW")).toBe(sep + "val");
    });

    it("should handle empty vars array", () => {
      const result = collectEnvChanges([], {});
      expect(result.toSet.size).toBe(0);
      expect(result.skipped.length).toBe(0);
    });

    it("should apply interpolation before collecting", () => {
      const result = collectEnvChanges(
        [{ key: "B", value: "${A}" }],
        { A: "resolved" },
        false
      );
      expect(result.toSet.get("B")).toBe("resolved");
    });

    it("should generate warnings for interpolation issues", () => {
      const result = collectEnvChanges(
        [{ key: "VAR", value: "${UNDEFINED_REF}" }],
        {},
        false
      );
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("should handle multiple variables in one call", () => {
      const result = collectEnvChanges(
        [
          { key: "A", value: "1" },
          { key: "B", value: "2" },
          { key: "PATH", value: "skip_me" }, // protected
        ],
        {},
        false
      );
      expect(result.toSet.has("A")).toBe(true);
      expect(result.toSet.has("B")).toBe(true);
      expect(result.toSet.has("PATH")).toBe(false);
    });

    it("should handle default operation with no existing (sets directly)", () => {
      const result = collectEnvChanges(
        [{ key: "NEW", value: "val", operation: "default" }],
        {},
        false
      );
      expect(result.toSet.has("NEW")).toBe(true);
    });

    it("should skip default operation when variable exists (even with force)", () => {
      const result = collectEnvChanges(
        [{ key: "EXISTING", value: "new_val", operation: "default" }],
        { EXISTING: "old_val" },
        true // force doesn't override 'default' semantics
      );
      expect(result.toSet.has("EXISTING")).toBe(false);
    });
  });

  describe("maskValue (from index)", () => {
    it("should mask long values with default showChars=2", () => {
      const masked = maskValue("supersecretpassword");
      expect(masked).toBe("su" + "*".repeat(17));
      expect(masked.length).toBe(19);
    });

    it("should allow custom showChars", () => {
      const masked = maskValue("password123", 4);
      // password123 = 11 chars. showChars=4: "pass" + 7 stars = 11 total
      expect(masked).toBe("pass*******");
      expect(masked.length).toBe(11);
    });

    it("should handle short values (no masking needed)", () => {
      expect(maskValue("ab")).toBe("ab");
      expect(maskValue("a")).toBe("a");
    });

    it("should handle empty string", () => {
      expect(maskValue("")).toBe("");
    });

    it("should preserve length after masking", () => {
      const original = "my_secret_value";
      const masked = maskValue(original);
      expect(masked.length).toBe(original.length);
    });
  });

  describe("isSecretKey (from index)", () => {
    it("should detect secret keys by pattern", () => {
      expect(isSecretKey("API_KEY")).toBe(true);
      expect(isSecretKey("MY_PASSWORD")).toBe(true);
      expect(isSecretKey("AUTH_TOKEN")).toBe(true);
      expect(isSecretKey("PRIVATE_KEY")).toBe(true);
    });

    it("should not flag normal keys", () => {
      expect(isSecretKey("NORMAL_VAR")).toBe(false);
      expect(isSecretKey("DATABASE_URL")).toBe(false);
    });

    it("should handle case-insensitive detection", () => {
      expect(isSecretKey("api_key")).toBe(true);
      expect(isSecretKey("Password")).toBe(true);
    });

    it("should not detect non-ASCII keys as secret", () => {
      expect(isSecretKey("API_КЛЮЧ")).toBe(false);
    });
  });

  describe("isProtectedKey (from index)", () => {
    it("should recognize protected system variables", () => {
      expect(isProtectedKey("PATH")).toBe(true);
      expect(isProtectedKey("HOME")).toBe(true);
      expect(isProtectedKey("USER")).toBe(true);
      expect(isProtectedKey("SHELL")).toBe(true);
    });

    it("should not flag user variables", () => {
      expect(isProtectedKey("MY_VAR")).toBe(false);
      expect(isProtectedKey("APP_CONFIG")).toBe(false);
    });

    it("should be case-insensitive", () => {
      expect(isProtectedKey("path")).toBe(true);
      expect(isProtectedKey("Path")).toBe(true);
    });
  });

  describe("parseEnvFile (from index)", () => {
    it("should parse simple KEY=VALUE pairs", () => {
      const result = parseEnvFile("KEY=value");
      expect(result.vars.length).toBe(1);
      expect(result.vars[0].key).toBe("KEY");
      expect(result.vars[0].value).toBe("value");
      expect(result.vars[0].operation).toBe("set");
    });

    it("should handle multiple variables", () => {
      const result = parseEnvFile("A=1\nB=2\nC=3");
      expect(result.vars.length).toBe(3);
    });

    it("should skip comments and blank lines", () => {
      const result = parseEnvFile("# comment\n\nKEY=value\n  # indented comment");
      expect(result.vars.length).toBe(1);
      expect(result.errors.length).toBe(0);
    });

    it("should handle export prefix", () => {
      const result = parseEnvFile("export KEY=value");
      expect(result.vars[0].key).toBe("KEY");
    });

    it("should handle operators (default, append, prepend)", () => {
      const result = parseEnvFile("A?=val\nB+=append\nC-=prepend");
      expect(result.vars[0].operation).toBe("default");
      expect(result.vars[1].operation).toBe("append");
      expect(result.vars[2].operation).toBe("prepend");
    });

    it("should handle quoted values", () => {
      const result = parseEnvFile('KEY="quoted value"');
      expect(result.vars[0].value).toBe("quoted value");
    });

    it("should report errors for invalid lines", () => {
      const result = parseEnvFile("123INVALID=value");
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should return empty vars for empty content", () => {
      const result = parseEnvFile("");
      expect(result.vars.length).toBe(0);
    });
  });

  describe("applyEnvChanges (from index)", () => {
    it("should apply changes to process.env", () => {
      const result = collectEnvChanges([{ key: "TEST_APPLY_VAR", value: "test_value" }], {});
      expect(result.toSet.has("TEST_APPLY_VAR")).toBe(true);

      applyEnvChanges(result);
      expect(process.env["TEST_APPLY_VAR"]).toBe("test_value");

      // Cleanup
      delete process.env["TEST_APPLY_VAR"];
    });

    it("should handle empty changes", () => {
      const result = collectEnvChanges([], {});
      applyEnvChanges(result); // should not throw
    });
  });
});
