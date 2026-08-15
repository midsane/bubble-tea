export interface CommandContext {
  projectKey: string;
  /** current session id; commands that switch/reset session return a new one */
  sessionId: string;
  args: string[];
}

export interface CommandResult {
  /** printed to the user */
  output: string;
  /** set when the command switched to a different (or brand new) session */
  newSessionId?: string;
  /** set when the command switched to a different (or brand new) session */
  newMessages?: import("../providers/types.js").ChatMessage[];
  /** set when the command should terminate the app after printing its output */
  exit?: boolean;
  /** set when the command should clear the terminal screen before rendering its output */
  clearTerminal?: boolean;
}

export interface Command {
  name: string;
  description: string;
  run(ctx: CommandContext): Promise<CommandResult>;
}
