import {
  RefinementEligibleTopicSchema,
  RefinementClaimRecordSchema,
  UnrefinedRefinementClaimSchema,
  type ExtractedRefinementClaim,
  type RefinementClaimRecord,
  type RefinementEligibleTopic,
  type TopicCandidate,
  type UnrefinedRefinementClaim,
} from "../../../packages/shared/src/schemas.js";
import type { CandidateOutput, InventoryItem, ProducerConfig } from "./types.js";
import type { TopicCandidateDuplicate, TopicIdeaContextRecord } from "./topic-idea-duplicates.js";

type TokenState = {
  accessToken: string;
  expiresAt: number;
};

export class ApiClient {
  private token: TokenState | null = null;

  constructor(private config: ProducerConfig) {}

  private async authenticate(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) {
      return this.token.accessToken;
    }

    const response = await fetch(`${this.config.apiOrigin}/v1/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantType: "client_credentials",
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        email: this.config.email,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Auth failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as { data: { accessToken: string; expiresIn: number } };
    this.token = {
      accessToken: data.data.accessToken,
      expiresAt: Date.now() + data.data.expiresIn * 1000,
    };
    return this.token.accessToken;
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const token = await this.authenticate();
    const response = await fetch(`${this.config.apiOrigin}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401) {
      this.token = null;
      const retryToken = await this.authenticate();
      const retry = await fetch(`${this.config.apiOrigin}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${retryToken}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!retry.ok) {
        const text = await retry.text();
        throw new Error(`API ${method} ${path} failed (${retry.status}): ${text}`);
      }
      return ((await retry.json()) as { data: unknown }).data;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API ${method} ${path} failed (${response.status}): ${text}`);
    }

    return ((await response.json()) as { data: unknown }).data;
  }

  async getInventory(): Promise<InventoryItem[]> {
    const data = (await this.request("GET", "/v1/internal/topic-candidates/inventory")) as {
      items: InventoryItem[];
    };
    return data.items;
  }

  async getTopicIdeaContext(domainId: string): Promise<TopicIdeaContextRecord[]> {
    const data = (await this.request(
      "GET",
      `/v1/internal/topic-candidates/idea-context?domainId=${encodeURIComponent(domainId)}`,
    )) as {
      items: TopicIdeaContextRecord[];
    };
    return data.items;
  }

  async upsertCandidates(
    candidates: Array<CandidateOutput | TopicCandidate>,
  ): Promise<{ createdCount: number; updatedCount: number; duplicates: TopicCandidateDuplicate[] }> {
    const items = candidates.map((candidate) => ({
      id: "id" in candidate && typeof candidate.id === "string" && candidate.id.length > 0
        ? candidate.id
        : `tcand_placeholder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ...candidate,
    }));

    const result = (await this.request("POST", "/v1/internal/topic-candidates", { items })) as {
      createdCount: number;
      updatedCount: number;
      duplicates: TopicCandidateDuplicate[];
    };
    return result;
  }

  async getRefinementEligible(): Promise<RefinementEligibleTopic[]> {
    const data = (await this.request("GET", "/v1/internal/topics/refinement-eligible")) as {
      items: unknown[];
    };
    return data.items.map((item) => RefinementEligibleTopicSchema.parse(item));
  }

  // Verdicts that are eligible for refinement but have no refinement_claims
  // rows yet. Producer iterates these to run a fresh LLM extraction per topic.
  async getVerdictsNeedingExtraction(): Promise<Array<{ topicId: string; title: string; prompt: string; domainId: string }>> {
    const data = (await this.request("GET", "/v1/internal/refinement-claims/needing-extraction")) as {
      items: Array<{ topicId: string; title: string; prompt: string; domainId: string }>;
    };
    return data.items;
  }

  // Claims across all parents that don't yet have a promoted_topic_id set.
  // Bundles parent-topic context so the producer can build narrower prompts
  // without another round-trip.
  async getUnrefinedClaims(): Promise<UnrefinedRefinementClaim[]> {
    const data = (await this.request("GET", "/v1/internal/refinement-claims/unrefined")) as {
      items: unknown[];
    };
    return data.items.map((item) => UnrefinedRefinementClaimSchema.parse(item));
  }

  async postExtractedClaims(topicId: string, claims: ExtractedRefinementClaim[]): Promise<RefinementClaimRecord[]> {
    const data = (await this.request("POST", "/v1/internal/refinement-claims", { topicId, claims })) as {
      items: unknown[];
    };
    return data.items.map((item) => RefinementClaimRecordSchema.parse(item));
  }

  async cleanup(maxAgeDays: number): Promise<{ deleted: number }> {
    return (await this.request("POST", "/v1/internal/topic-candidates/cleanup", { maxAgeDays })) as { deleted: number };
  }
}
