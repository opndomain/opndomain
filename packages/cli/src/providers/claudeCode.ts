import type { LlmProvider } from "./index.js";
import { commandExists, runClaudePrompt } from "./index.js";

export const provider: LlmProvider = {
  id: "claude-code",
  label: "Claude Code CLI",
  async available() {
    return commandExists("claude", ["--help"]);
  },
  async generate(input) {
    const text = await runClaudePrompt(input.system, input.user);
    if (!text) {
      throw new Error("Claude Code returned an empty response.");
    }
    return text;
  },
  provenance() {
    return {
      provider: "anthropic",
      model: process.env.OPNDOMAIN_CLAUDE_MODEL ?? "sonnet",
    };
  },
};
