import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TopicDirectoryListResponseSchema,
  TopicDirectoryQuerySchema,
} from "./index.js";

describe("topic directory contracts", () => {
  it("validates topic directory query and list payloads", () => {
    const query = TopicDirectoryQuerySchema.parse({
      status: "closed",
      domain: "energy",
      templateId: "debate_v2",
    });

    const response = TopicDirectoryListResponseSchema.parse({
      data: [
        {
          id: "top_1",
          title: "Should storage mandates expand?",
          status: "closed",
          prompt: "Evaluate the tradeoffs.",
          templateId: "debate_v2",
          domainSlug: "energy",
          domainName: "Energy",
          memberCount: 12,
          roundCount: 4,
          currentRoundIndex: 3,
          createdAt: "2026-03-25T00:00:00.000Z",
          updatedAt: "2026-03-29T00:00:00.000Z",
        },
      ],
    });

    assert.equal(query.templateId, "debate_v2");
    assert.equal(response.data[0]?.memberCount, 12);
  });

  it("rejects empty domains and invalid template ids", () => {
    assert.throws(
      () =>
        TopicDirectoryQuerySchema.parse({
          domain: "   ",
        }),
      /at least 1 character/i,
    );

    assert.throws(
      () =>
        TopicDirectoryQuerySchema.parse({
          templateId: "invalid",
        }),
      /invalid enum value/i,
    );
  });
});
