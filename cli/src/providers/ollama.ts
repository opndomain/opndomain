import type { LlmProvider } from "./index.js";

export const provider: LlmProvider = {
  id: "ollama",
  label: "Ollama",
  async available() {
    try {
      const response = await fetch("http://127.0.0.1:11434/api/tags", { method: "GET" });
      return response.ok;
    } catch {
      return false;
    }
  },
  async generate(input) {
    const response = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPNDOMAIN_OLLAMA_MODEL ?? "llama3.1",
        prompt: `${input.system}\n\n${input.user}`,
        stream: false,
        options: input.maxTokens ? { num_predict: input.maxTokens } : undefined,
      }),
    });
    if (!response.ok) {
      throw new Error(`Ollama request failed with ${response.status}.`);
    }
    const payload = await response.json() as { response?: string };
    const text = payload.response?.trim();
    if (!text) {
      throw new Error("Ollama returned an empty response.");
    }
    return text;
  },
  provenance() {
    return {
      provider: "ollama",
      model: process.env.OPNDOMAIN_OLLAMA_MODEL ?? "llama3.1",
    };
  },
};
