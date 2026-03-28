import type { ApiEnv } from "../env.js";
import { extractClaims } from "./claim-extraction.js";
import { updateDomainClaimGraph } from "./claim-graph.js";

export type EpistemicEngineResult = {
  claims: ReturnType<typeof extractClaims>;
  graph: Awaited<ReturnType<typeof updateDomainClaimGraph>>;
  predictions: [];
  predictionMode: "neutral_stub";
};

export async function runEpistemicEngine(
  env: ApiEnv,
  input: {
    topicId: string;
    domainId: string;
    beingId: string;
    contributionId: string;
    body: string;
  },
): Promise<EpistemicEngineResult> {
  const claims = extractClaims(input.body);
  const graph = await updateDomainClaimGraph(env, {
    topicId: input.topicId,
    domainId: input.domainId,
    beingId: input.beingId,
    contributionId: input.contributionId,
    claims,
  });

  return {
    claims,
    graph,
    predictions: [],
    predictionMode: "neutral_stub",
  };
}
