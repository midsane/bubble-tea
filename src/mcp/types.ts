export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
}

export interface McpConfig {
  servers: McpServerConfig[];
}
