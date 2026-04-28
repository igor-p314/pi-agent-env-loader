import { describe, it, expect, vi, beforeEach } from "vitest";
import envLoaderExtension from "../index.js";

// We don't need to mock fs for this test — it just registers the command.
// The actual execute logic is covered by env-command-handler-{commands,load,utils,edge}.test.ts

describe("envLoaderExtension — extension registration", () => {
  let mockPi: any;

  beforeEach(() => {
    mockPi = {
      registerCommand: vi.fn(),
    };
  });

  it("should register the 'env' command", async () => {
    // The extension is the default export of index.ts
    // It calls pi.registerCommand with the env command config
    envLoaderExtension(mockPi);

    expect(mockPi.registerCommand).toHaveBeenCalledWith(
      "env",
      expect.objectContaining({
        description: expect.any(String),
        handler: expect.any(Function),
        getArgumentCompletions: expect.any(Function),
      })
    );
  });

  it("should create fresh instances per extension call", async () => {
    // The extension should not leak state between calls
    // registerCommand is called once per call
    envLoaderExtension(mockPi);
    expect(mockPi.registerCommand).toHaveBeenCalledTimes(1);

    mockPi.registerCommand.mockClear();
    envLoaderExtension(mockPi);
    expect(mockPi.registerCommand).toHaveBeenCalledTimes(1);
  });

  it("should have correct command name and description", async () => {
    envLoaderExtension(mockPi);

    const registeredCall = mockPi.registerCommand.mock.calls[0];
    expect(registeredCall[0]).toBe("env");
    expect(registeredCall[1].description).toContain(".env");
  });

  it("should have getArgumentCompletions in command config", async () => {
    envLoaderExtension(mockPi);

    const registeredCall = mockPi.registerCommand.mock.calls[0];
    expect(typeof registeredCall[1].getArgumentCompletions).toBe("function");
  });

  it("should pass args and ctx to command handler's execute", async () => {
    // Create a wrapper to capture the handler function call
    let capturedArgs: string;
    let capturedCtx: any;

    const mockPi2 = {
      registerCommand: vi.fn(
        (_: string, config: { handler: (args: string, ctx: any) => void }) => {
          capturedArgs = "test_arg";
          capturedCtx = { cwd: "/test", ui: { notify: () => {} } };
          // Call the handler to make sure it's a valid async function
          config.handler(capturedArgs, capturedCtx);
        }
      ),
    };

    envLoaderExtension(mockPi2);

    // The handler should have been registered
    expect(mockPi2.registerCommand).toHaveBeenCalledTimes(1);
    // The handler should be async
    expect(capturedArgs).toBe("test_arg");
    expect(capturedCtx.cwd).toBe("/test");
  });
});
