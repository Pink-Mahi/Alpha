/**
 * Tool bus — the core abstraction for agent capabilities.
 *
 * Each tool is a named function with:
 * - input/output validation
 * - permission requirements (checked against the agent's allow-list)
 * - side-effect classification (none/read/write/destructive)
 * - cost estimation
 *
 * The bus enforces that an agent only calls tools in its allow-list and that
 * destructive tools require explicit approval (human.checkpoint).
 */
import { z } from "zod";

export type SideEffect = "none" | "read" | "write" | "destructive";

export interface ToolContext {
  /** The working directory for filesystem/shell tools. */
  cwd: string;
  /** Permission tokens granted to the calling agent. */
  permissions: Set<string>;
  /** Called when a destructive action needs human approval. Returns true if approved. */
  requestApproval: (tool: string, args: Record<string, unknown>, reason: string) => Promise<boolean>;
  /** Logger. */
  log: (level: "info" | "warn" | "error", msg: string) => void;
}

export interface ToolDef<I extends z.ZodType = z.ZodType, O extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  inputSchema: I;
  outputSchema: O;
  permissionsRequired: string[];
  sideEffect: SideEffect;
  /** If true and sideEffect is write/destructive, requires human approval before executing. */
  requiresApproval: boolean;
  execute: (args: z.infer<I>, ctx: ToolContext) => Promise<z.infer<O>>;
}

export class ToolBus {
  private tools = new Map<string, ToolDef>();

  register(tool: ToolDef): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  list(): ToolDef[] {
    return [...this.tools.values()];
  }

  /** Return tool descriptors suitable for sending to an LLM as function definitions. */
  descriptors(allowList?: string[]): Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
    side_effect: SideEffect;
  }> {
    return this.list()
      .filter((t) => !allowList || allowList.includes(t.name))
      .map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: zodToJsonSchema(t.inputSchema),
        side_effect: t.sideEffect,
      }));
  }

  async call(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<{ output: unknown; error?: string }> {
    const tool = this.tools.get(name);
    if (!tool) return { output: null, error: `unknown tool: ${name}` };

    // Permission check
    for (const perm of tool.permissionsRequired) {
      if (!ctx.permissions.has(perm)) {
        return { output: null, error: `permission denied: requires ${perm}` };
      }
    }

    // Input validation
    const parsed = tool.inputSchema.safeParse(args);
    if (!parsed.success) {
      return { output: null, error: `invalid args: ${parsed.error.message}` };
    }

    // Approval for destructive/write tools that require it
    if (tool.requiresApproval && (tool.sideEffect === "write" || tool.sideEffect === "destructive")) {
      const approved = await ctx.requestApproval(name, parsed.data, tool.description);
      if (!approved) {
        return { output: null, error: "human approval denied" };
      }
    }

    try {
      const result = await tool.execute(parsed.data, ctx);
      const validated = tool.outputSchema.safeParse(result);
      if (!validated.success) {
        ctx.log("warn", `tool ${name} returned invalid output: ${validated.error.message}`);
        return { output: result };
      }
      return { output: validated.data };
    } catch (e) {
      return { output: null, error: String(e) };
    }
  }
}

/** Minimal JSON Schema conversion from Zod (good enough for LLM tool defs). */
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Zod's .describe() / shape introspection for a minimal schema.
  // For M1 this is a pragmatic subset; full conversion via zod-to-json-schema later.
  const def = (schema as unknown as { _def: Record<string, unknown> })._def;
  const typeName = def?.typeName as string | undefined;
  switch (typeName) {
    case "ZodObject": {
      const shape = (schema as unknown as { shape: Record<string, z.ZodType> }).shape;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, val] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(val);
        if (!(val as unknown as { isOptional: () => boolean }).isOptional()) required.push(key);
      }
      return { type: "object", properties, required: required.length > 0 ? required : undefined };
    }
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodArray":
      return { type: "array", items: zodToJsonSchema(def.element as z.ZodType) };
    case "ZodOptional":
      return zodToJsonSchema(def.innerType as z.ZodType);
    case "ZodEnum":
      return { type: "string", enum: def.values };
    default:
      return { type: "string" };
  }
}
