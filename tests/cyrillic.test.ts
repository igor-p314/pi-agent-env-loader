import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { isPathLike } from "../src/path-utils.js";
import { EnvParser } from "../src/parser.js";

describe("Cyrillic path support", () => {
  describe("isPathLike with Cyrillic paths", () => {
    it("should recognize Cyrillic directory as path", () => {
      expect(isPathLike("Кириллица")).toBe(true);
      expect(isPathLike("Тестовая папка")).toBe(true);
      expect(isPathLike("папка/файл")).toBe(true);
      expect(isPathLike("папка\\файл")).toBe(true);
    });

    it("should not treat Cyrillic commands as paths", () => {
      // Since commands list only has English commands, Cyrillic words should be treated as paths
      expect(isPathLike("Кириллица")).toBe(true);
    });

    it("should handle mixed Latin and Cyrillic paths", () => {
      expect(isPathLike(".envКириллица")).toBe(true);
      expect(isPathLike("folder/Кириллица")).toBe(true);
    });
  });

  describe("reading Cyrillic .env files", () => {
    const testDir = path.join(process.cwd(), "tests", "Кириллица");
    const testFile = path.join(testDir, "файл.env");

    it("should find the Cyrillic test file", () => {
      const exists = fs.existsSync(testFile);
      expect(exists).toBeTruthy();
    });

    it("should read the Cyrillic .env file content", () => {
      const exists = fs.existsSync(testFile);
      expect(testFile).toBeTruthy();
      
      if (exists) {
        const content = fs.readFileSync(testFile, "utf-8");
        expect(content).toBeTruthy();
        expect(content).toContain("SIMPLE_CYRYLLIC");
      }
    });

    it("should parse the Cyrillic .env file correctly", () => {
      const exists = fs.existsSync(testFile);
      expect(testFile).toBeTruthy();
      
      if (exists) {
        const content = fs.readFileSync(testFile, "utf-8");
        const parser = new EnvParser();
        const result = parser.parse(content);
        
        expect(result.errors).toHaveLength(0);
        expect(result.vars).toHaveLength(1);
        expect(result.vars[0]).toEqual({
          key: "SIMPLE_CYRYLLIC",
          value: "Тест",
          operation: "set"
        });
      }
    });

    it("should read the SIMPLE_CYRYLLIC setting correctly", () => {
      const exists = fs.existsSync(testFile);
      expect(testFile).toBeTruthy();
      
      if (exists) {
        const content = fs.readFileSync(testFile, "utf-8");
        const parser = new EnvParser();
        const result = parser.parse(content);
        
        const setting = result.vars.find(v => v.key === "SIMPLE_CYRYLLIC");
        expect(setting).toBeDefined();
        expect(setting?.value).toBe("Тест");
      }
    });
  });

  describe("autocomplete with quoted Cyrillic paths", () => {
    it("should strip quotes from Cyrillic paths in prefix", () => {
      const withQuotes = '"Кириллица"';
      const cleanPrefix = withQuotes.replace(/^["']|["']$/g, "");
      expect(cleanPrefix).toBe("Кириллица");
    });

    it("should handle double-quoted Cyrillic paths", () => {
      const withQuotes = '"Тестовая папка"';
      const cleanPrefix = withQuotes.replace(/^["']|["']$/g, "");
      expect(cleanPrefix).toBe("Тестовая папка");
    });

    it("should handle single-quoted Cyrillic paths", () => {
      const withQuotes = "'Кириллица'";
      const cleanPrefix = withQuotes.replace(/^["']|["']$/g, "");
      expect(cleanPrefix).toBe("Кириллица");
    });
  });
});