import {
  topicOgPngArtifactKey,
  topicVerdictPresentationArtifactKey,
  topicVerdictHtmlArtifactKey,
  renderTopicCardOgPng,
  type VerdictPresentation,
} from "@opndomain/shared";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeParagraphs(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
    .join("");
}

export function renderVerdictHtml(input: VerdictPresentation): string {
  const narrative = input.narrative
    .map((beat) => `<li><strong>${escapeHtml(beat.title)}</strong><p>${escapeHtml(beat.summary)}</p></li>`)
    .join("");
  const highlights = input.highlights
    .map(
      (highlight) =>
        `<li><strong>${escapeHtml(highlight.beingHandle)}</strong> <span>${highlight.finalScore.toFixed(1)}</span><p>${escapeHtml(highlight.excerpt)}</p><small>${escapeHtml(highlight.reason)}</small></li>`,
    )
    .join("");
  const claimGraph = input.claimGraph.available
    ? `<p>Claim graph available with ${input.claimGraph.nodes.length} nodes and ${input.claimGraph.edges.length} edges.</p>`
    : `<p>${escapeHtml(input.claimGraph.fallbackNote ?? "Claim graph unavailable.")}</p>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body>
    <main>
      <header>
        <h1>${escapeHtml(input.title)}</h1>
        <p>${escapeHtml(input.headline.text)}</p>
      </header>
      <section>
        <p>Domain: ${escapeHtml(input.domain)}</p>
        <p>Confidence: ${escapeHtml(input.confidence.label)}</p>
        <p>Mode: ${escapeHtml(input.scoreBreakdown.terminalizationMode)}</p>
        <p>Rounds: ${input.scoreBreakdown.completedRounds}/${input.scoreBreakdown.totalRounds}</p>
      </section>
      <section>
        <h2>Summary</h2>
        <p>${escapeHtml(input.summary)}</p>
      </section>
      <section>
        <h2>Narrative</h2>
        <ol>${narrative}</ol>
      </section>
      <section>
        <h2>Highlights</h2>
        <ol>${highlights}</ol>
      </section>
      <section>
        <h2>Claim graph</h2>
        ${claimGraph}
      </section>${input.bothSidesSummary ? `
      <section>
        <h2>Majority case</h2>
        ${escapeParagraphs(input.bothSidesSummary.majorityCase)}
      </section>
      <section>
        <h2>Strongest counter-argument</h2>
        ${escapeParagraphs(input.bothSidesSummary.counterArgument)}
      </section>
      <section>
        <h2>Final verdict</h2>
        ${escapeParagraphs(input.bothSidesSummary.finalVerdict)}
      </section>` : input.editorialBody ? `
      <section>
        <h2>Editorial</h2>
        ${escapeParagraphs(input.editorialBody)}
      </section>` : ""}${input.minorityReports && input.minorityReports.length > 0 ? `
      <section>
        <h2>Minority reports</h2>
        <ul>${input.minorityReports.map((r) => `<li><strong>${escapeHtml(r.handle)}</strong> (${escapeHtml(r.positionLabel)})${escapeParagraphs(r.body)}</li>`).join("")}</ul>
      </section>` : ""}
    </main>
  </body>
</html>`;
}

const VERDICT_STATE_LABEL: Record<NonNullable<VerdictPresentation["synthesisOutcome"]>, string> = {
  clear_synthesis: "CONSENSUS",
  contested_synthesis: "CONTESTED",
  emerging_synthesis: "EMERGING",
  insufficient_signal: "INCONCLUSIVE",
};

const VERDICT_STATE_ACCENT: Record<NonNullable<VerdictPresentation["synthesisOutcome"]>, readonly [number, number, number, number]> = {
  clear_synthesis: [84, 138, 110, 255],
  contested_synthesis: [179, 108, 73, 255],
  emerging_synthesis: [179, 136, 73, 255],
  insufficient_signal: [105, 109, 127, 255],
};

export function renderOgPng(input: VerdictPresentation): Uint8Array {
  const outcome = input.synthesisOutcome;
  return renderTopicCardOgPng({
    title: input.title,
    prompt: input.bothSidesSummary?.finalVerdict
      ?? input.editorialBody
      ?? input.headline.text
      ?? input.summary,
    domainName: input.domain,
    parentDomainName: null,
    memberCount: input.scoreBreakdown.participantCount,
    status: "closed",
    stateLabel: outcome ? VERDICT_STATE_LABEL[outcome] : "CLOSED",
    accent: outcome ? VERDICT_STATE_ACCENT[outcome] : undefined,
  });
}

export async function publishArtifacts(
  bucket: R2Bucket,
  input: VerdictPresentation,
): Promise<{ verdictHtmlKey: string; ogImageKey: string; verdictPresentationKey: string }> {
  const verdictPresentationKey = topicVerdictPresentationArtifactKey(input.topicId);
  const verdictHtmlKey = topicVerdictHtmlArtifactKey(input.topicId);
  const ogImageKey = topicOgPngArtifactKey(input.topicId);
  await bucket.put(verdictPresentationKey, JSON.stringify(input), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  await bucket.put(verdictHtmlKey, renderVerdictHtml(input), {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
  });
  await bucket.put(ogImageKey, renderOgPng(input), {
    httpMetadata: { contentType: "image/png" },
  });
  return { verdictHtmlKey, ogImageKey, verdictPresentationKey };
}

export async function suppressArtifacts(
  bucket: R2Bucket,
  topicId: string,
): Promise<{ verdictHtmlKey: null; ogImageKey: null; verdictPresentationKey: null }> {
  await bucket.delete(topicVerdictPresentationArtifactKey(topicId));
  await bucket.delete(topicVerdictHtmlArtifactKey(topicId));
  await bucket.delete(topicOgPngArtifactKey(topicId));
  return { verdictHtmlKey: null, ogImageKey: null, verdictPresentationKey: null };
}
