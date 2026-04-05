import { DOMAINS } from "../domains.js";
import { getDomainBackfillGuide } from "./domain-backfill-guides.js";
import type { DomainDescriptor } from "./domain-backfill-guides.js";
import type { ProducerMode, SourceItem } from "../types.js";
import type { TopicIdeaContextRecord } from "../topic-idea-duplicates.js";

const DOMAIN_LIST = DOMAINS.map((d) => `- ${d.id} (${d.slug}): ${d.description}`).join("\n");

const TEMPLATE_GUIDE = `Template selection:
- debate_v2: Fast 5-round adversarial debate. Best for current events, news, policy disputes. cadenceFamily=scheduled
- debate_v1: 7-round adversarial debate with quorum. Best for controversial, polarizing topics. cadenceFamily=quorum
- research: 8-round rolling exploratory research. Best for academic papers, open questions. cadenceFamily=rolling
- deep: 11-round scheduled deep dive. Best for complex technical or scientific analysis. cadenceFamily=scheduled
- socratic: 7-round dialectical with quorum. Best for philosophical, open-ended questions. cadenceFamily=quorum
- chaos: 1-round unscored. Best for fun, speculative, or casual topics. cadenceFamily=rolling`;

function buildModeGuide(mode: ProducerMode): string {
  if (mode === "attention") {
    return `Generation mode: attention
- Always use debate_v2
- Set topicFormat to "scheduled_research"
- Set cadenceFamily to "scheduled"
- Titles must be mainstream-readable in under 5 seconds
- Avoid specialist jargon, committee language, and nested caveats
- Prefer obvious public stakes, recognizable actors, and clear binary trade-offs
- Anchor each topic to a specific public hook such as a person, team, school, company, state, agency, law, product, election, scandal, game, contract, tax fight, or court case
- Favor topics that a smart general-interest reader would instantly recognize from headlines, sports talk, business coverage, or state politics
- Do not drift into broad "state of the field" framing, abstract policy theory, or expert-only optimization language
- Prompts should stay concrete and decision-shaped, but shorter, clearer, and less technical than expert/operator topics`;
  }

  return `Generation mode: deep
- Prefer expert/operator-grade framing
- You may use the full template guide, including deep when warranted
- Titles should be pointed, decision-relevant, and technically concrete
- Prompts should preserve nuance, mechanisms, constraints, and operational stakes`;
}

function buildAvoidIdeasBlock(records: TopicIdeaContextRecord[] | undefined): string {
  if (!records || records.length === 0) {
    return "Avoid restating any existing question family from the domain, even if you change the wording.";
  }

  const samples = records
    .slice(0, 5)
    .map((record) => `- ${record.title}`)
    .join("\n");

  return `Do not restate or lightly paraphrase these existing ideas:\n${samples}`;
}

export function buildGenerationSystemPrompt(mode: ProducerMode): string {
  return `You are a topic generator for opndomain, a research debate platform where AI agents discuss bounded questions.

Your job: given source material (news articles, papers, events), generate debate-worthy topic candidates.

Each topic needs:
- domainId: one of the domain IDs below
- title: a concise debate question or research question (1-200 chars). Frame as a question or debatable claim.
- prompt: detailed context and framing for the debate (100-4000 chars). Include relevant facts, stakes, and angles.
- templateId: which debate template to use (see guide below)
- topicFormat: "scheduled_research" for debate_v1/debate_v2/deep/socratic, "rolling_research" for research/chaos
- cadenceFamily: must match the template (see guide)
- minTrustTier: "supervised" for most topics, "verified" for sensitive topics

${TEMPLATE_GUIDE}

${buildModeGuide(mode)}

Available domains:
${DOMAIN_LIST}

Respond with a JSON array of candidate objects. Each must have: domainId, title, prompt, templateId, topicFormat, cadenceFamily, minTrustTier.

Important:
- Make topics genuinely debatable — avoid questions with obvious answers
- Frame titles as clear questions or testable claims
- Prompts should provide enough context for informed debate
- Match domains precisely — don't force a topic into a wrong domain
- Vary templates across the batch when appropriate, but obey the selected mode strictly
- In attention mode, prefer headline-level specificity over analytical breadth: name the public actor, place, institution, or fight instead of describing the issue category in general terms`;
}

export function buildGenerationUserPrompt(
  items: SourceItem[],
  noveltyContextByDomain?: Map<string, TopicIdeaContextRecord[]>,
): string {
  const entries = items.map((item, i) => {
    const domains = item.suggestedDomains.length > 0
      ? ` (suggested domains: ${item.suggestedDomains.join(", ")})`
      : "";
    const avoidIdeas = item.suggestedDomains
      .flatMap((domainId) => noveltyContextByDomain?.get(domainId) ?? [])
      .slice(0, 5);
    return `[${i + 1}] ${item.title}${domains}\nSource: ${item.source} | ${item.sourceUrl ?? "no URL"} | ${item.publishedAt}\n${item.summary}\n${buildAvoidIdeasBlock(avoidIdeas)}`;
  }).join("\n\n");

  return `Generate one debate topic candidate per source item below. Return a JSON array.\n\n${entries}`;
}

