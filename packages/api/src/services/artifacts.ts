import {
  topicOgSvgArtifactKey,
  topicVerdictHtmlArtifactKey,
  VERDICT_TOP_CONTRIBUTIONS_PER_ROUND,
} from "@opndomain/shared";

export type ArtifactRenderInput = {
  topicId: string;
  title: string;
  prompt: string;
  summary: string;
  confidence: string;
  terminalizationMode: string;
  completedRounds: number;
  totalRounds: number;
  topContributionsPerRound: Array<{
    roundKind: string;
    contributions: Array<{
      contributionId: string;
      beingId: string;
      finalScore: number;
      excerpt: string;
    }>;
  }>;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderVerdictHtml(input: ArtifactRenderInput): string {
  const rounds = input.topContributionsPerRound
    .slice(0, input.totalRounds)
    .map((round) => {
      const items = round.contributions
        .slice(0, VERDICT_TOP_CONTRIBUTIONS_PER_ROUND)
        .map(
          (contribution) =>
            `<li><strong>${escapeHtml(contribution.beingId)}</strong> <span>${contribution.finalScore.toFixed(1)}</span><p>${escapeHtml(contribution.excerpt)}</p></li>`,
        )
        .join("");
      return `<section><h2>${escapeHtml(round.roundKind)}</h2><ol>${items}</ol></section>`;
    })
    .join("");

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
        <p>${escapeHtml(input.summary)}</p>
      </header>
      <section>
        <p>Confidence: ${escapeHtml(input.confidence)}</p>
        <p>Mode: ${escapeHtml(input.terminalizationMode)}</p>
        <p>Rounds: ${input.completedRounds}/${input.totalRounds}</p>
      </section>
      <section>
        <h2>Prompt</h2>
        <p>${escapeHtml(input.prompt)}</p>
      </section>
      ${rounds}
    </main>
  </body>
</html>`;
}

export function renderOgSvg(input: ArtifactRenderInput): string {
  const headline = escapeHtml(input.title.slice(0, 90));
  const summary = escapeHtml(input.summary.slice(0, 180));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${headline}">
  <rect width="1200" height="630" fill="#f4efe4"/>
  <rect x="48" y="48" width="1104" height="534" rx="28" fill="#12343b"/>
  <text x="88" y="140" fill="#f4efe4" font-size="32" font-family="Georgia, serif">opndomain verdict</text>
  <text x="88" y="220" fill="#f4efe4" font-size="56" font-family="Georgia, serif">${headline}</text>
  <text x="88" y="320" fill="#c8d9d6" font-size="30" font-family="Georgia, serif">${summary}</text>
  <text x="88" y="520" fill="#f7b267" font-size="28" font-family="Georgia, serif">${escapeHtml(input.confidence)} / ${escapeHtml(input.terminalizationMode)}</text>
</svg>`;
}

export async function publishArtifacts(
  bucket: R2Bucket,
  input: ArtifactRenderInput,
): Promise<{ verdictHtmlKey: string; ogImageKey: string }> {
  const verdictHtmlKey = topicVerdictHtmlArtifactKey(input.topicId);
  const ogImageKey = topicOgSvgArtifactKey(input.topicId);
  await bucket.put(verdictHtmlKey, renderVerdictHtml(input), {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
  });
  await bucket.put(ogImageKey, renderOgSvg(input), {
    httpMetadata: { contentType: "image/svg+xml" },
  });
  return { verdictHtmlKey, ogImageKey };
}

export async function suppressArtifacts(
  bucket: R2Bucket,
  topicId: string,
): Promise<{ verdictHtmlKey: null; ogImageKey: null }> {
  await bucket.delete(topicVerdictHtmlArtifactKey(topicId));
  await bucket.delete(topicOgSvgArtifactKey(topicId));
  return { verdictHtmlKey: null, ogImageKey: null };
}
