import { describe, it, expect } from "bun:test";
import { ToolBus, type ToolDef, type ToolContext } from "./toolBus.js";
import { z } from "zod";

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    cwd: ".",
    permissions: new Set(["test.perm"]),
    requestApproval: async () => true,
    log: () => {},
    ...overrides,
  };
}

describe("ToolBus", () => {
  it("registers and lists tools", () => {
    const bus = new ToolBus();
    const tool: ToolDef = {
      name: "test.echo",
      description: "Echo input",
      inputSchema: z.object({ msg: z.string() }),
      outputSchema: z.object({ echoed: z.string() }),
      permissionsRequired: ["test.perm"],
      sideEffect: "none",
      requiresApproval: false,
      execute: async (args) => ({ echoed: args.msg }),
    };
    bus.register(tool);
    expect(bus.list().length).toBe(1);
    expect(bus.list()[0]!.name).toBe("test.echo");
  });

  it("throws on duplicate registration", () => {
    const bus = new ToolBus();
    const tool: ToolDef = {
      name: "test.dup",
      description: "dup",
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      permissionsRequired: [],
      sideEffect: "none",
      requiresApproval: false,
      execute: async () => ({}),
    };
    bus.register(tool);
    expect(() => bus.register(tool)).toThrow("already registered");
  });

  it("executes a tool successfully", async () => {
    const bus = new ToolBus();
    bus.register({
      name: "test.echo",
      description: "Echo",
      inputSchema: z.object({ msg: z.string() }),
      outputSchema: z.object({ echoed: z.string() }),
      permissionsRequired: ["test.perm"],
      sideEffect: "none",
      requiresApproval: false,
      execute: async (args) => ({ echoed: args.msg }),
    });
    const result = await bus.call("test.echo", { msg: "hello" }, makeCtx());
    expect(result.error).toBeUndefined();
    expect(result.output).toEqual({ echoed: "hello" });
  });

  it("returns error for unknown tool", async () => {
    const bus = new ToolBus();
    const result = await bus.call("nonexistent", {}, makeCtx());
    expect(result.error).toBe("unknown tool: nonexistent");
    expect(result.output).toBeNull();
  });

  it("returns error for missing permissions", async () => {
    const bus = new ToolBus();
    bus.register({
      name: "test.restricted",
      description: "restricted",
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      permissionsRequired: ["admin.perm"],
      sideEffect: "none",
      requiresApproval: false,
      execute: async () => ({}),
    });
    const result = await bus.call("test.restricted", {}, makeCtx({ permissions: new Set() }));
    expect(result.error).toBe("permission denied: requires admin.perm");
  });

  it("returns error for invalid input", async () => {
    const bus = new ToolBus();
    bus.register({
      name: "test.validated",
      description: "validated",
      inputSchema: z.object({ count: z.number() }),
      outputSchema: z.object({ count: z.number() }),
      permissionsRequired: [],
      sideEffect: "none",
      requiresApproval: false,
      execute: async (args) => ({ count: args.count }),
    });
    const result = await bus.call("test.validated", { count: "not a number" }, makeCtx());
    expect(result.error).toContain("invalid args");
  });

  it("requires approval for write tools", async () => {
    const bus = new ToolBus();
    bus.register({
      name: "test.write",
      description: "write",
      inputSchema: z.object({}),
      outputSchema: z.object({ done: z.boolean() }),
      permissionsRequired: [],
      sideEffect: "write",
      requiresApproval: true,
      execute: async () => ({ done: true }),
    });

    const denied = await bus.call("test.write", {}, makeCtx({ requestApproval: async () => false }));
    expect(denied.error).toBe("human approval denied");

    const approved = await bus.call("test.write", {}, makeCtx({ requestApproval: async () => true }));
    expect(approved.output).toEqual({ done: true });
  });

  it("generates descriptors for LLM tool definitions", () => {
    const bus = new ToolBus();
    bus.register({
      name: "test.desc",
      description: "A test tool",
      inputSchema: z.object({ name: z.string(), count: z.number().optional() }),
      outputSchema: z.object({}),
      permissionsRequired: [],
      sideEffect: "read",
      requiresApproval: false,
      execute: async () => ({}),
    });
    const descs = bus.descriptors();
    expect(descs.length).toBe(1);
    expect(descs[0]!.name).toBe("test.desc");
    expect(descs[0]!.input_schema).toMatchObject({ type: "object" });
    expect(descs[0]!.side_effect).toBe("read");
  });

  it("filters descriptors by allow list", () => {
    const bus = new ToolBus();
    bus.register({
      name: "a", description: "a", inputSchema: z.object({}), outputSchema: z.object({}),
      permissionsRequired: [], sideEffect: "none", requiresApproval: false, execute: async () => ({}),
    });
    bus.register({
      name: "b", description: "b", inputSchema: z.object({}), outputSchema: z.object({}),
      permissionsRequired: [], sideEffect: "none", requiresApproval: false, execute: async () => ({}),
    });
    const descs = bus.descriptors(["a"]);
    expect(descs.length).toBe(1);
    expect(descs[0]!.name).toBe("a");
  });
});
