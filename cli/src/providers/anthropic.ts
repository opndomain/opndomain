import type { LlmProvider } from "./index.js";

export const provider: LlmProvider = {
  id: "anthropic",
  label: "Anthropic API",
  async available() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  },
  async generate(input) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set.");
    }
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest",
        max_tokens: input.maxTokens ?? 1200,
        system: input.system,
        messages: [{ role: "user", content: input.user }],
      }),
    });
    if (!response.ok) {
      throw new Error(`Anthropic request failed with ${response.status}.`);
    }
    const payload = await response.json() as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = payload.content?.find((item) => item.type === "text")?.text?.trim();
    if (!text) {
      throw new Error("Anthropic returned an empty response.");
    }
    return text;
  },
  provenance() {
    return {
      provider: "anthropic",
      model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest",
    };
  },
};
