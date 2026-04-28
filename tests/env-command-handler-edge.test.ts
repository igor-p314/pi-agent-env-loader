import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EnvCommandHandler } from "../src/env-command-handler.js";
import { EnvParser } from "../src/parser.js";
import { EnvCollector } from "../src/collector.js";
import { ProcessEnvProvider } from "../src/types.js";
import * as fs from "node:fs";
import * as path from "node:path";

vi.mock("node:fs");
vi.mock("node:path");

describe("EnvCommandHandler — edge cases и доп. покрытие", () => {
  let handler: EnvCommandHandler;
  let mockNotify: ReturnType<typeof vi.fn>;
  let mockCtx: any;

  beforeEach(() => {
    const envProvider = new ProcessEnvProvider();
    const collector = new EnvCollector(envProvider);
    const parser = new EnvParser();
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
    delete process.env._EDGE_TEST_123;
    delete process.env.MY_TOKEN;
    delete process.env._EDGE_LONG_789;
  });

describe("handleGetFromPath — переменная не найдена", () => {
  it("should notify when variable is not found in the file", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("EXISTING_VAR=value");
    vi.mocked(path.basename).mockReturnValue(".env");

    await handler.execute(".env get MISSING_KEY", mockCtx);
    expect(mockNotify).toHaveBeenCalledWith(
      expect.stringContaining("Variable 'MISSING_KEY' not found"),
      "warning"
    );
  });
});

describe("handleListEnv — edge cases", () => {
  it("should list vars and include the added test variable", async () => {
    process.env._EDGE_TEST_123 = "val";

    await handler.execute("list", mockCtx);

    // Verify one of the calls contains the test variable
    const allNotify = mockNotify.mock.calls.map((c: any[]) => c[0]);
    const combined = allNotify.join("\n");
    expect(combined).toContain("_EDGE_TEST_123=val");
    delete process.env._EDGE_TEST_123;
  });

  it("should mask secret keys in list output", async () => {
    process.env.MY_TOKEN = "supersecrettoken";

    await handler.execute("list", mockCtx);

    const allNotify = mockNotify.mock.calls.map((c: any[]) => c[0]);
    const combined = allNotify.join("\n");
    expect(combined).toContain("*");

    delete process.env.MY_TOKEN;
  });

  it("should truncate long non-secret values", async () => {
    process.env._EDGE_LONG_789 = "x".repeat(200);

    await handler.execute("list", mockCtx);

    const allNotify = mockNotify.mock.calls.map((c: any[]) => c[0]);
    const combined = allNotify.join("\n");
    expect(combined).toContain("...");

    delete process.env._EDGE_LONG_789;
  });
});

describe("handleGetFromPath — masked secret key", () => {
  it("should mask secret key from file", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("DB_SECRET=verysecretvalue");
    vi.mocked(path.basename).mockReturnValue(".env");

    await handler.execute(".env get DB_SECRET", mockCtx);

    expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("DB_SECRET="), "info");
    expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("ve"), "info");
  });

  it("should show unmasked value for normal key from file", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("MY_VAR=plainvalue");
    vi.mocked(path.basename).mockReturnValue(".env");

    await handler.execute(".env get MY_VAR", mockCtx);
    expect(mockNotify).toHaveBeenCalledWith("MY_VAR=plainvalue", "info");
  });
});

describe("handleListFromPath — empty vars", () => {
  it("should show Found 0 variable(s) when file has only comments", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("# only comments\n\n# blank lines");
    vi.mocked(path.basename).mockReturnValue(".env");

    await handler.execute(".env list", mockCtx);
    expect(mockNotify).toHaveBeenCalledWith("Found 0 variable(s) in .env", "info");
  });
});

describe("loadFile — parse warnings", () => {
  it("should show parse warnings from file", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("KEY=value\n123INVALID=bad\n=nokey");

    await handler.execute("", mockCtx);
    expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Parse warnings"), "warning");
  });

  it("should handle file with many errors (limit display)", async () => {
    const content = Array.from({ length: 15 }, (_, i) => `${i}INVALID=value`).join("\n");
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(content);

    await handler.execute("", mockCtx);
    expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("(+"), "warning");
  });
});

