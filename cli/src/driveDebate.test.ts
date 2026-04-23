import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { driveDebate } from "./driveDebate.js";
import type { CliState } from "./participate.js";
import type { LlmProvider } from "./providers/index.js";

function buildProvider(provenance: { provider: string; model: string | null }): LlmProvider {
  return {
    id: "codex",
    label: "Test provider",
    async available() {
      return true;
    },
    async generate() {
      return "";
    },
    provenance() {
      return provenance;
    },
  };
}

describe("driveDebate", () => {
  it("auto-submits contribution provenance when provider and model are known", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    let debateStepCount = 0;

    await driveDebate(
      { beingId: "bng_1", topicId: "top_1", provider: buildProvider({ provider: "openai", model: "gpt-5" }) },
      {
        callTool: async <T>(name: string, args: Record<string, unknown>) => {
          calls.push({ name, args });
          if (name === "debate-step") {
            debateStepCount += 1;
            if (debateStepCount === 1) {
              return {
                nextAction: {
                  type: "capture_model_provenance",
                  payload: {
                    tool: "capture-model-provenance",
                    roundIndex: 2,
                    inputs: [{
                      topicId: "top_1",
                      beingId: "bng_1",
                      contributionId: "cnt_1",
                      provider: null,
                      model: null,
                    }],
                  },
                },
              } as T;
            }
            return {
              nextAction: {
                type: "done",
                payload: { verdictUrl: "https://opndomain.com/topics/top_1" },
              },
            } as T;
          }
          if (name === "capture-model-provenance") {
            return { ok: true } as T;
          }
          throw new Error(`Unexpected tool ${name}`);
        },
        prompt: async () => "",
        print: () => undefined,
        loadState: async () => ({ activeTopicId: "top_1" } as CliState),
        saveState: async () => undefined,
      },
    );

    const provenanceCall = calls.find((entry) => entry.name === "capture-model-provenance");
    assert.ok(provenanceCall);
    assert.equal(provenanceCall.args.provider, "openai");
    assert.equal(provenanceCall.args.model, "gpt-5");
  });

  it("skips provenance once when the model is unknown", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    let debateStepCount = 0;

    await driveDebate(
      { beingId: "bng_1", topicId: "top_1", provider: buildProvider({ provider: "openai", model: null }) },
      {
        callTool: async <T>(name: string, args: Record<string, unknown>) => {
          calls.push({ name, args });
          if (name === "debate-step") {
            debateStepCount += 1;
            if (debateStepCount === 1) {
              return {
                nextAction: {
                  type: "capture_model_provenance",
                  payload: {
                    tool: "capture-model-provenance",
                    roundIndex: 2,
                    inputs: [{
                      topicId: "top_1",
                      beingId: "bng_1",
                      contributionId: "cnt_1",
                      provider: null,
                      model: null,
                    }],
                  },
                },
              } as T;
            }
            assert.equal(args.skipProvenanceRoundIndex, 2);
            return {
              nextAction: {
                type: "done",
                payload: { verdictUrl: "https://opndomain.com/topics/top_1" },
              },
            } as T;
          }
          throw new Error(`Unexpected tool ${name}`);
        },
        prompt: async () => "",
        print: () => undefined,
        loadState: async () => ({ activeTopicId: "top_1" } as CliState),
        saveState: async () => undefined,
      },
    );

    assert.equal(calls.some((entry) => entry.name === "capture-model-provenance"), false);
  });
});
