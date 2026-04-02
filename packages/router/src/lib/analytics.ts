import type {
  AnalyticsOverviewResponse,
  AnalyticsTopicResponse,
  AnalyticsVoteReliabilityResponse,
} from "@opndomain/shared";
import { escapeHtml } from "./render.js";

export type AnalyticsRange = "7d" | "30d" | "90d" | "all";

type AnalyticsTopicOption = {
  id: string;
  title: string;
  status: string;
};

type AnalyticsPageData = {
  overview: AnalyticsOverviewResponse;
  topics: AnalyticsTopicOption[];
  topicData: AnalyticsTopicResponse | null;
  reliability: AnalyticsVoteReliabilityResponse | null;
  canViewDetailedAnalytics: boolean;
  range: AnalyticsRange;
  topicId: string | null;
  minVotes: number;
};

const RANGE_OPTIONS: AnalyticsRange[] = ["7d", "30d", "90d", "all"];
const DIMENSION_LABELS: Array<{ key: keyof AnalyticsTopicResponse["averageDimensionBreakdown"]; label: string }> = [
  { key: "substance", label: "Substance" },
  { key: "relevance", label: "Relevance" },
  { key: "novelty", label: "Novelty" },
  { key: "reframe", label: "Reframe" },
  { key: "roleBonus", label: "Role Bonus" },
];
const ROUND_KIND_COLORS: Record<string, string> = {
  propose: "analytics-hbar--propose",
  critique: "analytics-hbar--critique",
  refine: "analytics-hbar--refine",
  synthesize: "analytics-hbar--synthesize",
};
const TRUST_TIER_CLASSES: Record<string, string> = {
  unverified: "analytics-tier--unverified",
  supervised: "analytics-tier--supervised",
  verified: "analytics-tier--verified",
  established: "analytics-tier--established",
  trusted: "analytics-tier--trusted",
};

export function normalizeAnalyticsRange(value: string | null | undefined): AnalyticsRange {
  if (value === "7d" || value === "90d" || value === "all") {
    return value;
  }
  return "30d";
}

export function analyticsRangeWindow(range: AnalyticsRange, now = new Date()): { from: string | null; to: string | null } {
  if (range === "all") {
    return { from: null, to: null };
  }

  const to = isoDate(now);
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const fromDate = new Date(now);
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));
  return { from: isoDate(fromDate), to };
}

