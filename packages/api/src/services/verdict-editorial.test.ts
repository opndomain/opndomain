import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  VerdictEditorialError,
  generateVerdictEditorial,
} from "./verdict-editorial.js";

const VALID_INPUT = {
  rounds: [
    { roundIndex: 0, roundKind: "propose" as const, status: "completed" },
    { roundIndex: 1, roundKind: "predict" as const, status: "completed" },
  ],
  leaders: [
    {
      roundKind: "propose",
      contributions: [
        {
          contributionId: "cnt_1",
          beingId: "bng_1",
          beingHandle: "alpha",
          finalScore: 73,
          excerpt: "Body",
        },
      ],
    },
  ],
  summary: "Topic summary",
  participantCount: 1,
  contributionCount: 1,
};

async function withMockFetch<T>(
  implementation: typeof globalThis.fetch,
  callback: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = implementation;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function expectFailure(
  implementation: typeof globalThis.fetch,
  expectedKind: VerdictEditorialError["kind"],
) {
  await withMockFetch(implementation, async () => {
    await assert.rejects(
      () => generateVerdictEditorial({
        ZHIPU_API_KEY: "test-api-key",
        ZHIPU_MODEL: "glm-4.7-flash",
        ZHIPU_BASE_URL: "https://api.z.ai/api/paas/v4",
        ZHIPU_TIMEOUT_MS: 30000,
      } as never, VALID_INPUT),
      (error: unknown) => error instanceof VerdictEditorialError && error.kind === expectedKind,
    );
  });
}

describe("verdict editorial service", () => {
  it("parses the provider-supported ZHIPU string content shape", async () => {
    await withMockFetch(
      (async (input) => {
        assert.equal(String(input), "https://api.z.ai/api/paas/v4/chat/completions");
        return Response.json({
          id: "req_123",
          choices: [{
            message: {
              content: JSON.stringify({
                summary: "AI summary",
                editorialBody: "AI editorial body",
                narrative: [
                  {
                    roundIndex: 0,
                    roundKind: "propose",
                    title: "Opening pressure",
                    summary: "AI narrative beat",
                  },
                ],
                highlights: [
                  {
                    contributionId: "cnt_1",
                    beingId: "bng_1",
                    beingHandle: "alpha",
                    roundKind: "propose",
                    excerpt: "AI excerpt",
                    finalScore: 73,
                    reason: "AI reason",
                  },
                ],
              }),
            },
          }],
        });
      }) as typeof globalThis.fetch,
      async () => {
        const result = await generateVerdictEditorial({
          ZHIPU_API_KEY: "test-api-key",
          ZHIPU_MODEL: "glm-4.7-flash",
          ZHIPU_BASE_URL: "https://api.z.ai/api/paas/v4",
          ZHIPU_TIMEOUT_MS: 30000,
        } as never, VALID_INPUT);

        assert.equal(result?.summary, "AI summary");
        assert.equal(result?.narrative[0]?.summary, "AI narrative beat");
      },
    );
  });

  it("classifies HTTP failures", async () => {
    await expectFailure(
      (async () => new Response("upstream down", {
        status: 502,
        headers: { "x-request-id": "req_http" },
      })) as typeof globalThis.fetch,
      "http_failure",
    );
  });

  it("classifies timeout failures", async () => {
    await expectFailure(
      (async () => {
        throw new Error("zhipu_timeout");
      }) as typeof globalThis.fetch,
      "timeout",
    );
  });

  it("classifies empty model output", async () => {
    await expectFailure(
      (async () => Response.json({
        choices: [{
          message: {
            content: "   ",
          },
        }],
      })) as typeof globalThis.fetch,
      "empty_model_output",
    );
  });

  it("classifies unsupported message content shapes", async () => {
    await expectFailure(
      (async () => Response.json({
        choices: [{
          message: {
            content: [{ type: "text", text: "{}" }],
          },
        }],
      })) as typeof globalThis.fetch,
      "unsupported_content_shape",
    );
  });

  it("classifies invalid JSON payloads", async () => {
    await expectFailure(
      (async () => Response.json({
        choices: [{
          message: {
            content: "{not-json}",
          },
        }],
      })) as typeof globalThis.fetch,
      "invalid_json_payload",
    );
  });

  it("classifies schema validation failures", async () => {
    await expectFailure(
      (async () => Response.json({
        choices: [{
          message: {
            content: JSON.stringify({ summary: "Missing required fields" }),
          },
        }],
      })) as typeof globalThis.fetch,
      "schema_validation_failure",
    );
  });

  it("classifies unsafe text rejection", async () => {
    await expectFailure(
      (async () => Response.json({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: "<b>unsafe</b>",
              editorialBody: "AI editorial body",
              narrative: [
                {
                  roundIndex: 0,
                  roundKind: "propose",
                  title: "Opening pressure",
                  summary: "AI narrative beat",
                },
              ],
              highlights: [
                {
                  contributionId: "cnt_1",
                  beingId: "bng_1",
                  beingHandle: "alpha",
                  roundKind: "propose",
                  excerpt: "AI excerpt",
                  finalScore: 73,
                  reason: "AI reason",
                },
              ],
            }),
          },
        }],
      })) as typeof globalThis.fetch,
      "unsafe_text_rejection",
    );
  });
});
