import { describe, it, expect } from "vitest";
import { isPathLike } from "../src/path-utils.js";

describe("isPathLike", () => {
  it("should return false for commands", () => {
    expect(isPathLike("help")).toBe(false);
    expect(isPathLike("list")).toBe(false);
    expect(isPathLike("get")).toBe(false);
    expect(isPathLike("set")).toBe(false);
    expect(isPathLike("reload")).toBe(false);
  });

  it("should return true for relative paths starting with ./ or ../", () => {
    expect(isPathLike("./config.env")).toBe(true);
    expect(isPathLike("../.env")).toBe(true);
    expect(isPathLike(".")).toBe(true);
    expect(isPathLike("..")).toBe(true);
  });

  it("should return true for dotfiles", () => {
    expect(isPathLike(".env")).toBe(true);
    expect(isPathLike(".config")).toBe(true);
  });

  it("should return false for strings starting with .. but not path", () => {
    expect(isPathLike("..env")).toBe(false);
  });

  it("should return true for paths with / or \\", () => {
    expect(isPathLike("src/.env")).toBe(true);
    expect(isPathLike("C:\\Projects\\.env")).toBe(true);
    expect(isPathLike("C:/Projects/.env")).toBe(true);
  });

  it("should return true for Windows drive letters", () => {
    expect(isPathLike("C:")).toBe(true);
    expect(isPathLike("D:")).toBe(true);
  });

  it("should return true for files with extensions", () => {
    expect(isPathLike("file.env")).toBe(true);
    expect(isPathLike("config.json")).toBe(true);
  });

  it("should support Unicode characters in paths", () => {
    expect(isPathLike("проекты/настройки.env")).toBe(true);
    expect(isPathLike("Проекты/.env")).toBe(true);
  });
});
