import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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

const XAI_ENV = {
  XAI_API_KEY: "test-api-key",
  XAI_MODEL: "grok-3-mini",
  XAI_BASE_URL: "https://api.x.ai/v1",
  XAI_TIMEOUT_MS: 30000,
} as never;

describe("verdict editorial service", () => {
  it("parses xAI OpenAI-compatible response", async () => {
    await withMockFetch(
      (async (input) => {
        assert.equal(String(input), "https://api.x.ai/v1/chat/completions");
        return Response.json({
          id: "chatcmpl-123",
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
        const result = await generateVerdictEditorial(XAI_ENV, VALID_INPUT);

        assert.equal(result.provider, "xai");
        assert.equal(result.failure, null);
        assert.equal(result.editorial?.summary, "AI summary");
        assert.equal(result.editorial?.narrative[0]?.summary, "AI narrative beat");
      },
    );
  });

  it("returns failure result on HTTP error without throwing", async () => {
    await withMockFetch(
      (async () => new Response("upstream down", {
        status: 502,
        headers: { "x-request-id": "req_http" },
      })) as typeof globalThis.fetch,
      async () => {
        const result = await generateVerdictEditorial(XAI_ENV, VALID_INPUT);
        assert.equal(result.editorial, null);
        assert.equal(result.failure?.kind, "http_failure");
        assert.equal(result.failure?.statusCode, 502);
      },
    );
  });

  it("returns failure result on timeout without throwing", async () => {
    await withMockFetch(
      (async () => {
        throw new Error("xai_timeout");
      }) as typeof globalThis.fetch,
      async () => {
        const result = await generateVerdictEditorial(XAI_ENV, VALID_INPUT);
        assert.equal(result.editorial, null);
        assert.equal(result.failure?.kind, "timeout");
      },
    );
  });

  it("returns failure for empty model output", async () => {
    await withMockFetch(
      (async () => Response.json({
        choices: [{
          message: {
            content: "   ",
          },
        }],
      })) as typeof globalThis.fetch,
      async () => {
        const result = await generateVerdictEditorial(XAI_ENV, VALID_INPUT);
        assert.equal(result.editorial, null);
        assert.equal(result.failure?.kind, "empty_model_output");
      },
    );
  });

  it("returns failure for unsupported message content shapes", async () => {
    await withMockFetch(
      (async () => Response.json({
        choices: [{
          message: {
            content: [{ type: "text", text: "{}" }],
          },
        }],
      })) as typeof globalThis.fetch,
      async () => {
        const result = await generateVerdictEditorial(XAI_ENV, VALID_INPUT);
        assert.equal(result.editorial, null);
        assert.equal(result.failure?.kind, "unsupported_content_shape");
      },
    );
  });

  it("returns failure for invalid JSON payloads", async () => {
    await withMockFetch(
      (async () => Response.json({
        choices: [{
          message: {
            content: "{not-json}",
          },
        }],
      })) as typeof globalThis.fetch,
      async () => {
        const result = await generateVerdictEditorial(XAI_ENV, VALID_INPUT);
        assert.equal(result.editorial, null);
        assert.equal(result.failure?.kind, "invalid_json_payload");
      },
    );
  });

  it("returns failure for schema validation errors", async () => {
    await withMockFetch(
      (async () => Response.json({
        choices: [{
          message: {
            content: JSON.stringify({ summary: "Missing required fields" }),
          },
        }],
      })) as typeof globalThis.fetch,
      async () => {
        const result = await generateVerdictEditorial(XAI_ENV, VALID_INPUT);
        assert.equal(result.editorial, null);
        assert.equal(result.failure?.kind, "schema_validation_failure");
      },
    );
  });

  it("returns failure for unsafe text", async () => {
    await withMockFetch(
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
      async () => {
        const result = await generateVerdictEditorial(XAI_ENV, VALID_INPUT);
        assert.equal(result.editorial, null);
        assert.equal(result.failure?.kind, "unsafe_text_rejection");
      },
    );
  });

  it("returns provider_unavailable when XAI_API_KEY is missing", async () => {
    const result = await generateVerdictEditorial({
      XAI_API_KEY: "",
      XAI_MODEL: "grok-3-mini",
      XAI_BASE_URL: "https://api.x.ai/v1",
      XAI_TIMEOUT_MS: 30000,
    } as never, VALID_INPUT);
    assert.equal(result.editorial, null);
    assert.equal(result.failure?.kind, "provider_unavailable");
  });
});
