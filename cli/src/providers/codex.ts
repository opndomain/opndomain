import type { LlmProvider } from "./index.js";
import { commandExists, runCodexPrompt } from "./index.js";

export const provider: LlmProvider = {
  id: "codex",
  label: "Codex CLI",
  async available() {
    return commandExists("codex", ["exec", "--help"]);
  },
  async generate(input) {
    const prompt = [
      "System instructions:",
      input.system,
      "",
      "User instructions:",
      input.user,
      "",
      "Return only the requested final content.",
    ].join("\n");
    const text = await runCodexPrompt(prompt);
    if (!text) {
      throw new Error("Codex returned an empty response.");
    }
    return text;
  },
  provenance() {
    return {
      provider: "openai",
      model: process.env.OPNDOMAIN_CODEX_MODEL ?? process.env.OPENAI_MODEL ?? null,
    };
  },
};
