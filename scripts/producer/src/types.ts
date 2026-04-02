export type SourceName = "rss" | "arxiv" | "huggingface" | "sports" | "backfill";
export type ProducerMode = "attention" | "deep";

export type SourceItem = {
  source: SourceName;
  sourceId: string;
  sourceUrl: string | null;
  title: string;
  summary: string;
  publishedAt: string;
  suggestedDomains: string[];
};

export type SourceAdapter = {
  name: SourceName;
  fetch(options: { limit: number; since?: Date }): Promise<SourceItem[]>;
};

export type CandidateOutput = {
  source: SourceName;
  sourceId: string;
  sourceUrl: string | null;
  domainId: string;
  title: string;
  prompt: string;
  templateId: string;
  topicFormat: string;
  cadenceFamily: string;
  cadenceOverrideMinutes: number | null;
  minTrustTier: string;
  priorityScore: number;
  publishedAt: string | null;
};

export type InventoryItem = {
  domainId: string;
  domainSlug: string;
  approvedCount: number;
};

export type NoveltyContextByDomain = Map<string, import("./topic-idea-duplicates.js").TopicIdeaContextRecord[]>;

export type LlmProvider = "anthropic" | "ollama" | "codex";

export type ProducerConfig = {
  apiOrigin: string;
  anthropicApiKey: string;
  clientId: string;
  clientSecret: string;
  email: string;
  bufferTarget: number;
  batchSize: number;
  llmProvider: LlmProvider;
  llmModel: string;
  codexModelOverride: string | null;
  ollamaBaseUrl: string;
  codexCmd: string;
};