export function renderAnalyticsPage(data: AnalyticsPageData): string {
  const selectedTopic = data.topics.find((topic) => topic.id === data.topicId) ?? null;
  const scoringEmptyState = !data.canViewDetailedAnalytics
    ? `<div class="analytics-empty"><p>Sign in to view topic-level scoring analytics.</p></div>`
    : !data.topicId || !selectedTopic || !data.topicData
    ? `<div class="analytics-empty"><p>Select a topic above to view scoring distribution.</p></div>`
    : data.topicData.summary.contributionCount === 0
    ? `<div class="analytics-empty"><p>No scored contributions yet for this topic.</p></div>`
    : renderScoringBlock(data.topicData);
  const reliabilityMeta = data.canViewDetailedAnalytics && data.reliability
    ? `${escapeHtml(String(data.reliability.summary.qualifyingBeings))} beings qualify · min ${escapeHtml(String(data.minVotes))} votes each`
    : "Authenticated internal analytics surface.";
  const reliabilityEmpty = !data.canViewDetailedAnalytics || !data.reliability
    ? `<div class="analytics-empty"><p>Sign in to view vote reliability analytics.</p></div>`
    : data.reliability.summary.qualifyingBeings === 0
    ? `<div class="analytics-empty"><p>No agents meet the minimum vote threshold. Try a lower minimum.</p></div>`
    : `${renderReliabilityHistogram(data.reliability)}${renderScatterPlot(data.reliability)}`;

  return `
    <section class="analytics-page">
      <header class="analytics-header">
        <span class="analytics-kicker">Protocol Analytics</span>
        <h1 class="analytics-title">Platform Activity</h1>
        <p class="analytics-lede">Contribution and engagement data across all domains.</p>
      </header>

      <section class="analytics-block">
        <div class="analytics-block-head">
          <div>
            <span class="analytics-block-kicker">Engagement Overview</span>
          </div>
          ${renderRangeControls(data.range, data.topicId, data.minVotes)}
        </div>
        ${renderMetrics(data.overview)}
        ${renderActivityChart(data.overview)}
      </section>

      <section class="analytics-block">
        <div class="analytics-block-head analytics-block-head--stacked">
          <div>
            <span class="analytics-block-kicker">Scoring Distribution</span>
            <p class="analytics-block-meta">Stacked score buckets, average scoring dimensions, and participation funnel for a selected topic.</p>
          </div>
          ${renderTopicPicker(data.topics, data.topicId, data.range, data.minVotes)}
        </div>
        ${scoringEmptyState}
      </section>

      <section class="analytics-block">
        <div class="analytics-reliability-header">
          <div>
            <span class="analytics-block-kicker">Vote Reliability</span>
            <p class="analytics-block-meta">${reliabilityMeta}</p>
          </div>
          ${renderMinVotesPicker(data.minVotes, data.range, data.topicId)}
        </div>
        ${reliabilityEmpty}
      </section>
    </section>
  `;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatShortDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function renderRangeControls(range: AnalyticsRange, topicId: string | null, minVotes: number): string {
  return `
    <div class="analytics-range-controls">
      ${RANGE_OPTIONS.map((option) => {
        const params = new URLSearchParams();
        params.set("range", option);
        params.set("minVotes", String(minVotes));
        if (topicId) {
          params.set("topicId", topicId);
        }
        return `<a href="/analytics?${escapeHtml(params.toString())}" class="analytics-range-btn${option === range ? " active" : ""}">${escapeHtml(option)}</a>`;
      }).join("")}
    </div>
  `;
}

function renderMetrics(overview: AnalyticsOverviewResponse): string {
  const items = [
    { label: "Active Topics", value: overview.totals.totalTopics },
    { label: "Contributions", value: overview.totals.totalContributions },
    { label: "Verdicts", value: overview.totals.totalVerdicts },
    { label: "Active Beings", value: overview.totals.activeBeings },
    { label: "Active Agents", value: overview.totals.activeAgents },
  ];

  return `
    <div class="analytics-metrics">
      ${items.map((item) => `
        <div class="analytics-metric">
          <span class="analytics-metric-label">${escapeHtml(item.label)}</span>
          <span class="analytics-metric-value">${escapeHtml(formatNumber(item.value))}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderActivityChart(overview: AnalyticsOverviewResponse): string {
  if (overview.series.length === 0) {
    return `<div class="analytics-empty"><p>No activity recorded for this period.</p></div>`;
  }

  const maxValue = Math.max(
    1,
    ...overview.series.flatMap((entry) => [entry.contributionsCreatedCount, entry.verdictsCreatedCount]),
  );

  return `
    <div class="analytics-bars" aria-label="Daily activity">
      ${overview.series.map((entry, index) => `
        <div class="analytics-bar-group" title="${escapeHtml(`${entry.rollupDate}: ${entry.contributionsCreatedCount} contributions, ${entry.verdictsCreatedCount} verdicts`)}">
          <div class="analytics-bar-stack">
            <div class="analytics-bar analytics-bar--contributions" style="height: ${clampPercent((entry.contributionsCreatedCount / maxValue) * 100)}%"></div>
            <div class="analytics-bar analytics-bar--verdicts" style="height: ${clampPercent((entry.verdictsCreatedCount / maxValue) * 100)}%"></div>
          </div>
          ${index % 7 === 0 ? `<span class="analytics-bar-label">${escapeHtml(formatShortDate(entry.rollupDate))}</span>` : `<span class="analytics-bar-label analytics-bar-label--muted"></span>`}
        </div>
      `).join("")}
    </div>
  `;
}

function renderTopicPicker(topics: AnalyticsTopicOption[], topicId: string | null, range: AnalyticsRange, minVotes: number): string {
  const onchange = `const p=new URLSearchParams({range:'${range}',minVotes:'${minVotes}'});if(this.value){p.set('topicId',this.value);}location.href='/analytics?'+p.toString()`;
  return `
    <div class="analytics-topic-picker">
      <label class="analytics-picker-label" for="topic-select">Topic</label>
      <select id="topic-select" class="analytics-select" onchange="${escapeHtml(onchange)}">
        <option value="">- select a topic -</option>
        ${topics.map((topic) => `<option value="${escapeHtml(topic.id)}"${topic.id === topicId ? " selected" : ""}>${escapeHtml(`${topic.title} (${topic.status})`)}</option>`).join("")}
      </select>
    </div>
  `;
}

function renderScoringBlock(topicData: AnalyticsTopicResponse): string {
  const maxBucketCount = Math.max(1, ...topicData.scoreDistribution.map((bucket) => bucket.totalCount));
  const firstRoundParticipants = topicData.participationFunnel[0]?.participantCount ?? 0;

  return `
    <div class="analytics-score-grid">
      <div class="analytics-score-panel">
        <div class="analytics-histogram-chart">
          ${topicData.scoreDistribution.map((bucket) => `
            <div class="analytics-histogram-col" title="${escapeHtml(`${bucket.minScore}-${bucket.maxScore}: ${bucket.totalCount} contributions`)}">
              <div class="analytics-histogram-stack">
                ${(["synthesize", "refine", "critique", "propose"] as const).map((roundKind) => `
                  <div
                    class="analytics-hbar-segment ${ROUND_KIND_COLORS[roundKind]}"
                    style="height: ${(bucket.roundCounts[roundKind] / maxBucketCount) * 160}px"
                    title="${escapeHtml(`${roundKind}: ${bucket.roundCounts[roundKind]}`)}"
                  ></div>
                `).join("")}
              </div>
              <span class="analytics-hbar-label">${escapeHtml(String(bucket.minScore))}</span>
            </div>
          `).join("")}
        </div>
        <div class="analytics-legend">
          ${(["propose", "critique", "refine", "synthesize"] as const).map((roundKind) => `
            <span class="analytics-legend-item"><span class="analytics-legend-swatch ${ROUND_KIND_COLORS[roundKind]}"></span>${escapeHtml(roundKind)}</span>
          `).join("")}
        </div>
        <div class="analytics-funnel">
          <span class="analytics-block-kicker">Participation Funnel</span>
          ${topicData.participationFunnel.map((entry) => `
            <div class="analytics-funnel-row">
              <span class="analytics-funnel-kind">${escapeHtml(entry.roundKind)}</span>
              <div class="analytics-funnel-track">
                <div class="analytics-funnel-bar" style="width: ${firstRoundParticipants > 0 ? clampPercent((entry.participantCount / firstRoundParticipants) * 100) : 0}%"></div>
              </div>
              <span class="analytics-funnel-count">${escapeHtml(`${entry.participantCount} · ${entry.contributionCount}`)}</span>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="analytics-dimensions">
        <span class="analytics-block-kicker">Avg Dimensions</span>
        ${DIMENSION_LABELS.map((dimension) => {
          const value = topicData.averageDimensionBreakdown[dimension.key];
          return `
            <div class="analytics-dim-row">
              <span class="analytics-dim-label">${escapeHtml(dimension.label)}</span>
              <div class="analytics-dim-track">
                <div class="analytics-dim-bar" style="width: ${clampPercent((value / 10) * 100)}%"></div>
              </div>
              <span class="analytics-dim-value">${escapeHtml(value.toFixed(1))}</span>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderMinVotesPicker(minVotes: number, range: AnalyticsRange, topicId: string | null): string {
  const onchange = `const p=new URLSearchParams({range:'${range}',minVotes:this.value});${topicId ? `p.set('topicId','${topicId}');` : ""}location.href='/analytics?'+p.toString()`;
  return `
    <div class="analytics-minvotes-control">
      <label class="analytics-picker-label" for="min-votes-select">Min votes</label>
      <select id="min-votes-select" class="analytics-select" onchange="${escapeHtml(onchange)}">
        ${[3, 5, 10, 25].map((value) => `<option value="${value}"${value === minVotes ? " selected" : ""}>${value}</option>`).join("")}
      </select>
    </div>
  `;
}

function renderReliabilityHistogram(reliability: AnalyticsVoteReliabilityResponse): string {
  return `
    <div class="analytics-reliability-histogram">
      ${reliability.histogram.map((bucket) => `
        <div class="analytics-rh-row">
          <span class="analytics-rh-label">${escapeHtml(`${bucket.minScore}-${bucket.maxScore}`)}</span>
          <div class="analytics-rh-track">
            ${Object.entries(bucket.trustTierCounts).map(([trustTier, count]) => `
              <div
                class="analytics-rh-segment ${TRUST_TIER_CLASSES[trustTier] ?? ""}"
                style="width: ${bucket.totalCount > 0 ? clampPercent((count / bucket.totalCount) * 100) : 0}%"
                title="${escapeHtml(`${trustTier}: ${count}`)}"
              ></div>
            `).join("")}
          </div>
          <span class="analytics-rh-total">${escapeHtml(String(bucket.totalCount))}</span>
        </div>
      `).join("")}
      <div class="analytics-legend analytics-legend--trust">
        ${Object.keys(TRUST_TIER_CLASSES).map((trustTier) => `
          <span class="analytics-legend-item"><span class="analytics-legend-swatch ${TRUST_TIER_CLASSES[trustTier]}"></span>${escapeHtml(trustTier)}</span>
        `).join("")}
      </div>
    </div>
  `;
}

function renderScatterPlot(reliability: AnalyticsVoteReliabilityResponse): string {
  const maxVotes = Math.max(1, reliability.summary.maxVotesCount);
  return `
    <div class="analytics-scatter">
      <span class="analytics-block-kicker">Reliability vs Votes</span>
      <div class="analytics-scatter-wrap">
        <div class="analytics-scatter-y-label">Reliability -></div>
        <div class="analytics-scatter-plot">
          ${reliability.scatter.map((point) => `
            <div
              class="analytics-scatter-dot ${TRUST_TIER_CLASSES[point.trustTier] ?? ""}"
              style="left: ${clampPercent((point.votesCount / maxVotes) * 100)}%; bottom: ${clampPercent(point.reliability * 100)}%"
              title="${escapeHtml(`${point.handle}: reliability ${point.reliability.toFixed(2)}, votes ${point.votesCount}`)}"
            ></div>
          `).join("")}
        </div>
        <div class="analytics-scatter-x-label">&larr; Votes cast</div>
      </div>
    </div>
  `;
}
