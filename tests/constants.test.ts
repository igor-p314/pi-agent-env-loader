import { describe, it, expect } from "vitest";
import { isWindows, CYCLE_WARNING_KEY, DEFAULT_SEPARATOR, COMMANDS, COMMANDS_NO_ENV } from "../src/constants.js";

describe("isWindows", () => {
  it("should return boolean", () => {
    const result = isWindows();
    expect(typeof result).toBe("boolean");
  });

  it("should be consistent with actual platform", () => {
    const result = isWindows();
    const actual = process.platform === "win32";
    expect(result).toBe(actual);
  });
});

describe("CYCLE_WARNING_KEY", () => {
  it("should be '__CYCLE__'", () => {
    expect(CYCLE_WARNING_KEY).toBe("__CYCLE__");
  });
});

describe("DEFAULT_SEPARATOR", () => {
  it("should be semicolon on Windows", () => {
    // When actual platform is Windows, separator must be ';'
    if (process.platform === "win32") {
      expect(DEFAULT_SEPARATOR).toBe(";");
    }
  });

  it("should be colon on Unix", () => {
    // When actual platform is not Windows, separator must be ':'
    if (process.platform !== "win32") {
      expect(DEFAULT_SEPARATOR).toBe(":");
    }
  });
});

describe("COMMANDS", () => {
  it("should contain all subcommands", () => {
    expect(COMMANDS).toContain("list");
    expect(COMMANDS).toContain("get");
    expect(COMMANDS).toContain("set");
    expect(COMMANDS).toContain("help");
  });

  it("should have correct length", () => {
    expect(COMMANDS.length).toBe(4);
  });
});

describe("COMMANDS_NO_ENV", () => {
  it("should contain commands that don't require a .env file", () => {
    expect(COMMANDS_NO_ENV.has("help")).toBe(true);
    expect(COMMANDS_NO_ENV.has("set")).toBe(true);
  });

  it("should not contain file-requiring commands", () => {
    expect(COMMANDS_NO_ENV.has("list")).toBe(false);
    expect(COMMANDS_NO_ENV.has("get")).toBe(false);
  });
});