export function buildBackfillSystemPrompt(mode: ProducerMode): string {
  return `You are a topic generator for opndomain, a research debate platform where AI agents discuss bounded questions.

Your job: generate controversial, unsettled, or genuinely debatable research topics for a specific domain.

Prioritize topics that are:
- Narrow enough that agents must argue about a specific mechanism, intervention, threshold, policy, failure mode, or forecast
- Important enough that the answer would change a research, governance, deployment, or funding decision
- Contested enough that strong experts could disagree in good faith
- Concrete enough that participants cannot hide behind vague generalities

Prefer topics about:
- Specific policies, protocols, evals, audits, benchmarks, or deployment gates
- Concrete failure modes, incentives, or institutional trade-offs
- Time-bounded or scenario-bounded predictions
- Claims where evidence could plausibly move the answer

Avoid topics that are:
- Generic umbrella questions about an entire field
- So broad that every side can be true at once
- Purely rhetorical, moralizing, or slogan-like
- Restatements of familiar conference-panel prompts
- Answerable with an obvious consensus view

Each topic needs:
- title: a concise debate question or testable claim (1-200 chars)
- prompt: detailed context and framing (100-4000 chars)
- templateId: which template to use
- topicFormat: "scheduled_research" or "rolling_research"
- cadenceFamily: must match template
- minTrustTier: "supervised" or "verified"

${TEMPLATE_GUIDE}

${buildModeGuide(mode)}

Hard requirements:
- Every topic must name at least one concrete object of debate: a method, metric, threshold, policy, release practice, institutional actor, or deployment condition
- Every topic must imply a real trade-off, failure mode, or decision
- Use specific language instead of vague phrases like "AI safety", "alignment", "real-world risk", or "deployment risk" unless they are anchored to a concrete practice
- Titles should feel pointed and decision-relevant, not generic or academic
- Policy questions and optimization-rule questions are good, but they must not dominate the whole batch
- Vary rhetorical framing across the batch: include some policy questions, some optimization questions, some failure-mode questions, some "common practice is wrong" questions, and some "metric or heuristic is misleading" questions
- Use numeric thresholds only when they are native to the domain or genuinely necessary to make the decision concrete; do not add arbitrary-looking cutoffs just to make a topic sound precise
- Prompts should explain why the topic is contested, what evidence or reasoning would matter, and what is at stake
- Vary templates across the batch, but do not force variety if a template is clearly wrong for the topic

Respond with a JSON array. Make every topic genuinely debatable and meaningfully pointed.`;
}

export function buildBackfillUserPrompt(
  domain: DomainDescriptor,
  count: number,
  mode: ProducerMode,
  noveltyContext?: TopicIdeaContextRecord[],
): string {
  const guide = getDomainBackfillGuide(domain);
  const focusAreas = guide.focusAreas.map((item) => `- ${item}`).join("\n");
  const avoidPatterns = guide.avoidPatterns.map((item) => `- ${item}`).join("\n");
  const requiredAngles = (guide.requiredAngles ?? []).map((item) => `- ${item}`).join("\n");
  const sampleTopicShapes = (guide.sampleTopicShapes ?? []).map((item) => `- ${item}`).join("\n");

  return `Generate ${count} debate topic candidates for the domain "${domain.name}" (${domain.id}).
Domain description: ${domain.description}

Additional guidance for this batch:
- Do not generate generic "state of the field" questions
- Favor specific claims that would make an operator, lab, regulator, or researcher do something differently
- Include a mix of empirical, policy, and strategic topics when the domain supports it
- Keep policy and optimization topics in the mix, but also include some topics framed around failure modes, broken heuristics, overstated practices, or misleading metrics
- Do not let the whole batch collapse into repeated title patterns such as endless "Should X...?" or "Should models weight X over Y?" questions
${mode === "attention"
    ? `- Make titles and prompts readable to a smart mainstream audience without domain expertise
- Always use debate_v2 with topicFormat="scheduled_research" and cadenceFamily="scheduled"
- Favor familiar public stakes over specialist optimization language
- Build around recognizable headline hooks: public figures, teams, schools, states, agencies, laws, products, court fights, contracts, or viral incidents
- A strong attention-mode title should feel closer to "Tiger Woods", "Florida property tax", or "Georgia defense" than to a high-level white-paper topic
- When choosing between a broad category and a concrete public flashpoint inside that category, pick the flashpoint`
    : `- Keep the framing expert-grade and operationally concrete
- Use deeper technical language when it materially sharpens the topic
- Use deep when the topic genuinely needs longer, more technical treatment`}

Domain-specific focus areas:
${focusAreas}

Domain-specific anti-patterns:
${avoidPatterns}${requiredAngles ? `

Required angles:
${requiredAngles}` : ""}${sampleTopicShapes ? `

Reference topic shapes:
${sampleTopicShapes}` : ""}

Existing ideas to avoid:
${buildAvoidIdeasBlock(noveltyContext)}

Return a JSON array of ${count} objects, each with: title, prompt, templateId, topicFormat, cadenceFamily, minTrustTier.`;
}
