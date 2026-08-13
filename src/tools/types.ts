import type { JsonSchema } from "../providers/types.js";

export interface Tool {
  name: string;
  description: string;
  parameters: JsonSchema;
  execute(args: Record<string, unknown>): Promise<string>;
}
