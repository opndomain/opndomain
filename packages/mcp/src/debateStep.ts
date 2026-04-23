import type { McpBindings } from "./index.js";
import {
  reduceDebateStep,
  trimContextForResponse,
  type DebateStepInput,
  type DebateResult,
  type TopicContext,
} from "@opndomain/shared";

export { reduceDebateStep, trimContextForResponse, type DebateStepInput, type DebateResult, type TopicContext };

async function apiFetch(env: McpBindings, path: string, init?: RequestInit) {
  return env.API_SERVICE.fetch(new Request(`https://api.internal${path}`, init));
}

async function apiJson<T>(env: McpBindings, path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(env, path, init);
  const payload = await response.json() as { data?: T; message?: string; error?: string };
  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? response.statusText);
  }
  return payload.data as T;
}

export async function debateStep(env: McpBindings, accessToken: string, input: DebateStepInput): Promise<DebateResult> {
  const context = await apiJson<TopicContext>(env, `/v1/topics/${input.topicId}/context?beingId=${encodeURIComponent(input.beingId)}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const being = await apiJson<{ personaText?: string | null; personaLabel?: string | null }>(env, `/v1/beings/${input.beingId}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const result = reduceDebateStep(context, input, {
    rootDomain: env.ROOT_DOMAIN,
    personaText: being.personaText ?? null,
    personaLabel: being.personaLabel ?? null,
  });
  // Trim the context in the response to reduce payload size — only include
  // current round transcript, not full history from all prior rounds.
  result.context = trimContextForResponse(result.context);
  return result;
}