describe("resolvePath edge cases", () => {
  it("should strip quotes for quoted path with list", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("VAR=value");
    vi.mocked(path.basename).mockReturnValue("test.env");

    await handler.execute('"/abs/path/.env" list', mockCtx);
    expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Found"), "info");
  });

  it("should handle single-quoted quoted path", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("VAR=value");
    vi.mocked(path.basename).mockReturnValue("test.env");

    await handler.execute("'/abs/path/.env' list", mockCtx);
    expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Found"), "info");
  });
});

describe("handleSet — additional cases", () => {
  it("should mask values for secret keys in notification", async () => {
    // Use "set" command — doesn't touch fs
    await handler.execute("set MY_SECRET_KEY this_is_a_very_long_secret_value_to_mask", mockCtx);

    const setCall = mockNotify.mock.calls.find((call: any[]) =>
      (call[0] as string).includes("Set MY_SECRET_KEY=")
    );
    expect(setCall).toBeTruthy();
    // Secret key value should be masked
    expect((setCall![0] as string)).not.toContain("this_is_a_very_long_secret_value_to_mask");
    expect((setCall![0] as string)).toContain("*");
  });
});

describe("handleGetFromPath — get from file with multiple vars", () => {
  it("should find correct var among many", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("A=1\nB=2\nTARGET=this_is_the_one\nD=4");
    vi.mocked(path.basename).mockReturnValue(".env");

    await handler.execute(".env get TARGET", mockCtx);
    expect(mockNotify).toHaveBeenCalledWith("TARGET=this_is_the_one", "info");
  });
});

describe("handleList — from file with mixed secret/normal keys", () => {
  it("should mask secrets and truncate long normal values", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue([
      "NORMAL=short",
      "NORMAL_LONG=" + "x".repeat(100),
      "MY_KEY=secret",
    ].join("\n"));
    vi.mocked(path.basename).mockReturnValue(".env");

    await handler.execute(".env list", mockCtx);

    const allNotify = mockNotify.mock.calls.map((c: any[]) => c[0]);
    const combined = allNotify.join("\n");
    expect(combined).toContain("NORMAL=short");
    expect(combined).toContain("MY_KEY=se"); // masked
    expect(combined).toContain("..."); // truncated long value
  });
});

describe("execute — path-like commands", () => {
  it("should handle path-like argument followed by list", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("VAR=value");
    vi.mocked(path.basename).mockReturnValue("config.env");

    await handler.execute("config.env list", mockCtx);
    expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Found"), "info");
  });

  it("should handle relative path with list", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("VAR=value");
    vi.mocked(path.join).mockReturnValue("/fake/.env.local");
    vi.mocked(path.basename).mockReturnValue(".env.local");

    await handler.execute("./.env.local list", mockCtx);
    expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Found"), "info");
  });

  it("should treat bare command-like arg without path as command", async () => {
    await handler.execute("help", mockCtx);
    expect(mockNotify.mock.calls[0][0]).toContain("Env Loader");
  });
});

describe("mixed operations in one file", () => {
  it("should handle set, prepend, append, and default ops together", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue([
      "SET_VAR=set_value",
      "PREPEND_VAR-=prepend_val",
      "APPEND_VAR+=append_val",
      "DEFAULT_VAR?=default_val",
    ].join("\n"));

    await handler.execute("", mockCtx);
    expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Loaded"), "info");
  });
});

describe("Unicode support", () => {
  it("should handle Cyrillic values in variables", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("TEST_VAR=значение_на_кириллице");

    await handler.execute("", mockCtx);
    expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Loaded"), "info");
  });

  it("should handle Cyrillic paths in list context", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("SIMPLE_CYRYLLIC=Тест");
    vi.mocked(path.basename).mockReturnValue("файл.env");

    await handler.execute('"Кириллица/файл.env" list', mockCtx);
    expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Found"), "info");
  });
});

describe("interpolation during load", () => {
  it("should interpolate values during load", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("BASE=https://api.com\nFULL=${BASE}/v1");

    await handler.execute("", mockCtx);
    expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining("Loaded"), "info");
  });

  it("should warn about unresolvable interpolation during load", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("VAL=${UNDEFINED_REF}");

    await handler.execute("", mockCtx);
    expect(mockNotify).toHaveBeenCalled();
  });

  it("should show parse warnings with interpolated value from file", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("UNKNOWN_REF=${ABSOLUTELY_NOT_SET}");

    await handler.execute("", mockCtx);
    // Should load the variable (even with empty interpolated value)
    expect(mockNotify).toHaveBeenCalledWith(
      expect.stringContaining("Loaded"),
      "info"
    );
  });
});

});
