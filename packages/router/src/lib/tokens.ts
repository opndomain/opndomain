export const FONT_PRECONNECT = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&family=Newsreader:opsz,wght@6..72,500;6..72,700&display=swap" rel="stylesheet">
`;

export const TOPICS_PAGE_STYLES = `
.topics-main {
  width: min(100%, 1140px);
}
.topics-page {
  padding-top: 24px;
}
.topics-shell {
  display: grid;
  gap: 34px;
}
/* ── Filter row ── */
.topics-page .editorial-header {
  max-width: 760px;
  margin: 0 auto;
  text-align: center;
}
.topics-page .editorial-lede {
  max-width: 34ch;
  margin: 0 auto;
}
.topics-page .editorial-meta {
  justify-content: center;
}
.topics-filterbar {
  margin-bottom: 10px;
  padding: 0;
}
.topics-filter-row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(180px, 0.8fr) auto auto;
  align-items: center;
  gap: 12px;
}
.topics-search-input {
  width: 100%;
  min-width: 0;
  height: 48px;
  padding: 0 16px;
  border: 1px solid var(--border);
  border-radius: 0;
  background: rgba(255, 255, 255, 0.98);
  color: var(--text);
  font-size: 0.94rem;
  box-shadow: none;
}
.topics-search-input:hover,
.topics-search-input:focus {
  border-color: var(--cyan);
  outline: none;
}
.topics-filter-select {
  width: 100%;
  height: 48px;
  padding: 0 36px 0 14px;
  border: 1px solid var(--border);
  border-radius: 0;
  background: rgba(255, 255, 255, 0.98);
  color: var(--text);
  font-size: 0.84rem;
  box-shadow: none;
}
.topics-filter-select:hover,
.topics-filter-select:focus {
  border-color: var(--cyan);
  outline: none;
}
.topics-status-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.topics-status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 48px;
  min-width: 72px;
  padding: 0 14px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.98);
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-decoration: none;
  text-transform: uppercase;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}
.topics-status-pill:hover {
  border-color: var(--cyan);
  color: var(--cyan);
}
.topics-status-pill.is-active {
  border-color: var(--cyan);
  background: color-mix(in srgb, var(--cyan) 12%, white 88%);
  color: var(--text);
}
.topics-filter-clear {
  justify-self: end;
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-decoration: none;
  text-transform: uppercase;
}
.topics-filter-clear:hover {
  color: var(--cyan);
}

/* ── Topic cards ── */
.topics-card-stat {
  display: grid;
  gap: 2px;
  min-height: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.topics-card-stat span:last-child {
  color: var(--text);
  font-size: 0.84rem;
  letter-spacing: 0.01em;
  text-transform: none;
}
.topics-list {
  display: grid;
  gap: 0;
  padding-top: 8px;
}
.topics-card {
  display: block;
  border-top: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.34);
}
.topics-card:nth-child(even) {
  background: rgba(77, 103, 128, 0.09);
}
.topics-card:first-child {
  border-top: 1px solid var(--border);
}
.topics-card-link {
  display: grid;
  gap: 12px;
  padding: 18px 20px;
  text-decoration: none;
  transition: background 140ms ease, box-shadow 140ms ease;
}
.topics-card:hover .topics-card-link {
  background: rgba(255, 255, 255, 0.62);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cyan) 18%, transparent);
}
.topics-card-copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.topics-card-copy h2 {
  margin: 0;
  font-size: 1.12rem;
  line-height: 1.18;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.topics-card:hover .topics-card-copy h2 {
  color: var(--cyan);
}
.topics-card-preview {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.88rem;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.topics-card-meta {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(120px, 0.5fr) minmax(140px, 0.6fr);
  gap: 20px;
}
.topics-card-stat {
  align-content: start;
}
.topics-card-stat a {
  text-decoration: none;
}
.topics-empty {
  display: grid;
  gap: 10px;
  padding: 24px 0;
  border-top: 1px solid var(--border);
}
.topics-empty h2 {
  margin: 0;
  font-size: 1.15rem;
}
.topics-empty p {
  max-width: 52ch;
}
.topics-empty .button {
  justify-self: start;
  border-radius: 0;
  border: 1px solid var(--border);
  background: #fff;
}

@media (max-width: 800px) {
  .topics-filter-row {
    grid-template-columns: minmax(0, 1fr) minmax(180px, 1fr);
  }
  .topics-status-pills,
  .topics-filter-clear {
    grid-column: 1 / -1;
  }
  .topics-card-meta {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}

@media (max-width: 640px) {
  .topics-page {
    padding-top: 18px;
  }
  .topics-shell {
    gap: 22px;
  }
  .topics-filter-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .topics-card {
  }
  .topics-card-link {
    padding: 16px 14px;
  }
}
`;

export const ANALYTICS_PAGE_STYLES = `
.analytics-page {
  display: grid;
  gap: 48px;
  max-width: 960px;
  margin: 0 auto;
  padding: 28px 0 40px;
}
.analytics-header,
.analytics-block {
  display: grid;
  gap: 18px;
}
.analytics-block {
  padding: 24px 0 0;
  border-top: 1px solid var(--border);
}
.analytics-kicker,
.analytics-block-kicker,
.analytics-picker-label,
.analytics-metric-label,
.analytics-bar-label,
.analytics-dim-label,
.analytics-dim-value,
.analytics-funnel-kind,
.analytics-funnel-count,
.analytics-rh-label,
.analytics-rh-total,
.analytics-scatter-x-label,
.analytics-scatter-y-label,
.analytics-legend-item {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.analytics-title {
  margin: 0;
  font-size: clamp(2.4rem, 4.8vw, 4rem);
  line-height: 0.96;
}
.analytics-lede,
.analytics-block-meta,
.analytics-empty p {
  max-width: 70ch;
  color: var(--text-dim);
}
.analytics-block-head,
.analytics-reliability-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
}
.analytics-block-head--stacked {
  align-items: flex-start;
}
.analytics-range-controls {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}
.analytics-range-btn {
  padding-bottom: 4px;
  border-bottom: 1px solid transparent;
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-decoration: none;
  text-transform: uppercase;
}
.analytics-range-btn.active,
.analytics-range-btn:hover {
  border-color: var(--cyan);
  color: var(--cyan);
}
.analytics-metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
}
.analytics-metric {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  background: var(--surface);
}
.analytics-metric-label {
  color: var(--text-muted);
  font-size: 0.63rem;
}
.analytics-metric-value {
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 1.8rem;
  font-weight: 500;
}
.analytics-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 164px;
  overflow: hidden;
}
.analytics-bar-group {
  display: grid;
  flex: 1 1 0;
  min-width: 6px;
  gap: 8px;
}
.analytics-bar-stack {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 120px;
}
.analytics-bar {
  flex: 1 1 0;
  opacity: 0.8;
}
.analytics-bar--contributions {
  background: rgba(77, 103, 128, 0.7);
}
.analytics-bar--verdicts {
  background: rgba(77, 103, 128, 0.35);
}
.analytics-bar-group:hover .analytics-bar {
  opacity: 1;
}
.analytics-bar-label {
  color: var(--text-muted);
  font-size: 0.55rem;
}
.analytics-bar-label--muted {
  visibility: hidden;
}
.analytics-topic-picker,
.analytics-minvotes-control {
  display: grid;
  gap: 6px;
  min-width: min(100%, 280px);
}
.analytics-select {
  min-height: 40px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 0;
  background: #fff;
  color: var(--text);
  font: 0.9rem var(--font-body);
}
.analytics-select:focus {
  outline: none;
  border-color: var(--cyan);
}
.analytics-score-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(260px, 0.85fr);
  gap: 24px;
}
.analytics-score-panel,
.analytics-dimensions {
  display: grid;
  gap: 16px;
}
.analytics-histogram-chart {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 196px;
}
.analytics-histogram-col {
  display: grid;
  flex: 1 1 0;
  min-width: 18px;
  gap: 8px;
}
.analytics-histogram-col:hover {
  outline: 1px solid var(--border);
}
.analytics-histogram-stack {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 1px;
  height: 160px;
}
.analytics-hbar-segment {
  width: 100%;
}
.analytics-hbar--propose {
  background: #7b9ab2;
}
.analytics-hbar--critique {
  background: #a07a65;
}
.analytics-hbar--refine {
  background: #7a9e87;
}
.analytics-hbar--synthesize {
  background: #8a7aaa;
}
.analytics-hbar--map {
  background: #6a9aaa;
}
.analytics-hbar--final_argument {
  background: #aa8a6a;
}
.analytics-hbar-label {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.6rem;
  text-align: center;
}
.analytics-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.analytics-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-dim);
  font-size: 0.62rem;
}
.analytics-legend-swatch {
  width: 10px;
  height: 10px;
}
.analytics-dim-row {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr) 44px;
  gap: 10px;
  align-items: center;
}
.analytics-dim-label,
.analytics-dim-value {
  color: var(--text-dim);
  font-size: 0.65rem;
}
.analytics-dim-track {
  height: 6px;
  background: var(--border);
}
.analytics-dim-bar {
  height: 100%;
  background: rgba(77, 103, 128, 0.6);
}
.analytics-funnel {
  display: grid;
  gap: 10px;
}
.analytics-funnel-row {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr) 78px;
  gap: 10px;
  align-items: center;
}
.analytics-funnel-track {
  height: 8px;
  background: var(--border);
}
.analytics-funnel-bar {
  height: 100%;
  background: rgba(77, 103, 128, 0.5);
}
.analytics-funnel-kind,
.analytics-funnel-count {
  color: var(--text-dim);
  font-size: 0.62rem;
}
.analytics-reliability-histogram {
  display: grid;
  gap: 10px;
}
.analytics-rh-row {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr) 40px;
  gap: 8px;
  align-items: center;
  min-height: 20px;
}
.analytics-rh-row:hover {
  background: rgba(77, 103, 128, 0.04);
}
.analytics-rh-track {
  display: flex;
  height: 20px;
  overflow: hidden;
}
.analytics-rh-label,
.analytics-rh-total {
  color: var(--text-dim);
  font-size: 0.65rem;
}
.analytics-tier--unverified {
  background: #b0b5bc;
}
.analytics-tier--supervised {
  background: #8a9bac;
}
.analytics-tier--verified {
  background: #6a8c9f;
}
.analytics-tier--established {
  background: #4d6780;
}
.analytics-tier--trusted {
  background: #2e4a60;
}
.analytics-scatter {
  display: grid;
  gap: 12px;
}
.analytics-scatter-wrap {
  display: grid;
  gap: 8px;
}
.analytics-scatter-plot {
  position: relative;
  width: 100%;
  height: 200px;
  border-left: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  overflow: hidden;
}
.analytics-scatter-dot {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  transform: translate(-50%, 50%);
}
.analytics-scatter-dot::after {
  position: absolute;
  inset: -7px;
  content: "";
}
.analytics-scatter-dot:hover {
  transform: translate(-50%, 50%) scale(2);
  z-index: 1;
}
.analytics-empty {
  padding: 24px 0;
}

@media (max-width: 800px) {
  .analytics-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .analytics-score-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .analytics-page {
    gap: 36px;
    padding-top: 18px;
  }
  .analytics-block-head,
  .analytics-reliability-header {
    flex-direction: column;
    align-items: stretch;
  }
  .analytics-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .analytics-bars .analytics-bar-group:nth-last-child(n + 31) {
    display: none;
  }
  .analytics-dim-row,
  .analytics-funnel-row,
  .analytics-rh-row {
    grid-template-columns: 1fr;
  }
  .analytics-scatter-dot {
    width: 10px;
    height: 10px;
  }
}
`;

export const OG_CARD_BASE_STYLES = `
.lp-og-card {
  flex: 0 0 220px;
  display: grid;
  gap: 10px;
  min-height: 168px;
  padding: 14px 14px 12px;
  border: 1px solid rgba(120, 105, 79, 0.14);
  background: #f7f3eb;
  box-shadow:
    0 8px 20px rgba(64, 46, 18, 0.04),
    0 2px 6px rgba(64, 46, 18, 0.03);
  text-decoration: none;
  color: #201812;
  transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
}
.lp-og-card:hover {
  transform: translateY(-4px);
  box-shadow:
    0 14px 32px rgba(64, 46, 18, 0.07),
    0 4px 10px rgba(64, 46, 18, 0.05);
  border-color: rgba(120, 105, 79, 0.28);
}
.lp-og-card-chrome {
  display: grid;
  gap: 6px;
  align-content: start;
  height: 100%;
}
.lp-og-card h3,
.lp-og-card h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.05rem;
  line-height: 1.1;
  font-weight: 500;
  letter-spacing: -0.02em;
  min-height: calc(1.1em * 2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.lp-og-card p {
  margin: 0;
  font-size: 0.64rem;
  line-height: 1.48;
  color: rgba(60, 51, 37, 0.7);
  min-height: calc(1.48em * 3);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
`;

export const LANDING_PAGE_STYLES = `
${OG_CARD_BASE_STYLES}

/* ── Scroll-reveal primitives ── */
.lp-reveal {
  opacity: 0;
  transform: translateY(28px);
  transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1), transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
}
.lp-reveal.lp-visible {
  opacity: 1;
  transform: translateY(0);
}
/* stagger children */
.lp-thesis-cards .lp-reveal:nth-child(2) { transition-delay: 0.12s; }
.lp-features-grid .lp-reveal:nth-child(2) { transition-delay: 0.08s; }
.lp-features-grid .lp-reveal:nth-child(3) { transition-delay: 0.16s; }
.lp-features-grid .lp-reveal:nth-child(4) { transition-delay: 0.24s; }
.lp-features-grid .lp-reveal:nth-child(5) { transition-delay: 0.32s; }
.lp-features-grid .lp-reveal:nth-child(6) { transition-delay: 0.40s; }
.lp-process-steps .lp-reveal:nth-child(2) { transition-delay: 0.1s; }
.lp-process-steps .lp-reveal:nth-child(3) { transition-delay: 0.2s; }
.lp-process-steps .lp-reveal:nth-child(4) { transition-delay: 0.3s; }
.lp-process-steps .lp-reveal:nth-child(5) { transition-delay: 0.4s; }
.lp-vision-manifesto .lp-reveal:nth-child(2) { transition-delay: 0.15s; }
.lp-vision-manifesto .lp-reveal:nth-child(3) { transition-delay: 0.3s; }

.page-main--landing {
  width: 100%;
}
.landing-page {
  display: grid;
  gap: 0;
  scroll-snap-type: y proximity;
}
.landing-page > section {
  scroll-snap-align: start;
}

/* ── Fold: hero left + cards right ── */
.lp-fold {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  overflow: hidden;
  min-height: 100vh;
}
.lp-hero {
  display: grid;
  gap: 20px;
  align-content: center;
  padding: 64px 48px 64px max(24px, calc(50vw - 600px));
  text-align: left;
}
.lp-hero-kicker,
.lp-quickstart-kicker {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.lp-hero h1,
.lp-quickstart-copy h2 {
  margin: 0;
  font-size: clamp(2.4rem, 5vw, 4.4rem);
  line-height: 0.92;
  letter-spacing: -0.04em;
}
.lp-hero-lede,
.lp-quickstart-copy p {
  margin: 0;
  color: var(--text-dim);
  font-size: 1rem;
  line-height: 1.6;
}
.lp-hero-lede {
  max-width: 42ch;
}
.lp-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.lp-hero .lp-proof-bar {
  margin-top: 12px;
}
/* ── Card rail (right column) ── */
.lp-rail {
  display: grid;
  align-content: center;
  overflow: hidden;
}
.lp-rail-scroll {
  overflow: hidden;
  mask-image: linear-gradient(to right, transparent, black 4%, black 100%);
  -webkit-mask-image: linear-gradient(to right, transparent, black 4%, black 100%);
}
.lp-rail-track {
  display: flex;
  gap: 14px;
  padding: 12px 0 12px 12px;
  width: max-content;
  animation: lp-scroll 58s linear infinite;
}
.lp-rail-track:hover {
  animation-play-state: paused;
}

/* ── Proof bar (full width counters) ── */
.lp-proof-bar {
  width: min(100%, 640px);
  border: 1px solid var(--border);
  padding: 20px 24px;
  background: color-mix(in srgb, var(--bg) 92%, white 8%);
  box-shadow: 0 18px 48px rgba(7, 9, 12, 0.08);
}
.lp-proof-inner {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 24px;
}
.lp-hero-stat {
  display: grid;
  gap: 4px;
  text-align: center;
}
.lp-hero-stat strong {
  color: var(--text);
  font-family: var(--font-display);
  font-size: 2rem;
  line-height: 1;
  font-weight: 700;
  letter-spacing: -0.03em;
}
.lp-hero-stat span {
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

/* ── Quick start ── */
.lp-quickstart {
  display: grid;
  align-content: center;
  min-height: 100vh;
  padding: 80px 24px 56px;
}
.lp-qs-inner {
  display: grid;
  grid-template-columns: minmax(220px, 0.7fr) minmax(0, 1.3fr);
  gap: 28px;
  align-items: center;
  max-width: 1080px;
  margin: 0 auto;
}
.lp-quickstart-copy {
  display: grid;
  gap: 16px;
}
.lp-quickstart-copy h2 {
  font-size: clamp(1.8rem, 3.4vw, 3rem);
}
.lp-terminal {
  border: 1px solid #2a2b31;
  border-radius: 18px;
  overflow: hidden;
  background: #1a1b1e;
  box-shadow: 0 24px 70px rgba(7, 9, 12, 0.28);
}
.lp-terminal-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid #2e3036;
  background: #23252a;
}
.lp-terminal-dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
}
.lp-terminal-dot.red {
  background: #ff5f57;
}
.lp-terminal-dot.yellow {
  background: #febc2e;
}
.lp-terminal-dot.green {
  background: #28c840;
}
.lp-terminal-body {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 110px;
  padding: 24px 22px;
  color: #d7dde7;
  font-family: var(--font-mono);
  font-size: clamp(0.78rem, 1.4vw, 0.94rem);
  line-height: 1.5;
}
.lp-terminal-prompt {
  color: #72e18d;
  flex-shrink: 0;
}
.lp-terminal-output {
  min-width: 0;
  word-break: break-word;
}
.lp-term-cursor {
  display: inline-block;
  width: 0.7ch;
  color: #72e18d;
  animation: lp-blink 1s step-end infinite;
}

@keyframes lp-blink {
  50% {
    opacity: 0;
  }
}
@keyframes lp-scroll {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}

/* ── Hero subtitle ── */
.lp-hero-subtitle {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.1rem, 2vw, 1.4rem);
  font-weight: 400;
  font-style: italic;
  color: var(--text-dim);
  line-height: 1.35;
}
/* ── Hero scroll hint ── */

/* ── Shared section kicker ── */
.lp-section-kicker {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

/* ── Thesis section (white + glow) ── */
.lp-thesis {
  display: grid;
  align-content: center;
  min-height: 100vh;
  padding: 80px 24px;
  background: #fff;
  position: relative;
  overflow: hidden;
  border-top: 1px solid var(--border);
}
.lp-thesis-glow {
  position: absolute;
  top: -40%;
  left: 50%;
  transform: translateX(-50%);
  width: 800px;
  height: 800px;
  background: radial-gradient(circle, rgba(77, 103, 128, 0.06) 0%, transparent 70%);
  pointer-events: none;
  animation: lp-glow-pulse 8s ease-in-out infinite alternate;
}
@keyframes lp-glow-pulse {
  from { opacity: 0.6; transform: translateX(-50%) scale(1); }
  to { opacity: 1; transform: translateX(-50%) scale(1.15); }
}
.lp-thesis-inner {
  display: grid;
  gap: 40px;
  max-width: 1080px;
  margin: 0 auto;
  position: relative;
  z-index: 1;
}
.lp-thesis-inner h2 {
  margin: 0;
  font-size: clamp(1.8rem, 3.4vw, 2.8rem);
  line-height: 1.05;
  letter-spacing: -0.03em;
  max-width: 22ch;
}
.lp-thesis-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
}
.lp-thesis-card {
  display: grid;
  gap: 14px;
  padding: 36px 30px 28px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
  position: relative;
  overflow: hidden;
  transition: border-color 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease;
}
.lp-thesis-card:hover {
  border-color: var(--cyan);
  box-shadow: 0 16px 48px rgba(77, 103, 128, 0.1);
  transform: translateY(-4px);
}
.lp-thesis-card::before {
  content: attr(data-num);
  position: absolute;
  top: -22px;
  right: -8px;
  font-family: var(--font-display);
  font-size: 9rem;
  font-weight: 700;
  line-height: 1;
  color: rgba(77, 103, 128, 0.05);
  pointer-events: none;
}
.lp-thesis-card-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: rgba(77, 103, 128, 0.07);
  border: 1px solid rgba(77, 103, 128, 0.12);
  color: var(--cyan);
}
.lp-thesis-card-num {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.12em;
}
.lp-thesis-card h3 {
  margin: 0;
  font-size: 1.3rem;
  letter-spacing: -0.02em;
}
.lp-thesis-card p {
  margin: 0;
  color: var(--text-dim);
  font-size: 0.95rem;
  line-height: 1.65;
}
.lp-thesis-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 4px;
}
.lp-thesis-card-tags span {
  padding: 3px 10px;
  border-radius: 100px;
  border: 1px solid rgba(77, 103, 128, 0.18);
  background: rgba(77, 103, 128, 0.05);
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* ── Features grid ── */
.lp-features {
  display: grid;
  align-content: center;
  min-height: 100vh;
  padding: 80px 24px;
  background: var(--surface);
  border-top: 1px solid var(--border);
}
.lp-features-inner {
  display: grid;
  gap: 48px;
  max-width: 1080px;
  margin: 0 auto;
}
.lp-features-header {
  display: grid;
  gap: 12px;
}
.lp-features-header h2 {
  margin: 0;
  font-size: clamp(1.8rem, 3.4vw, 2.8rem);
  line-height: 1.05;
  letter-spacing: -0.03em;
  max-width: 24ch;
}
.lp-features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.lp-feature-card {
  display: grid;
  gap: 12px;
  align-content: start;
  padding: 28px 24px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--bg);
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease, border-color 0.3s ease;
  position: relative;
  overflow: hidden;
}
.lp-feature-card::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--cyan), transparent);
  opacity: 0;
  transition: opacity 0.3s ease;
}
.lp-feature-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0,0,0,0.06);
  border-color: var(--cyan);
}
.lp-feature-card:hover::after {
  opacity: 1;
}
.lp-feature-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(77, 103, 128, 0.08);
  border: 1px solid rgba(77, 103, 128, 0.15);
  color: var(--cyan);
}
.lp-feature-card h3 {
  margin: 0;
  font-size: 1.05rem;
  letter-spacing: -0.01em;
}
.lp-feature-card p {
  margin: 0;
  color: var(--text-dim);
  font-size: 0.88rem;
  line-height: 1.6;
}

/* ── Origin section (centered editorial) ── */
.lp-origin {
  display: grid;
  align-content: center;
  min-height: 100vh;
  padding: 80px 24px;
}
.lp-origin-inner {
  display: grid;
  gap: 32px;
  max-width: 680px;
  margin: 0 auto;
  text-align: center;
}
.lp-origin-narrative {
  display: grid;
  gap: 24px;
}
.lp-origin-narrative h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(2rem, 4vw, 3.2rem);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.03em;
}
.lp-origin-narrative p {
  margin: 0;
  color: var(--text-dim);
  font-size: 1.05rem;
  line-height: 1.75;
  text-align: left;
}
.lp-origin-narrative p.lp-origin-punchline {
  text-align: center;
  color: var(--text);
  font-family: var(--font-display);
  font-size: clamp(1.6rem, 3vw, 2.2rem);
  font-style: italic;
  font-weight: 500;
  line-height: 1.2;
  letter-spacing: -0.02em;
  padding: 20px 0;
}
.lp-origin-scale {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 32px;
  justify-content: center;
  padding: 12px 0;
}
.lp-origin-scale span {
  padding: 8px 20px;
  border: 1px solid var(--border);
  border-radius: 100px;
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.82rem;
  letter-spacing: 0.06em;
  background: var(--surface);
  transition: transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
}
.lp-origin-scale span[data-count]:hover {
  transform: scale(1.08);
  border-color: var(--cyan);
  box-shadow: 0 4px 20px rgba(77, 103, 128, 0.12);
}
.lp-origin-arrow {
  padding: 0 !important;
  border: none !important;
  background: none !important;
  color: var(--border) !important;
  font-size: 1.2rem !important;
  display: flex;
  align-items: center;
}

/* ── Process section (alt background, icons + timeline) ── */
.lp-process {
  display: grid;
  align-content: center;
  min-height: 100vh;
  padding: 80px 24px;
  background: var(--surface-alt);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.lp-process-inner {
  display: grid;
  gap: 48px;
  max-width: 1080px;
  margin: 0 auto;
}
.lp-process-inner h2 {
  margin: 0;
  font-size: clamp(1.8rem, 3.4vw, 2.8rem);
  line-height: 1;
  letter-spacing: -0.03em;
  max-width: 24ch;
}
.lp-process-steps {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0;
  counter-reset: step;
}
.lp-process-step {
  display: grid;
  gap: 12px;
  align-content: start;
  padding: 28px 22px;
  border-left: 1px solid var(--border);
  position: relative;
  counter-increment: step;
  transition: background 0.3s ease;
}
.lp-process-step:first-child {
  border-left: none;
}
.lp-process-step:hover {
  background: rgba(255,255,255,0.5);
}
.lp-process-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(77, 103, 128, 0.08);
  border: 1px solid rgba(77, 103, 128, 0.15);
  color: var(--cyan);
  transition: background 0.3s ease, border-color 0.3s ease;
}
.lp-process-step:hover .lp-process-icon {
  background: rgba(77, 103, 128, 0.14);
  border-color: var(--cyan);
}
.lp-process-step::before {
  content: counter(step, decimal-leading-zero);
  font-family: var(--font-display);
  font-size: 3.2rem;
  font-weight: 700;
  line-height: 1;
  color: var(--border);
  letter-spacing: -0.04em;
  transition: color 0.3s ease;
}
.lp-process-step:hover::before {
  color: var(--cyan);
}
.lp-process-num {
  display: none;
}
.lp-process-step h3 {
  margin: 0;
  font-size: 1.1rem;
  letter-spacing: -0.01em;
}
.lp-process-step p {
  margin: 0;
  color: var(--text-dim);
  font-size: 0.88rem;
  line-height: 1.6;
}

/* ── Vision section (white + glow) ── */
.lp-vision {
  display: grid;
  align-content: center;
  min-height: 100vh;
  padding: 100px 24px;
  background: #fff;
  border-top: 1px solid var(--border);
  position: relative;
  overflow: hidden;
}
.lp-vision-glow {
  position: absolute;
  bottom: -30%;
  left: 50%;
  transform: translateX(-50%);
  width: 900px;
  height: 900px;
  background: radial-gradient(circle,
    rgba(77, 103, 128, 0.05) 0%,
    rgba(123, 98, 88, 0.03) 40%,
    transparent 70%);
  pointer-events: none;
  animation: lp-glow-pulse 10s ease-in-out infinite alternate;
}
.lp-vision-inner {
  display: grid;
  gap: 40px;
  max-width: 760px;
  margin: 0 auto;
  text-align: center;
  position: relative;
  z-index: 1;
}
.lp-vision-quote {
  margin: 0;
  padding: 0;
  position: relative;
}
.lp-vision-quote::before {
  content: "\\201C";
  position: absolute;
  top: -40px;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-display);
  font-size: 6rem;
  color: rgba(77, 103, 128, 0.1);
  line-height: 1;
  pointer-events: none;
}
.lp-vision-quote p {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(2.2rem, 4.5vw, 3.4rem);
  font-style: italic;
  font-weight: 500;
  line-height: 1.1;
  letter-spacing: -0.03em;
  color: var(--text);
}
.lp-vision-body {
  margin: 0;
  color: var(--text-dim);
  font-size: 1.05rem;
  line-height: 1.75;
  max-width: 54ch;
  margin: 0 auto;
}
.lp-vision-manifesto {
  display: grid;
  gap: 14px;
  padding-top: 28px;
}
.lp-vision-manifesto p {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.2rem, 2.2vw, 1.5rem);
  font-style: italic;
  color: var(--text-muted);
  line-height: 1.3;
  opacity: 0.5;
  transition: opacity 0.7s ease;
}
.lp-vision-manifesto p.lp-visible {
  opacity: 0.7;
}
.lp-vision-manifesto p:nth-child(2).lp-visible {
  opacity: 0.85;
}
.lp-vision-manifesto p:last-child {
  color: var(--cyan);
  font-size: clamp(1.3rem, 2.4vw, 1.65rem);
}
.lp-vision-manifesto p:last-child.lp-visible {
  opacity: 1;
}

@media (max-width: 800px) {
  .lp-fold {
    grid-template-columns: 1fr;
    min-height: auto;
  }
  .lp-hero {
    padding: 32px 24px 32px;
  }
  .lp-rail-scroll {
    mask-image: linear-gradient(to right, transparent, black 3%, black 97%, transparent);
    -webkit-mask-image: linear-gradient(to right, transparent, black 3%, black 97%, transparent);
  }
  .lp-rail-track {
    padding: 12px 24px;
  }
  .lp-qs-inner {
    grid-template-columns: 1fr;
  }
  .lp-thesis-cards {
    grid-template-columns: 1fr;
  }
  .lp-features-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .lp-process-steps {
    grid-template-columns: repeat(3, 1fr);
  }
  .lp-process-step:nth-child(4) {
    border-left: none;
  }
  .lp-thesis,
  .lp-origin,
  .lp-process,
  .lp-features {
    padding: 56px 24px;
    min-height: auto;
  }
  .lp-vision {
    padding: 72px 24px;
    min-height: auto;
  }
  .lp-quickstart {
    min-height: auto;
  }
}
@media (max-width: 640px) {
  .lp-hero {
    padding: 28px 18px 28px;
    gap: 16px;
  }
  .lp-hero h1 {
    font-size: clamp(2rem, 8vw, 2.8rem);
  }
  .lp-rail-track {
    gap: 10px;
    padding: 8px 18px;
  }
  .lp-og-card {
    min-height: 0;
    padding: 12px 12px 10px;
  }
  .lp-proof-inner {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  .lp-proof-bar {
    width: 100%;
    padding: 18px;
  }
  .lp-quickstart {
    padding: 56px 18px 40px;
  }
  .lp-terminal-body {
    min-height: 96px;
    padding: 20px 18px;
    font-size: 0.75rem;
  }
  .lp-features-grid {
    grid-template-columns: 1fr;
  }
  .lp-process-steps {
    grid-template-columns: 1fr;
  }
  .lp-process-step {
    border-left: none;
    border-top: 1px solid var(--border);
    padding: 20px 0;
  }
  .lp-process-step:first-child {
    border-top: none;
  }
  .lp-process-step::before {
    font-size: 2.4rem;
  }
  .lp-fold {
    min-height: auto;
  }
  .lp-thesis,
  .lp-origin,
  .lp-process,
  .lp-features {
    padding: 48px 18px;
    min-height: auto;
  }
  .lp-vision {
    padding: 56px 18px;
    min-height: auto;
  }
  .lp-quickstart {
    min-height: auto;
  }
  .lp-origin-arrow { display: none; }
  .lp-origin-scale { gap: 8px 12px; }
  .lp-thesis-card { padding: 24px 20px; }
  .lp-thesis-card::before { font-size: 6rem; }
}
`;
export const TOPIC_DETAIL_PAGE_STYLES = `
.structured-label {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-top: 16px;
}
.structured-label:first-child {
  margin-top: 0;
}
.topic-page {
  display: grid;
  gap: 28px;
  padding-top: 18px;
}
.topic-above-fold {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(280px, 0.88fr);
  gap: 24px;
  align-items: start;
  padding-bottom: 32px;
}
.topic-hero-col,
.topic-header,
.topic-meta-panel,
.topic-verdict-panel,
.topic-verdict-panel-copy,
.topic-transcript-section,
.topic-transcript,
.topic-round-summary-copy,
.topic-round-body,
.topic-contribution-card,
.topic-contribution-meta,
.topic-contribution-body {
  display: grid;
}
.topic-hero-col {
  gap: 22px;
}
.topic-header {
  gap: 16px;
}
.topic-header-kicker,
.topic-meta-stat-label,
.topic-verdict-kicker,
.topic-round-index,
.topic-round-summary-label,
.topic-round-summary-meta,
.topic-score-label,
.topic-contribution-rank,
.topic-verdict-section-kicker,
.topic-verdict-item-meta,
.topic-verdict-item-score,
.topic-claim-status,
.topic-transcript-kicker,
.topic-transcript-meta {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.topic-header-kicker {
  display: flex;
  gap: 8px;
  align-items: center;
  color: var(--text-muted);
}
.topic-kicker-domain {
  color: var(--text-dim);
  text-decoration: none;
}
.topic-kicker-domain:hover {
  color: var(--cyan);
}
.topic-kicker-status {
  color: var(--cyan);
}
.topic-kicker-sep {
  color: var(--border);
}
.topic-header-prompt {
  max-width: 28ch;
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.6rem, 3.2vw, 2.4rem);
  line-height: 1.08;
  font-weight: 700;
}
.topic-header-description {
  margin: 0;
  max-width: 62ch;
  font-size: 0.95rem;
  line-height: 1.55;
  color: var(--text-muted);
}
.topic-header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.topic-header-pill {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 15px;
  background: transparent;
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-decoration: none;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.topic-header-pill:hover {
  border-color: var(--cyan);
  color: var(--text);
}
.topic-share-wrap {
  position: relative;
}
.topic-share-menu[hidden] {
  display: none;
}
.topic-share-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 10;
  display: grid;
  gap: 0;
  min-width: 160px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
}
.topic-share-option {
  display: block;
  padding: 8px 14px;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  color: var(--text-dim);
  text-decoration: none;
  background: none;
  border: none;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  text-align: left;
  width: 100%;
}
.topic-share-option:last-child {
  border-bottom: none;
}
.topic-share-option:hover {
  background: color-mix(in srgb, var(--cyan) 8%, transparent);
  color: var(--text);
}
.topic-featured-answer {
  display: grid;
  gap: 16px;
  padding: 20px 22px 18px;
  border: 1px solid color-mix(in srgb, var(--cyan) 22%, var(--border));
  background: var(--surface);
}
.topic-featured-kicker {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.topic-featured-body {
  margin: 0;
  padding: 0;
  border: 0;
}
.topic-featured-body .topic-contribution-paragraph {
  margin: 0;
  color: var(--text);
  font-size: 1rem;
  line-height: 1.62;
}
.topic-featured-body .topic-contribution-paragraph + .topic-contribution-paragraph {
  margin-top: 1rem;
}
.topic-featured-footer {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.topic-featured-handle {
  color: var(--text);
  font-weight: 500;
}
.topic-featured-round {
  color: var(--text-muted);
}
.topic-featured-score-chip,
.topic-score-chip {
  display: grid;
  gap: 4px;
}
.topic-featured-score-chip {
  margin-left: auto;
  min-width: 108px;
  justify-items: end;
}
.topic-featured-score-num {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 1.3rem;
  line-height: 1;
}
.topic-featured-score-bar-track {
  width: 100%;
  height: 4px;
  background: var(--border);
}
.topic-score-bar-track {
  width: 100%;
  height: 3px;
  background: var(--border);
  opacity: 0.5;
}
.topic-featured-score-bar-fill,
.topic-score-bar-fill {
  display: block;
  height: 100%;
  background: var(--cyan);
}
.topic-featured-score-label {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.58rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.topic-meta-panel {
  gap: 14px;
  align-content: start;
}
.topic-verdict-panel {
  gap: 16px;
  padding: 20px 20px 18px;
  border: 1px solid color-mix(in srgb, var(--cyan) 20%, var(--border));
  background: var(--surface);
}
.topic-verdict-panel--pending,
.topic-verdict-panel--unavailable,
.topic-verdict-panel--open {
  background: color-mix(in srgb, var(--surface) 88%, white 12%);
}
.topic-verdict-panel-head {
  display: grid;
  gap: 10px;
}
.topic-verdict-panel-copy {
  gap: 8px;
}
.topic-verdict-panel-copy h2 {
  margin: 0;
  font-size: clamp(1.5rem, 2.7vw, 2rem);
  line-height: 1.02;
}
.topic-verdict-lede {
  margin: 0;
  color: var(--text);
  font-size: 0.98rem;
}
.topic-verdict-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.topic-meta-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.topic-meta-stat {
  display: grid;
  gap: 4px;
  padding: 12px 12px 10px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-alt) 78%, white 22%);
}
.topic-meta-stat-value {
  color: var(--text);
  font-family: var(--font-display);
  font-size: 1.15rem;
  line-height: 1.05;
}
.topic-meta-supporting-copy {
  margin: 0;
  color: var(--text-dim);
  font-size: 0.92rem;
}
.topic-verdict-summary {
  display: grid;
  gap: 18px;
  padding: 28px 0;
  border-bottom: 1px solid var(--border);
}
.topic-verdict-header {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}
.topic-verdict-header h2 {
  margin: 0.35rem 0 0;
  font-size: clamp(1.55rem, 2.8vw, 2.2rem);
  line-height: 1.02;
}
.topic-verdict-confidence {
  display: grid;
  grid-template-columns: minmax(150px, 180px) minmax(0, 1fr);
  gap: 16px;
  padding-top: 4px;
  border-top: 1px solid color-mix(in srgb, var(--cyan) 16%, var(--border));
}
.topic-verdict-confidence strong {
  display: block;
  margin-top: 6px;
  font-family: var(--font-display);
  font-size: clamp(1.6rem, 3vw, 2.2rem);
  line-height: 1;
}
.topic-verdict-scoreboard {
  border: 0;
  padding: 0;
  background: none;
  border-top: 1px solid var(--border);
}
.topic-verdict-section {
  display: grid;
  gap: 16px;
  padding: 28px 0;
  border-bottom: 1px solid var(--border);
}
.topic-verdict-section-head {
  display: grid;
  gap: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
}
.topic-verdict-section-head h3,
.topic-verdict-item h4,
.topic-claim-card h4,
.topic-transcript-head h2 {
  margin: 0;
  font-size: 1.1rem;
  line-height: 1.14;
}
.topic-verdict-list,
.topic-claim-grid {
  display: grid;
  gap: 12px;
}
.topic-verdict-item,
.topic-claim-card {
  display: grid;
  gap: 10px;
  padding: 16px 0;
  border-top: 1px solid var(--border);
}
.topic-verdict-item:first-child,
.topic-claim-card:first-child {
  padding-top: 0;
  border-top: 0;
}
.topic-verdict-item-topline,
.topic-claim-card-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: start;
}
.topic-verdict-item-score,
.topic-claim-status {
  color: var(--text-muted);
}
.topic-verdict-empty {
  padding: 12px 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}
.topic-claim-relations {
  display: grid;
  gap: 10px;
  padding-top: 4px;
  border-top: 1px solid var(--border);
}
.topic-claim-relation {
  display: grid;
  grid-template-columns: auto auto 1fr;
  gap: 10px 14px;
  align-items: baseline;
}
.topic-claim-relation strong {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.topic-claim-relation span {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.74rem;
}
.topic-claim-relation p {
  grid-column: 1 / -1;
}
.topic-transcript-section {
  gap: 18px;
  padding: 2px 0 0;
}
.topic-transcript-head {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: end;
}
.topic-transcript-head > div {
  display: grid;
  gap: 6px;
}
.topic-transcript-meta {
  color: var(--text-muted);
}
.topic-transcript {
  gap: 0;
}
.topic-transcript-empty,
.topic-round-empty {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.92rem;
}
.topic-round-details {
  border-top: 1px solid var(--border);
}
.topic-round-details:first-child {
  border-top: 0;
}
.topic-round-summary-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 16px;
  align-items: center;
  padding: 18px 0;
  cursor: pointer;
  list-style: none;
}
.topic-round-summary-row::-webkit-details-marker {
  display: none;
}
.topic-round-summary-left {
  display: flex;
  gap: 12px;
  align-items: start;
  min-width: 0;
}
.topic-round-index {
  min-width: 2.25rem;
}
.topic-round-summary-copy {
  gap: 4px;
}
.topic-round-summary-copy h4 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.18rem;
  line-height: 1.1;
}
.topic-round-summary-label {
  color: var(--text-muted);
}
.topic-round-summary-meta {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  justify-content: flex-end;
  color: var(--text-muted);
}
.topic-round-summary-topscore {
  display: inline-grid;
  gap: 3px;
}
.topic-round-summary-topscore strong {
  color: var(--text);
  font-size: 0.9rem;
  letter-spacing: 0;
}
.topic-round-toggle {
  width: 1rem;
  text-align: right;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 1rem;
  line-height: 1;
}
.topic-round-toggle::before {
  content: "+";
}
.topic-round-details[open] .topic-round-summary-row {
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border);
}
.topic-round-details[open] .topic-round-toggle::before {
  content: "−";
}
.topic-round-body {
  gap: 12px;
  padding: 14px 0 0;
}
.topic-contribution-card {
  gap: 12px;
  padding: 16px 18px;
  border: 1px solid var(--border);
  background: var(--surface);
}
.topic-contribution-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: start;
}
.topic-contribution-identity {
  display: flex;
  gap: 12px;
  align-items: start;
}
.topic-contribution-rank {
  min-width: 2.5rem;
}
.topic-contribution-meta {
  gap: 2px;
  color: var(--text-muted);
}
.topic-contribution-meta strong {
  color: var(--text);
  font-family: var(--font-body);
  font-size: 0.92rem;
  letter-spacing: 0;
  text-transform: none;
}
.topic-contribution-meta span:last-child {
  font-size: 0.72rem;
  letter-spacing: 0.08em;
}
.topic-score-chip {
  min-width: 104px;
}
.topic-score-num {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.78rem;
  line-height: 1;
  opacity: 0.7;
}
.topic-contribution-body {
  gap: 0;
}
.topic-contribution-paragraph {
  max-width: 68ch;
  margin: 0;
  overflow-wrap: break-word;
  word-break: break-word;
  color: var(--text);
  font-size: 0.97rem;
  line-height: 1.65;
}
.topic-contribution-paragraph + .topic-contribution-paragraph {
  margin-top: 1rem;
}
.topic-share-panel {
  display: grid;
  gap: 18px;
  padding: 28px 0 0;
  border-top: 1px solid var(--border);
  background: none;
}
.topic-share-head {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
}
.topic-share-copy {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.topic-share-kicker {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.topic-share-copy h3 {
  margin: 0;
  font-size: 1.35rem;
  line-height: 1.08;
}
.topic-share-lede {
  max-width: 58ch;
  color: var(--text);
}
.topic-share-meta {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  justify-content: flex-end;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.topic-share-meta span {
  display: grid;
  gap: 3px;
}
.topic-share-meta strong {
  color: var(--text-muted);
  font-weight: 500;
}
.topic-share-meta span span {
  color: var(--text);
  font-size: 0.78rem;
  letter-spacing: 0.01em;
  text-transform: none;
}
.topic-share-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.topic-share-actions .button,
.topic-share-actions button {
  border-radius: 0;
  box-shadow: none;
}
.topic-share-status {
  color: var(--text-muted);
  font-size: 0.72rem;
}

@media (max-width: 800px) {
  .topic-above-fold {
    grid-template-columns: 1fr;
  }
  .topic-meta-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .topic-verdict-item-topline,
  .topic-claim-card-head,
  .topic-share-head,
  .topic-contribution-head,
  .topic-transcript-head {
    flex-direction: column;
    align-items: start;
  }
  .topic-verdict-confidence,
  .topic-round-summary-row {
    grid-template-columns: 1fr;
  }
  .topic-round-summary-meta,
  .topic-share-meta {
    justify-content: flex-start;
  }
  .topic-round-toggle {
    display: none;
  }
}

@media (max-width: 640px) {
  .topic-page {
    gap: 24px;
    padding-top: 12px;
  }
  .topic-above-fold {
    gap: 18px;
    padding-bottom: 24px;
  }
  .topic-header {
    gap: 12px;
  }
  .topic-header-actions {
    gap: 6px;
  }
  .topic-featured-answer,
  .topic-verdict-panel,
  .topic-contribution-card {
    padding: 16px;
  }
  .topic-featured-score-chip {
    margin-left: 0;
    justify-items: start;
  }
  .topic-meta-stats,
  .topic-claim-relation {
    grid-template-columns: 1fr;
  }
  .topic-contribution-identity {
    flex-direction: column;
    gap: 8px;
  }
  .topic-score-chip {
    min-width: 0;
  }
  .topic-contribution-paragraph {
    max-width: 100%;
    font-size: 0.95rem;
  }
  .topic-share-actions {
    flex-direction: column;
  }
  .topic-share-actions .button,
  .topic-share-actions button {
    width: 100%;
    justify-content: center;
  }
}

/* OPN-218 topic page editorial overhaul overrides */
.topic-page {
  gap: 0;
  padding-top: 20px;
  padding-bottom: 64px;
}
.topic-above-fold {
  grid-template-columns: minmax(0, 720px) minmax(260px, 320px);
  justify-content: end;
  gap: 12px;
  padding-bottom: 36px;
}
.topic-hero-col {
  gap: 24px;
}
.topic-header,
.topic-verdict-closure,
.topic-opening-synthesis,
.topic-featured-answer {
  max-width: 720px;
}
.topic-header-prompt {
  max-width: 15ch;
}
.topic-editorial,
.topic-confidence-widget,
.topic-score-story,
.topic-score-story-head,
.topic-highlights,
.topic-highlights-head,
.topic-narrative,
.topic-narrative-head,
.topic-narrative-copy,
.topic-transcript-section,
.topic-round-body,
.topic-contribution-card,
.topic-contribution-meta,
.topic-contribution-body {
  display: grid;
}
.topic-editorial {
  gap: 16px;
}
.topic-editorial-kicker,
.topic-confidence-kicker,
.topic-score-story-kicker,
.topic-highlights-kicker,
.topic-narrative-kicker {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.topic-editorial-body {
  display: grid;
  color: var(--text);
  font-size: 1.02rem;
  line-height: 1.68;
}
.topic-editorial-body p + p {
  margin-top: 1em;
}
.topic-editorial-stance {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.topic-stance-marker {
  padding: 4px 9px;
  border: 1px solid color-mix(in srgb, var(--cyan) 28%, var(--border));
  background: color-mix(in srgb, var(--cyan) 10%, var(--surface));
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.topic-stance-confidence,
.topic-confidence-label,
.topic-score-story-meta,
.topic-round-stat,
.topic-contribution-rank,
.topic-contribution-handle,
.topic-highlight-meta,
.topic-highlight-score,
.topic-narrative-round {
  color: var(--text-muted);
  font-family: var(--font-mono);
}
.topic-confidence-widget {
  gap: 10px;
  padding: 18px 20px 16px;
  border: 1px solid color-mix(in srgb, var(--cyan) 22%, var(--border));
  background: var(--surface);
}
.topic-confidence-widget--pending,
.topic-confidence-widget--unavailable,
.topic-confidence-widget--open {
  border-color: var(--border);
  background: color-mix(in srgb, var(--surface) 88%, white 12%);
}
.topic-confidence-score {
  font-family: var(--font-display);
  font-size: clamp(2.2rem, 4vw, 3rem);
  line-height: 1;
}
.topic-confidence-explanation {
  margin: 0;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 0.88rem;
}
.topic-meta-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.topic-meta-stats {
  gap: 8px;
}
.topic-meta-stat {
  padding: 10px 12px;
}
.topic-score-story,
.topic-highlights,
.topic-narrative {
  gap: 20px;
  padding: 32px 0;
  border-bottom: 1px solid var(--border);
}
.topic-score-story-head h2,
.topic-highlights-head h3,
.topic-narrative-head h3,
.topic-transcript-head h2,
.topic-highlight-excerpt,
.topic-narrative-copy h4 {
  margin: 0;
  font-size: 1.15rem;
  line-height: 1.12;
}
.topic-score-arcs {
  display: grid;
  gap: 0;
  overflow-x: auto;
}
.topic-score-arc-header,
.topic-score-arc-row {
  display: grid;
  grid-template-columns: minmax(100px, 130px) 1fr minmax(80px, 90px);
  gap: 14px;
  align-items: end;
}
.topic-score-arc-header {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.topic-score-arc-row {
  align-items: stretch;
  padding: 14px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
}
.topic-score-arc-row--top .topic-score-arc-final-num {
  color: var(--cyan);
}
.topic-score-arc-handle,
.topic-score-arc-final-label {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
}
.topic-score-arc-rounds-head,
.topic-score-arc-rounds {
  display: grid;
  grid-template-columns: repeat(5, minmax(44px, 1fr));
  gap: 10px;
}
.topic-score-arc-rounds-head span {
  text-align: center;
}
.topic-score-arc-round {
  display: grid;
  gap: 8px;
  justify-items: center;
}
.topic-score-arc-round-bar-track {
  display: flex;
  align-items: end;
  width: 100%;
  max-width: 24px;
  height: 46px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-alt) 82%, white 18%);
}
.topic-score-arc-round-bar-fill {
  display: block;
  width: 100%;
  background: var(--text-muted);
}
.topic-score-arc-round--leader .topic-score-arc-round-bar-fill {
  background: var(--cyan);
}
.topic-score-arc-round-num {
  font-family: var(--font-mono);
  font-size: 0.72rem;
}
.topic-score-arc-final {
  display: grid;
  gap: 4px;
  justify-items: end;
}
.topic-score-arc-final-num {
  font-family: var(--font-display);
  font-size: 1.35rem;
  line-height: 1;
}
.topic-highlights-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.topic-highlight-card {
  gap: 12px;
  padding: 18px;
}
.topic-highlight-topline,
.topic-share-head {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
}
.topic-highlight-excerpt {
  font-family: var(--font-display);
  font-style: italic;
}
.topic-highlight-reason {
  margin: 0;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.topic-narrative-list {
  display: grid;
  gap: 0;
}
.topic-narrative-beat {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: 18px;
  padding: 14px 0;
  border-top: 1px solid var(--border);
}
.topic-narrative-beat:first-child {
  padding-top: 0;
  border-top: 0;
}
.topic-transcript-section {
  gap: 18px;
  padding: 32px 0 0;
}
.topic-transcript-head {
  align-items: end;
}
.topic-round {
  border-top: 1px solid var(--border);
}
.topic-round:first-child {
  border-top: 0;
}
.topic-round-summary {
  padding: 18px 0;
  cursor: pointer;
  list-style: none;
}
.topic-round-summary::-webkit-details-marker,
.topic-contribution-expand-details summary::-webkit-details-marker {
  display: none;
}
.topic-round-summary-bar {
  display: grid;
  gap: 10px;
}
.topic-round-stats-bar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.topic-round-expand-hint::before {
  content: "+";
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 1rem;
}
.topic-round[open] .topic-round-summary {
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border);
}
.topic-round[open] .topic-round-expand-hint::before {
  content: "-";
}
.topic-round-body {
  gap: 12px;
  padding: 14px 0 0;
}
.topic-contribution-card {
  gap: 12px;
}
.topic-contribution-meta {
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
}
.topic-contribution-meta-left {
  display: grid;
  gap: 4px;
}
.topic-contribution-expand-details summary {
  list-style: none;
  cursor: pointer;
}
.topic-contribution-expand-details summary > .topic-contribution-paragraph {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.topic-contribution-expand-details[open] summary > .topic-contribution-paragraph {
  display: block;
  -webkit-line-clamp: unset;
  overflow: visible;
}
.topic-contribution-expand-btn {
  margin-top: 10px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.topic-contribution-expand-details[open] .topic-contribution-expand-btn {
  display: none;
}

@media (max-width: 800px) {
  .topic-above-fold {
    grid-template-columns: 1fr;
  }
  .topic-score-arc-header,
  .topic-score-arc-row {
    min-width: 540px;
  }
  .topic-highlights-grid {
    grid-template-columns: 1fr 1fr;
  }
  .topic-narrative-beat {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .topic-page {
    grid-template-columns: minmax(0, 1fr);
    padding-top: 12px;
    padding-bottom: 48px;
  }
  .topic-above-fold {
    grid-template-columns: minmax(0, 1fr);
    justify-content: stretch;
    gap: 20px;
    padding-bottom: 24px;
  }
  .topic-hero-col,
  .topic-header,
  .topic-meta-panel,
  .convergence-map,
  .topic-verdict-closure,
  .topic-opening-synthesis,
  .topic-featured-answer,
  .topic-highlights,
  .dissenting-views,
  .dossier-secondary-section {
    min-width: 0;
    width: 100%;
    max-width: 100%;
  }
  .topic-header-kicker {
    flex-wrap: wrap;
    row-gap: 4px;
  }
  .topic-header-prompt {
    max-width: none;
  }
  .topic-header-actions {
    display: grid;
    grid-template-columns: 1fr;
    align-items: stretch;
  }
  .topic-header-pill,
  .topic-share-wrap {
    width: 100%;
  }
  .topic-header-pill {
    justify-content: center;
  }
  .topic-share-menu {
    left: 0;
    right: 0;
    min-width: 0;
  }
  .topic-featured-answer,
  .topic-confidence-widget,
  .topic-highlight-card,
  .topic-contribution-card {
    padding: 16px;
  }
  .topic-highlights-grid,
  .topic-meta-stats {
    grid-template-columns: 1fr;
  }
  .topic-contribution-meta {
    grid-template-columns: 1fr;
  }
  .topic-score-arc-header,
  .topic-score-arc-row {
    min-width: 380px;
    grid-template-columns: minmax(84px, 96px) minmax(180px, 1fr) minmax(52px, 64px);
    gap: 10px;
  }
  .topic-score-arc-rounds-head,
  .topic-score-arc-rounds {
    gap: 6px;
  }
  .topic-score-arc-round-bar-track {
    max-width: 18px;
  }
  .topic-score-arc-final {
    justify-items: start;
  }
}

/* --- Dossier --- */

.dossier-executive-summary,
.dossier-best-supported,
.dossier-most-contested {
  display: grid;
  gap: 20px;
  padding: 32px 0;
  border-bottom: 1px solid var(--border);
}

.dossier-executive-summary-head,
.dossier-best-supported-head,
.dossier-most-contested-head {
  display: grid;
  gap: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
}

.dossier-kicker {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.dossier-executive-summary-body {
  max-width: 68ch;
  margin: 0;
  color: var(--text);
  font-size: 0.97rem;
  line-height: 1.65;
}

.dossier-claims-list {
  display: grid;
  gap: 0;
}

.dossier-claim-card {
  display: grid;
  gap: 10px;
  padding: 16px 0;
  border-top: 1px solid var(--border);
}

.dossier-claim-card:first-child {
  padding-top: 0;
  border-top: 0;
}

.dossier-claim-topline {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
}

.dossier-claim-body {
  font-size: 0.95rem;
  line-height: 1.55;
  color: var(--text);
}

.dossier-confidence-badge {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.dossier-confidence--high {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.dossier-confidence--medium {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.dossier-confidence--low {
  background: rgba(107, 114, 128, 0.15);
  color: var(--text-muted);
}

.dossier-claim-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 0.78rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.dossier-claim-resolution {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: rgba(107, 114, 128, 0.15);
  color: var(--text-dim);
}

.dossier-contradiction {
  padding: 12px;
  border-left: 3px solid var(--cyan);
  background: var(--surface-alt);
}

.dossier-contradiction-label {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--cyan);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.dossier-contradiction-body {
  margin: 0 0 4px;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--text);
}

.dossier-contradiction-confidence {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.dossier-claim-evidence-details {
  font-size: 0.85rem;
}

.dossier-claim-evidence-details summary {
  cursor: pointer;
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.06em;
}

.dossier-evidence-list {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}

.dossier-evidence-snippet {
  display: grid;
  gap: 4px;
  padding: 8px 0;
  border-top: 1px solid var(--border);
}

.dossier-evidence-kind {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.dossier-evidence-kind--support { color: #10b981; }
.dossier-evidence-kind--challenge { color: #ef4444; }
.dossier-evidence-kind--context { color: #3b82f6; }
.dossier-evidence-kind--correction { color: #f59e0b; }

.dossier-evidence-handle {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.dossier-evidence-excerpt {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--text-dim);
}

.dossier-empty {
  padding: 24px 0;
  color: var(--text-muted);
  font-size: 0.9rem;
  font-style: italic;
}

.dossier-secondary-section {
  border-bottom: 1px solid var(--border);
}

.dossier-secondary-section summary {
  cursor: pointer;
  padding: 16px 0;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--text-dim);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.dossier-secondary-section[open] summary {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

@media (max-width: 640px) {
  .dossier-claim-topline {
    flex-direction: column;
    gap: 8px;
  }
}

/* ---- verdict closure ---- */
.topic-verdict-closure {
  display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
  padding: 16px 0; border-bottom: 1px solid var(--border);
}
.topic-verdict-closure-status {
  font-family: var(--font-mono); font-size: 0.78rem;
  letter-spacing: 0.08em; color: var(--text-dim);
}
.topic-verdict-closure-convergence {
  display: inline-flex; padding: 4px 10px; border-radius: 4px;
  background: color-mix(in srgb, var(--cyan) 12%, var(--surface));
  font-family: var(--font-mono); font-size: 0.68rem;
  letter-spacing: 0.1em; text-transform: uppercase; color: var(--cyan);
}

/* ---- opening synthesis sub-elements ---- */
.topic-opening-synthesis-kicker {
  color: var(--cyan); font-family: var(--font-mono); font-size: 0.68rem;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.topic-opening-synthesis-body {
  max-width: 68ch; margin: 0 auto; font-size: 0.97rem; line-height: 1.65; color: var(--text); text-align: left;
}
.topic-opening-synthesis-body p { margin: 0 0 0.8em; }
.topic-opening-synthesis-body p:last-child { margin-bottom: 0; }

/* ---- sharpest observation (in meta panel) ---- */
.topic-sharpest-observation {
  display: grid; gap: 8px; padding-top: 16px; margin-top: 16px;
  border-top: 1px solid var(--border);
}
.topic-sharpest-observation-kicker {
  color: var(--cyan); font-family: var(--font-mono); font-size: 0.62rem;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.topic-sharpest-observation-body {
  margin: 0; padding-left: 12px; border-left: 2px solid var(--cyan);
  font-family: var(--font-display); font-size: 0.88rem;
  line-height: 1.45; font-style: italic; color: var(--text-dim);
}
.topic-sharpest-observation-attribution {
  font-family: var(--font-mono); font-size: 0.62rem;
  color: var(--text-muted); letter-spacing: 0.04em; margin-top: 4px;
}

/* ---- positions (strength bars) ---- */
.topic-position-head {
  display: flex; justify-content: space-between; gap: 12px; align-items: baseline;
}
.topic-position-strength-value {
  font-family: var(--font-mono); font-size: 0.82rem; color: var(--cyan); letter-spacing: 0.04em;
}
.topic-position-bar-track { width: 100%; height: 6px; background: var(--border); }
.topic-position-bar-fill { display: block; height: 100%; background: var(--cyan); }

/* ---- dossier contradiction strength ---- */
.dossier-contradiction-strength {
  font-family: var(--font-mono); font-size: 0.72rem;
  letter-spacing: 0.06em; color: var(--text-dim);
}

/* ---- convergence map ---- */
.convergence-map { display: grid; gap: 16px; padding: 24px 0; }
.convergence-kicker {
  color: var(--cyan); font-family: var(--font-mono); font-size: 0.68rem;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.convergence-majority { display: grid; gap: 8px; }
.convergence-majority-share {
  font-family: var(--font-mono); font-size: 2rem; font-weight: 700;
  color: var(--text); letter-spacing: -0.02em;
}
.convergence-majority-label { font-size: 1.05rem; line-height: 1.35; color: var(--text); max-width: 62ch; }
.convergence-majority-bar, .convergence-position-bar { height: 8px; background: var(--border); width: 100%; }
.convergence-bar-fill { display: block; height: 100%; }
.convergence-bar-fill--majority { background: var(--cyan); }
.convergence-bar-fill--runner_up { background: color-mix(in srgb, var(--cyan) 60%, var(--border)); }
.convergence-bar-fill--minority { background: color-mix(in srgb, var(--cyan) 30%, var(--border)); }
.convergence-majority-meta {
  font-family: var(--font-mono); font-size: 0.72rem;
  color: var(--text-muted); letter-spacing: 0.06em;
}
.convergence-others { display: grid; gap: 12px; }
.convergence-position { display: grid; gap: 6px; }
.convergence-position-share {
  font-family: var(--font-mono); font-size: 1.2rem; font-weight: 600; color: var(--text-dim);
}
.convergence-position-label { font-size: 0.92rem; line-height: 1.35; color: var(--text-dim); max-width: 62ch; }

/* ---- winning argument ---- */
/* ---- winning argument (verdict box) ---- */
.winning-argument {
  display: grid; gap: 12px; padding: 28px 22px 24px;
  border: 1px solid color-mix(in srgb, var(--cyan) 22%, var(--border));
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  text-align: center;
  margin: 24px 0;
}
.winning-argument-kicker {
  color: var(--cyan); font-family: var(--font-mono); font-size: 0.68rem;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.winning-argument-body { max-width: 68ch; margin: 0 auto; font-size: 0.97rem; line-height: 1.65; color: var(--text); text-align: left; }
.winning-argument-body p { margin: 0 0 0.8em; }
.winning-argument-body p:last-child { margin-bottom: 0; }
.winning-argument-footer {
  display: flex; gap: 12px; font-family: var(--font-mono); font-size: 0.75rem;
  color: var(--text-muted); letter-spacing: 0.06em; justify-content: center;
  margin-top: 16px; padding-top: 16px; margin-bottom: -16px; border-top: 1px solid var(--border);
}

/* ---- both-sides summary ---- */
.both-sides-summary { display: grid; gap: 0; padding: 24px 0; }
.both-sides-section { padding: 0; }
.both-sides-section + .both-sides-section { padding-top: 16px; }
.both-sides-kicker {
  font-family: var(--font-mono); font-size: 0.82rem; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase; color: var(--text); margin-bottom: 8px;
}
.both-sides-body { max-width: 68ch; font-size: 0.95rem; line-height: 1.65; color: var(--text); }
.both-sides-paragraph { margin: 0 0 0.8em; }
.both-sides-paragraph:last-child { margin-bottom: 0; }

/* ---- opening synthesis (match verdict box) ---- */
.topic-opening-synthesis {
  display: grid; gap: 12px; padding: 28px 22px 24px;
  border: 1px solid color-mix(in srgb, var(--cyan) 22%, var(--border));
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  text-align: center;
  margin: 24px 0;
}

/* ---- below-fold text alignment ---- */
.convergence-map {
  max-width: 720px;
}
.winning-argument,
.both-sides-summary,
.topic-opening-synthesis,
.topic-featured-answer,
.topic-highlights,
.dissenting-views,
.dossier-secondary-section {
  width: min(100%, 720px);
  max-width: 720px;
  margin-left: 0;
  margin-right: 0;
}

@media (min-width: 801px) {
  .winning-argument,
  .both-sides-summary,
  .topic-opening-synthesis,
  .topic-featured-answer,
  .topic-highlights,
  .dissenting-views,
  .dossier-secondary-section {
    margin-left: calc(100% - 720px - 320px - 12px);
  }
}

/* ---- highlights (what moved the debate) ---- */
.topic-highlights {
  display: grid;
  gap: 0;
  padding: 24px 0;
  border-top: 1px solid var(--border);
}
.topic-highlights-kicker {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin-bottom: 16px;
}
.topic-highlights-list {
  display: grid;
  gap: 20px;
}
.topic-highlight-item {
  display: grid;
  gap: 6px;
}
.topic-highlight-attribution {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}
.topic-highlight-excerpt {
  margin: 0;
  padding-left: 14px;
  border-left: 2px solid var(--cyan);
  font-family: var(--font-display);
  font-size: 0.95rem;
  line-height: 1.5;
  font-style: italic;
  color: var(--text);
}
.topic-highlight-reason {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--text-dim);
}

/* ---- round tracker (pizza tracker for active debates) ---- */
.round-tracker {
  display: grid;
  gap: 12px;
  padding: 12px 0 0;
  margin: 12px 0 0;
}
.round-tracker-kicker {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.round-tracker-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
  counter-reset: round-step;
}
.round-tracker-step {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
  background: transparent;
}
.round-tracker-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
  flex-shrink: 0;
}
.round-tracker-step--completed {
  color: var(--text);
  border-color: color-mix(in srgb, var(--cyan) 35%, var(--border));
  background: color-mix(in srgb, var(--cyan) 6%, transparent);
}
.round-tracker-step--completed .round-tracker-dot {
  background: var(--cyan);
}
.round-tracker-step--active {
  color: var(--text);
  border-color: var(--cyan);
  background: color-mix(in srgb, var(--cyan) 10%, transparent);
  animation: round-tracker-pulse 1.6s ease-in-out infinite;
}
.round-tracker-step--active .round-tracker-dot {
  background: var(--cyan);
  animation: round-tracker-dot-pulse 1s ease-in-out infinite;
}
.round-tracker-step--pending {
  opacity: 0.55;
}
@keyframes round-tracker-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--cyan) 35%, transparent);
  }
  50% {
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--cyan) 12%, transparent);
  }
}
@keyframes round-tracker-dot-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.4); }
}
.round-tracker-countdown {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--text-dim);
  letter-spacing: 0.04em;
}
@media (max-width: 640px) {
  .round-tracker {
    margin-left: 0;
  }
  .round-tracker-list {
    gap: 4px;
  }
  .round-tracker-step {
    padding: 4px 8px;
    font-size: 0.62rem;
  }
}

/* ---- vote logic ---- */
.vote-logic {
  display: grid;
  gap: 0;
  padding: 12px 0 16px;
}
.vote-logic-round-details {
  border-bottom: 1px solid var(--border);
}
.vote-logic-round-details summary {
  cursor: pointer;
  padding: 14px 0;
  font-family: var(--font-mono);
  font-size: 0.74rem;
  color: var(--text-dim);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.vote-logic-round-details[open] summary {
  padding-bottom: 8px;
}
.vote-logic-list {
  padding-bottom: 16px;
  display: grid;
  gap: 18px;
  min-width: 0;
}
.vote-logic-item {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.vote-logic-attribution {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--text-dim);
  letter-spacing: 0.02em;
}
.vote-logic-attribution strong {
  color: var(--text);
  font-weight: 600;
}
.vote-logic-reasoning {
  max-width: 68ch;
  font-size: 0.92rem;
  line-height: 1.6;
  color: var(--text);
  overflow-wrap: break-word;
  word-break: break-word;
  min-width: 0;
}
.vote-logic-reasoning > * {
  max-width: 100%;
  overflow-wrap: break-word;
}
.vote-logic-paragraph {
  margin: 0 0 0.7em;
}
.vote-logic-paragraph:last-child {
  margin-bottom: 0;
}

/* ---- dissenting views (matches both-sides spacing) ---- */
.dissenting-views {
  display: grid;
  gap: 0;
  padding: 24px 0;
  border-top: 1px solid var(--border);
}
.dissenting-views-kicker {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin-bottom: 16px;
}
.winning-argument-section {
  margin: 0 0 18px;
}
.winning-argument-section:last-child {
  margin-bottom: 0;
}
.winning-argument-section-kicker {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin-bottom: 8px;
}
.winning-argument-section-body {
  display: grid;
  gap: 8px;
}
.winning-argument-paragraph {
  margin: 0 0 0.7em;
}
.winning-argument-paragraph:last-child {
  margin-bottom: 0;
}
.topic-score-story-description {
  margin-top: 12px;
  margin-bottom: 18px;
}
.dissenting-views-list {
  display: grid;
  gap: 0;
}
.dissenting-view-item {
  display: grid;
  gap: 0;
  padding: 0 0 20px;
}
.dissenting-view-item + .dissenting-view-item {
  padding-top: 20px;
}
.dissenting-view-attribution {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--text);
  margin-bottom: 8px;
}
.dissenting-view-body {
  max-width: 68ch;
  font-size: 0.95rem;
  line-height: 1.65;
  color: var(--text);
}
.dissenting-view-paragraph {
  margin: 0 0 0.8em;
}
.dissenting-view-paragraph:last-child {
  margin-bottom: 0;
}

@media (max-width: 640px) {
  .convergence-majority-share { font-size: 1.5rem; }
  .winning-argument { padding: 16px; }
  .topic-opening-synthesis { padding: 16px; }
}
`;

export const EDITORIAL_PAGE_STYLES = `
.editorial-page {
  padding-top: 28px;
}
.editorial-shell {
  display: grid;
  gap: 28px;
}
.editorial-header {
  display: grid;
  gap: 16px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border);
}
.editorial-kicker {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.editorial-title {
  max-width: 760px;
  margin: 0;
  font-size: clamp(2rem, 4.2vw, 3.4rem);
  line-height: 0.98;
}
.editorial-lede {
  max-width: 760px;
  color: var(--text-dim);
  font-size: 1rem;
}
.editorial-meta {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  padding-top: 2px;
}
.editorial-meta-item {
  display: grid;
  gap: 2px;
  min-height: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.editorial-meta-item strong {
  color: var(--text);
  font-weight: 500;
}
.editorial-meta-item span {
  color: var(--text);
  font-size: 0.82rem;
  letter-spacing: 0.01em;
  text-transform: none;
}

@media (max-width: 640px) {
  .editorial-page {
    padding-top: 18px;
  }
  .editorial-shell {
    gap: 22px;
  }
}
`;

export const DOMAIN_INDEX_PAGE_STYLES = `
${OG_CARD_BASE_STYLES}
.lp-og-card.domain-card-simple {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  padding: 22px 24px;
  min-height: 0;
}
.lp-og-card.domain-card-simple > * { all: unset; display: block; }
.lp-og-card.domain-card-simple .domain-card-name {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.15;
  color: var(--text);
  align-self: flex-start;
}
.lp-og-card.domain-card-simple .domain-card-desc {
  font-size: 1.02rem;
  line-height: 1.5;
  color: var(--text-muted);
}
.lp-og-card.domain-card-simple .domain-card-count {
  margin-top: auto;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}
.lp-og-card.domain-card-simple:hover .domain-card-name {
  color: var(--cyan);
}
.editorial-page.domain-index-page {
  padding-top: 34px;
}
.domain-index-main {
  width: min(100%, 1220px);
}
.domain-index-shell {
  display: grid;
  gap: 30px;
}
.domain-index-header {
  display: grid;
  gap: 16px;
  max-width: 760px;
  justify-items: center;
  margin: 0 auto;
  text-align: center;
}
.domain-index-header .editorial-title,
.domain-index-header .editorial-lede {
  max-width: none;
}
.domain-index-header .editorial-lede {
  max-width: 58ch;
}
.domain-group {
  display: grid;
  gap: 16px;
}
.domain-group-header {
  display: flex;
  align-items: baseline;
  gap: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
}
.domain-group-header h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 500;
  letter-spacing: -0.03em;
  line-height: 1.1;
}
.domain-group-link {
  text-decoration: none;
  color: inherit;
}
.domain-group-link:hover h2 {
  color: var(--cyan);
}
.domain-group-count {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  white-space: nowrap;
}
.domain-group-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  align-items: stretch;
}
.domain-group-grid .lp-og-card {
  min-height: 176px;
  border: 1px solid rgba(116, 123, 131, 0.32);
}
.domain-group-grid .lp-og-card h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.25rem, 1.6vw, 1.65rem);
  line-height: 0.94;
  font-weight: 500;
  letter-spacing: -0.04em;
  max-width: 9ch;
}
.domain-group-grid .lp-og-card h2 a {
  color: inherit;
  text-decoration: none;
}
.domain-group-grid .lp-og-card h2 a:hover {
  color: var(--text);
}

@media (max-width: 1120px) {
  .domain-group-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .domain-index-main {
    width: min(100%, 920px);
  }
}

@media (max-width: 640px) {
  .editorial-page.domain-index-page {
    padding-top: 20px;
  }
  .domain-index-shell {
    gap: 24px;
  }
  .domain-group-grid {
    grid-template-columns: 1fr;
  }
  .domain-group-grid .lp-og-card {
    min-height: 0;
  }
  .domain-group-header {
    flex-direction: column;
    gap: 4px;
  }
}
`;

export const CONNECT_PAGE_STYLES = `
.connect-page {
  max-width: 780px;
  margin: 0 auto;
  padding: 2.5rem 1.5rem 3rem;
  display: grid;
  gap: 2.5rem;
}
.connect-header {
  display: grid;
  gap: 10px;
}
.connect-kicker {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.connect-header h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.8rem, 4vw, 2.4rem);
  line-height: 1.05;
  letter-spacing: -0.03em;
}
.connect-lede {
  margin: 0;
  color: var(--text-dim);
  font-size: 1rem;
  line-height: 1.6;
  max-width: 60ch;
}
.connect-methods {
  display: grid;
  gap: 2rem;
}
.connect-method {
  border: 1px solid var(--border);
  background: var(--surface);
  overflow: hidden;
}
.connect-method-header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}
.connect-method-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 2px solid var(--cyan);
  border-radius: 50%;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--cyan);
  flex-shrink: 0;
  margin-top: 2px;
}
.connect-method-header h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 700;
  line-height: 1.15;
}
.connect-method-desc {
  margin: 4px 0 0;
  color: var(--text-dim);
  font-size: 0.88rem;
  line-height: 1.5;
}
.connect-method-body {
  padding: 20px 24px;
  display: grid;
  gap: 20px;
}
.connect-detail {
  display: grid;
  gap: 8px;
}
.connect-detail h3 {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 600;
}
.connect-detail p {
  margin: 0;
  color: var(--text-dim);
  font-size: 0.86rem;
  line-height: 1.5;
}
.connect-detail code {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--cyan);
  background: none;
  padding: 0;
}
.connect-code {
  background: color-mix(in srgb, var(--surface) 60%, var(--bg));
  border: 1px solid var(--border);
  padding: 12px 16px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.connect-code code {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  line-height: 1.6;
  color: var(--text);
  white-space: pre;
  display: block;
}

/* --- Flow steps --- */
.connect-flow {
  display: grid;
  gap: 1.2rem;
}
.connect-flow h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 700;
}
.connect-steps {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
.connect-step {
  display: grid;
  gap: 6px;
  padding: 16px;
  border: 1px solid var(--border);
  align-content: start;
}
.connect-step-num {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  font-weight: 600;
  color: var(--cyan);
  letter-spacing: 0.08em;
}
.connect-step h3 {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 600;
}
.connect-step p {
  margin: 0;
  color: var(--text-dim);
  font-size: 0.8rem;
  line-height: 1.5;
}

/* --- Footer --- */
.connect-footer {
  text-align: center;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}
.connect-footer p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.84rem;
}
.connect-footer a {
  color: var(--cyan);
  text-decoration: none;
}
.connect-footer a:hover {
  text-decoration: underline;
}

@media (max-width: 640px) {
  .connect-page {
    padding: 1.5rem 1rem 2rem;
    gap: 2rem;
  }
  .connect-method-header {
    padding: 16px 18px;
  }
  .connect-method-body {
    padding: 16px 18px;
  }
  .connect-steps {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 420px) {
  .connect-steps {
    grid-template-columns: 1fr;
  }
}
`;

export const ABOUT_PAGE_STYLES = `
.about-page-main {
  width: min(100%, 1120px);
}
.about-page .editorial-shell {
  gap: 34px;
}
.about-page .editorial-header {
  max-width: 860px;
}
.about-page .editorial-title,
.about-page .editorial-lede {
  max-width: none;
}
.about-jump-link {
  margin: -10px 0 2px;
}
.about-page .protocol-block {
  grid-template-columns: 1fr;
  gap: 10px;
}
.about-page .protocol-block-body {
  max-width: 78ch;
}

@media (max-width: 640px) {
  .about-page .editorial-shell {
    gap: 24px;
  }
  .about-jump-link {
    margin-top: -4px;
  }
}
`;

export const PROTOCOL_PAGE_STYLES = `
.protocol-page {
  display: grid;
  gap: 30px;
}
.protocol-intro {
  display: grid;
  gap: 14px;
  max-width: 760px;
}
.protocol-lede {
  max-width: 66ch;
  font-size: 1rem;
}
.protocol-block {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  gap: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}
.protocol-block-label,
.protocol-panel-kicker {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.protocol-block-body {
  display: grid;
  gap: 12px;
  max-width: 70ch;
}
.protocol-block-body h2,
.protocol-panel h3 {
  margin: 0;
  font-size: 1.3rem;
  line-height: 1.14;
}
.protocol-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}
.protocol-panel {
  display: grid;
  gap: 12px;
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0.15)), var(--surface);
}
.protocol-panel p {
  margin: 0;
}

@media (max-width: 800px) {
  .protocol-block {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .protocol-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .protocol-page {
    gap: 24px;
  }
}
`;

export const LEADERBOARD_INDEX_PAGE_STYLES = `
/* --- Page layout --- */
.lb-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem 1.5rem 3rem;
  display: grid;
  gap: 2rem;
}
.lb-header {
  text-align: center;
  padding-bottom: 0.5rem;
}
.lb-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.1;
}
.lb-subtitle {
  margin: 0.4rem 0 0;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.76rem;
  letter-spacing: 0.06em;
}

/* --- Podium (top 3) --- */
.lb-podium {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}
.lb-podium-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 1.4rem 1rem 1.2rem;
  border: 1px solid var(--border);
  background: var(--surface);
  text-decoration: none;
  color: var(--text);
  position: relative;
  transition: border-color 200ms ease, transform 200ms ease, box-shadow 200ms ease;
}
.lb-podium-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.06);
}
.lb-medal--gold { border-color: #d4a017; }
.lb-medal--gold:hover { border-color: #d4a017; box-shadow: 0 8px 24px rgba(212,160,23,0.15); }
.lb-medal--silver { border-color: #8e8e93; }
.lb-medal--silver:hover { border-color: #8e8e93; box-shadow: 0 8px 24px rgba(142,142,147,0.15); }
.lb-medal--bronze { border-color: #a0522d; }
.lb-medal--bronze:hover { border-color: #a0522d; box-shadow: 0 8px 24px rgba(160,82,45,0.12); }
.lb-podium-rank {
  position: absolute;
  top: 10px;
  left: 12px;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-muted);
}
.lb-medal--gold .lb-podium-rank { color: #d4a017; }
.lb-medal--silver .lb-podium-rank { color: #8e8e93; }
.lb-medal--bronze .lb-podium-rank { color: #a0522d; }
.lb-podium-avatar {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 1.2rem;
  font-weight: 600;
  background: var(--text);
  color: var(--bg);
  border-radius: 50%;
  flex-shrink: 0;
}
.lb-medal--gold .lb-podium-avatar { background: #d4a017; color: #fff; }
.lb-medal--silver .lb-podium-avatar { background: #8e8e93; color: #fff; }
.lb-medal--bronze .lb-podium-avatar { background: #a0522d; color: #fff; }
.lb-podium-name {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1.15;
  text-align: center;
}
.lb-podium-handle {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.04em;
}
.lb-podium-score {
  font-family: var(--font-display);
  font-size: 1.8rem;
  font-weight: 700;
  line-height: 1;
  margin-top: 4px;
}
.lb-podium-score-label {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.52rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.lb-podium-meta {
  display: flex;
  gap: 12px;
  margin-top: 6px;
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.03em;
}

/* --- Table --- */
.lb-table-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.lb-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.lb-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
}
.lb-table th {
  padding: 10px 12px;
  font-family: var(--font-mono);
  font-size: 0.6rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
  text-align: left;
  border-bottom: 2px solid var(--border);
  background: var(--bg);
  white-space: nowrap;
}
.lb-th-rank { width: 48px; text-align: center; }
.lb-th-rep { width: 200px; }
.lb-th-num { width: 100px; text-align: right; }
.lb-th-trust { width: 80px; text-align: center; }
.lb-row {
  transition: background 120ms ease;
}
.lb-row:hover {
  background: color-mix(in srgb, var(--surface) 60%, transparent);
}
.lb-row td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.lb-row--top td {
  background: color-mix(in srgb, var(--surface) 40%, transparent);
}
.lb-cell-rank {
  text-align: center;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
}
.lb-row--top.lb-medal--gold .lb-cell-rank { color: #d4a017; }
.lb-row--top.lb-medal--silver .lb-cell-rank { color: #8e8e93; }
.lb-row--top.lb-medal--bronze .lb-cell-rank { color: #a0522d; }
.lb-cell-agent a {
  text-decoration: none;
  color: var(--text);
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.lb-cell-agent a:hover .lb-agent-name {
  color: var(--cyan);
}
.lb-agent-name {
  font-weight: 600;
  font-size: 0.88rem;
  transition: color 150ms ease;
}
.lb-agent-handle {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.04em;
}
.lb-cell-rep {
  vertical-align: middle;
}
.lb-rep-inline {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 20px;
}
.lb-bar-wrap {
  flex: 1;
  height: 6px;
  background: var(--border);
  border-radius: 3px;
  overflow: hidden;
}
.lb-bar {
  height: 100%;
  background: var(--cyan);
  border-radius: 3px;
  transition: width 400ms ease;
}
.lb-row--top.lb-medal--gold .lb-bar { background: #d4a017; }
.lb-row--top.lb-medal--silver .lb-bar { background: #8e8e93; }
.lb-row--top.lb-medal--bronze .lb-bar { background: #a0522d; }
.lb-score-value {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 600;
  min-width: 44px;
  text-align: right;
}
.lb-cell-num {
  text-align: right;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--text-dim);
}
.lb-cell-trust {
  text-align: center;
}
.lb-trust-badge {
  display: inline-block;
  padding: 2px 8px;
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
  border: 1px solid var(--border);
  border-radius: 2px;
}

/* --- Responsive --- */
@media (max-width: 768px) {
  .lb-podium {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .lb-podium-card {
    flex-direction: row;
    padding: 1rem;
    gap: 12px;
  }
  .lb-podium-rank {
    position: static;
  }
  .lb-podium-avatar {
    width: 40px;
    height: 40px;
    font-size: 1rem;
  }
  .lb-podium-name {
    text-align: left;
    font-size: 1rem;
  }
  .lb-podium-score {
    font-size: 1.3rem;
    margin-top: 0;
    margin-left: auto;
  }
  .lb-podium-score-label,
  .lb-podium-handle,
  .lb-podium-meta {
    display: none;
  }
  .lb-page {
    padding: 1.2rem 1rem 2rem;
  }
  .lb-title {
    font-size: 1.5rem;
  }
  .lb-th-rep { width: 140px; }
  .lb-th-num { width: 70px; }
}

@media (max-width: 480px) {
  .lb-table th:nth-child(4),
  .lb-table td:nth-child(4),
  .lb-table th:nth-child(6),
  .lb-table td:nth-child(6) {
    display: none;
  }
}
`;

export const DOMAIN_DETAIL_PAGE_STYLES = `
.domain-breadcrumb {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}
.domain-breadcrumb a {
  color: var(--cyan);
  text-decoration: none;
}
.domain-breadcrumb a:hover {
  text-decoration: underline;
}
.domain-breadcrumb-sep {
  margin: 0 6px;
  color: var(--text-muted);
  opacity: 0.6;
}
.domain-detail {
  display: grid;
  gap: 32px;
  padding-top: 12px;
}
.domain-detail-section {
  display: grid;
  gap: 14px;
}
.domain-detail-section-head {
  display: grid;
  gap: 6px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.domain-detail-kicker {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.domain-detail-section-head h2 {
  margin: 0;
  font-size: 1.2rem;
  line-height: 1.12;
}
.domain-topic-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px 0;
  border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
}
.domain-topic-row:first-child {
  border-top: 0;
  padding-top: 0;
}
.domain-topic-title {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.2;
}
.domain-topic-title a {
  text-decoration: none;
}
.domain-topic-title a:hover {
  color: var(--cyan);
}
.domain-topic-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.domain-leader-row {
  display: grid;
  grid-template-columns: 2.5rem minmax(0, 1fr) auto auto;
  gap: 14px;
  align-items: center;
  padding: 12px 0;
  border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
}
.domain-leader-row:first-child {
  border-top: 0;
  padding-top: 0;
}
.domain-leader-rank {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.domain-leader-name a {
  text-decoration: none;
  font-size: 0.95rem;
}
.domain-leader-name a:hover {
  color: var(--cyan);
}
.domain-leader-score,
.domain-leader-samples {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.76rem;
  text-align: right;
}
.domain-detail-empty {
  color: var(--text-muted);
  font-size: 0.9rem;
  padding: 8px 0;
}

@media (max-width: 640px) {
  .domain-detail {
    gap: 24px;
    padding-top: 8px;
  }
  .domain-leader-row {
    grid-template-columns: 2rem minmax(0, 1fr) auto;
  }
  .domain-leader-samples {
    display: none;
  }
}
`;

export const LEADERBOARD_DETAIL_PAGE_STYLES = `
.leaderboard-profile {
  display: flex;
  justify-content: center;
  flex: 1;
  padding: 3rem 1.5rem;
}
.leaderboard-profile-card {
  width: 100%;
  max-width: 480px;
  display: grid;
  gap: 0;
}
.leaderboard-profile-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-bottom: 1.2rem;
  border-bottom: 1px solid var(--border);
}
.leaderboard-profile-avatar {
  width: 48px;
  height: 48px;
  background: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-family: var(--font-mono);
  font-size: 1.1rem;
  flex-shrink: 0;
}
.leaderboard-profile-identity {
  flex: 1;
  min-width: 0;
}
.leaderboard-profile-name {
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 700;
  line-height: 1.1;
  margin: 0;
}
.leaderboard-profile-handle {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.76rem;
}
.leaderboard-profile-score {
  display: grid;
  gap: 2px;
  text-align: center;
  flex-shrink: 0;
}
.leaderboard-profile-score strong {
  font-family: var(--font-display);
  font-size: 1.8rem;
  line-height: 1;
  font-weight: 700;
}
.leaderboard-profile-score span {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.56rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.leaderboard-profile-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  border-bottom: 1px solid var(--border);
}
.leaderboard-profile-stat {
  display: grid;
  gap: 0;
  padding: 10px 0;
  text-align: center;
}
.leaderboard-profile-stat + .leaderboard-profile-stat {
  border-left: 1px solid var(--border);
}
.leaderboard-profile-stat strong {
  font-family: var(--font-mono);
  font-size: 0.88rem;
  font-weight: 500;
}
.leaderboard-profile-stat span {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.52rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.leaderboard-profile-section {
  padding: 0.7rem 0 0.6rem;
  border-bottom: 1px solid var(--border);
  display: grid;
  gap: 0;
}
.leaderboard-profile-section--rep {
  padding-top: 0.5rem;
}
.leaderboard-profile-section--rep .leaderboard-profile-section-label {
  font-size: 0.66rem;
}
.leaderboard-profile-section--rep .leaderboard-profile-row {
  padding: 4px 0;
}
.leaderboard-profile-section--contrib {
  padding-top: 0.8rem;
  padding-bottom: 0.8rem;
}
.leaderboard-profile-section--contrib .leaderboard-profile-row {
  padding: 7px 0;
}
.leaderboard-profile-section-label {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding-bottom: 0.4rem;
}
.leaderboard-profile-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 5px 0;
  border-top: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
}
.leaderboard-profile-row:first-of-type {
  border-top: 0;
}
.leaderboard-profile-row a {
  text-decoration: none;
  font-size: 0.84rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.leaderboard-profile-row a:hover {
  color: var(--cyan);
}
.leaderboard-profile-mono {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-muted);
  flex-shrink: 0;
}
.leaderboard-profile-footer {
  padding-top: 1rem;
}
.leaderboard-profile-footer .btn-secondary {
  padding: 10px 20px;
  font-size: 0.7rem;
}

@media (max-width: 640px) {
  .leaderboard-profile {
    padding: 2rem 1rem;
  }
}
`;

export const GLOBAL_STYLES = `
:root {
  --bg: #f3f0e8;
  --surface: #fbfaf6;
  --surface-alt: #f0ede5;
  --border: #d8d2c7;
  --cyan: #4d6780;
  --purple: #7b6258;
  --text: #17191d;
  --text-dim: #4d5460;
  --text-muted: #6d7480;
  --radius: 12px;
  --max-w: 980px;
  --font-display: "Newsreader", Georgia, serif;
  --font-body: "Inter", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", monospace;
}
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
body {
  min-height: 100vh;
  color: var(--text);
  font-family: var(--font-body);
  font-size: 0.9rem;
  line-height: 1.58;
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
  position: relative;
  overflow-x: hidden;
}
.shell-body {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.shell-body > footer {
  margin-top: auto;
}
body::before {
  content: "";
  position: fixed;
  inset: 0;
  background:
    radial-gradient(circle at top left, rgba(77, 103, 128, 0.12), transparent 24%),
    radial-gradient(circle at top right, rgba(123, 98, 88, 0.1), transparent 22%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.42), rgba(255, 255, 255, 0));
  pointer-events: none;
  z-index: -2;
}
a { color: inherit; }
.shell-frame {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: -1;
}
.shell-glow {
  position: absolute;
  width: 340px;
  height: 340px;
  border-radius: 50%;
  filter: blur(70px);
  opacity: 0.35;
}
.shell-glow-left {
  top: -120px;
  left: -80px;
  background: rgba(77, 103, 128, 0.18);
  animation: glowDrift 14s ease-in-out infinite;
}
.shell-glow-right {
  top: 220px;
  right: -120px;
  background: rgba(123, 98, 88, 0.16);
  animation: glowDrift 16s 2s ease-in-out infinite reverse;
}
.shell-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  backdrop-filter: blur(14px);
  background: color-mix(in srgb, var(--surface-alt) 88%, white 12%);
  border-bottom: 1px solid color-mix(in srgb, var(--border) 86%, transparent);
}
.shell-topbar-inner {
  max-width: 1440px;
  margin: 0 auto;
  padding: 1rem 1.5rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 20px;
}
.shell-wordmark-wrap {
  display: grid;
  gap: 2px;
  justify-self: start;
}
.shell-wordmark {
  font-family: var(--font-display);
  font-size: 1.7rem;
  font-style: normal;
  font-weight: 600;
  letter-spacing: -0.04em;
}
.shell-links {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
.shell-links--centered {
  justify-content: center;
  justify-self: center;
}
.shell-links--auth {
  justify-content: flex-end;
  justify-self: end;
}
.shell-link {
  text-decoration: none;
  color: var(--text-dim);
  font-family: var(--font-display);
  font-size: 1.02rem;
  line-height: 1;
  padding-bottom: 0.22rem;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}
.shell-link:hover {
  color: var(--text);
}
.shell-link.is-active {
  color: var(--text);
  border-color: var(--cyan);
}
.shell-link-auth {
  font-style: normal;
}
.page-shell {
  width: min(1440px, calc(100% - 3rem));
  margin: 0 auto;
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 32px;
  padding: 24px 0 88px;
  position: relative;
  z-index: 1;
}
.page-sidebar {
  min-width: 0;
}
.page-main {
  width: min(100%, 1120px);
  margin: 0 auto;
  padding: 28px 1.5rem 88px;
  position: relative;
  z-index: 1;
}
.page-main--landing {
  width: min(100%, 1440px);
  padding-top: 0;
}
.page-main--top-nav-only {
  width: min(100%, 760px);
}
.page-main--topic {
  width: min(100%, 1200px);
  margin: 0 auto 0 max(1.5rem, calc((100% - 1440px) / 2 + 1.5rem));
}
.sidebar-card {
  position: sticky;
  top: 96px;
  display: grid;
  gap: 22px;
  padding: 24px 22px;
  border-right: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
}
.sidebar-profile {
  display: grid;
  gap: 10px;
}
.sidebar-profile-kicker,
.sidebar-meta-item span {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.64rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.sidebar-profile h2 {
  margin: 0;
  font-size: 1.8rem;
  line-height: 1;
  font-style: italic;
}
.sidebar-profile p {
  color: var(--text-dim);
  font-size: 0.92rem;
}
.sidebar-nav {
  display: grid;
  gap: 4px;
}
.sidebar-link {
  text-decoration: none;
  color: var(--text-dim);
  font-size: 0.94rem;
  padding: 10px 12px;
  border-radius: 12px;
  transition: background 0.15s, color 0.15s;
}
.sidebar-link:hover {
  background: color-mix(in srgb, var(--surface) 86%, white 14%);
  color: var(--text);
}
.sidebar-link.is-active {
  background: color-mix(in srgb, var(--surface-alt) 88%, white 12%);
  color: var(--text);
  font-weight: 600;
}
.sidebar-meta {
  display: grid;
  gap: 10px;
  padding-top: 4px;
  border-top: 1px solid var(--border);
}
.sidebar-meta-item {
  display: grid;
  gap: 2px;
}
.sidebar-meta-item strong {
  color: var(--text);
  font-family: var(--font-display);
  font-size: 1.1rem;
  line-height: 1.1;
}
.sidebar-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 84%, white 16%);
  color: var(--text);
  padding: 12px 14px;
  border-radius: 12px;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.site-panel,
.directory-card,
.detail-band,
.auth-panel {
  border: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
  background: color-mix(in srgb, var(--surface) 82%, white 18%);
  border-radius: 18px;
}
.site-panel {
  padding: 26px 24px;
}
.wordmark {
  font-family: var(--font-body);
  font-size: 0.92rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-decoration: none;
  color: var(--text);
}
.wordmark-accent {
  color: var(--text);
}
.nav-links, .footer-links {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
  align-items: center;
}
.nav-links a, .footer-links a {
  text-decoration: none;
  color: var(--text-muted);
  font-size: 0.76rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  transition: color 0.15s;
}
.footer-links a { font-size: 0.74rem; }
.nav-links a:hover, .footer-links a:hover, .old-lab-card a:hover, .old-terminal-link:hover { color: var(--text); }
.hero { padding: 42px 0 26px; }
.eyebrow, .data-badge, .status-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 0.76rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-family: var(--font-mono);
}
.eyebrow { background: rgba(77, 103, 128, 0.08); color: var(--cyan); }
.data-badge { background: rgba(77, 103, 128, 0.11); color: var(--cyan); }
.status-pill { background: var(--surface-alt); color: var(--text-muted); }
h1, h2, h3 {
  font-family: var(--font-display);
  line-height: 1.06;
  letter-spacing: -0.02em;
  font-weight: 700;
  margin: 0 0 12px;
}
h1 { font-size: 1.35rem; }
h2 { font-size: 1.1rem; }
h3 { font-size: 0.82rem; }
.hero h1 { font-size: clamp(1.95rem, 3.5vw, 3rem); }
.card h3, .form-card h3, .transcript-block h3 { font-size: 1.1rem; line-height: 1.3; }
p, li, td, th, label, input, textarea, select, button { font-size: 0.9rem; line-height: 1.58; }
p { color: var(--text-dim); }
.lede { max-width: 780px; font-size: 0.98rem; }
.grid { display: grid; gap: 18px; }
.grid.two { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
.grid.three { grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }
.card, .transcript-block, .admin-table-wrap, .form-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.card, .transcript-block, .form-card { padding: 1rem 1.05rem; }
.stat-row {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.stat-row:last-child { border-bottom: 0; }
.mono, code, pre { font-family: var(--font-mono); }
.muted { color: var(--text-dim); }
.actions { display: flex; gap: 10px; flex-wrap: wrap; }
button, .button {
  border: 0;
  border-radius: 999px;
  padding: 10px 16px;
  background: linear-gradient(135deg, var(--cyan), color-mix(in srgb, var(--cyan) 62%, var(--purple)));
  color: white;
  cursor: pointer;
  text-decoration: none;
  font-weight: 600;
  box-shadow: 0 10px 30px rgba(77, 103, 128, 0.16);
}
.button.secondary, button.secondary {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.32)), var(--surface-alt);
  color: var(--text);
  box-shadow: none;
  border: 1px solid var(--border);
}
input, textarea, select {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
  background: var(--surface);
  color: var(--text);
}
textarea { min-height: 140px; resize: vertical; }
form { display: grid; gap: 12px; }
table { width: 100%; border-collapse: collapse; }
th, td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}
footer {
  max-width: 1440px;
  margin: 0 auto;
  padding: 2.5rem 1.5rem;
  color: var(--text-muted);
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  position: relative;
  z-index: 1;
}

.old-home { padding-top: 12px; }
.old-home-hero-stack { max-width: 860px; margin: 0 auto; }
.old-home-hero { padding: 42px 0 26px; text-align: center; }
.old-home-kicker {
  margin-bottom: 0.95rem;
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.76rem;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.old-home-title {
  max-width: 780px;
  margin: 0 auto 0.9rem;
  font-size: clamp(1.95rem, 3.5vw, 3rem);
  line-height: 1.06;
  font-weight: 700;
}
.old-home-title .accent { color: var(--cyan); }
.old-home-subtitle {
  max-width: 780px;
  margin: 0 auto 1.75rem;
  color: var(--text-dim);
  font-size: 0.98rem;
  line-height: 1.6;
}
.landing-terminal-shell {
  max-width: 860px;
  border-radius: 14px;
  padding: 1px;
  background:
    radial-gradient(circle at top left, rgba(0, 212, 170, 0.22), transparent 36%),
    radial-gradient(circle at bottom right, rgba(139, 92, 246, 0.22), transparent 34%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.01));
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.22);
}
.old-terminal {
  overflow: hidden;
  border-radius: 13px;
  background: #0c0c0d;
}
.old-terminal-topbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0.55rem 0.9rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: #111113;
}
.old-terminal-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}
.old-terminal-dot.red { background: #ff5f57; }
.old-terminal-dot.yellow { background: #febc2e; }
.old-terminal-dot.green { background: #28c840; }
.old-terminal-body {
  margin: 0;
  padding: 1.1rem 1.25rem;
  overflow-x: auto;
  color: #d5d2cb;
  font-size: 0.75rem;
  line-height: 1.9;
}
.old-terminal-line { white-space: pre-wrap; }
.old-terminal-line.prompt { color: var(--cyan); }
.old-terminal-line.output { color: #888; }
.old-terminal-line.success { color: #28c840; }
.old-terminal-link {
  color: var(--cyan);
  text-decoration: none;
  border-bottom: 1px solid rgba(77, 103, 128, 0.32);
}
.old-home-stats {
  margin: 0 0 1rem;
  padding: 2rem 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}
.old-home-stat { text-align: center; }
.old-home-stat-value {
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 1.6rem;
  font-weight: 600;
}
.old-home-stat-label {
  margin-top: 4px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.old-thesis {
  padding: 0.25rem 0 3rem;
}
.old-thesis-label {
  margin-bottom: 0.85rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.64rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.old-thesis-copy {
  max-width: 42rem;
  color: var(--text);
  font-family: var(--font-display);
  font-size: clamp(1.45rem, 2.4vw, 2rem);
  line-height: 1.24;
}
.old-thesis-copy span { color: var(--cyan); }
.old-protocol { padding: 0 0 3.25rem; }
.old-protocol-title {
  margin-bottom: 1.5rem;
  font-size: 1.45rem;
}
.old-protocol-row {
  display: flex;
  align-items: baseline;
  gap: 1.5rem;
  padding: 0.9rem 0;
  border-bottom: 1px solid var(--border);
}
.old-protocol-row:last-child { border-bottom: 0; }
.old-protocol-label {
  min-width: 96px;
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.old-protocol-desc { color: var(--text-dim); font-size: 0.88rem; }
.old-section { padding: 0 0 3rem; }
.old-section-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
  margin-bottom: 1.4rem;
}
.old-section-title {
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.old-section-link {
  color: var(--text-muted);
  text-decoration: none;
  font-size: 0.76rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.old-lab-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.9rem;
}
.old-lab-card {
  padding: 1rem 1.05rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 92%, white 8%);
  transition: border-color 0.15s, background 0.15s;
}
.old-lab-card:hover {
  border-color: color-mix(in srgb, var(--cyan) 28%, var(--border));
  background: #fffdf9;
}
.old-lab-card.quiet { background: color-mix(in srgb, var(--surface-alt) 72%, white 28%); }
.old-lab-card-meta {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.65rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.old-lab-card-title {
  margin: 0.45rem 0 0.5rem;
  color: var(--text);
  font-size: 0.92rem;
  line-height: 1.4;
  font-weight: 600;
}
.old-lab-card-title a { text-decoration: none; }
.old-lab-card-hook {
  margin-bottom: 0.5rem;
  color: var(--text-muted);
  font-size: 0.8rem;
  line-height: 1.35;
}
.old-lab-card-footer {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.auth-page {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
  padding: 3rem 1.5rem;
}
.auth-shell-page .page-main--top-nav-only {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.auth-footer { margin-top: auto; }
.auth-card {
  width: 100%;
  max-width: 380px;
}
.auth-card h1 {
  font-size: 1.6rem;
  margin-bottom: 1.5rem;
  text-align: center;
}
.oauth-buttons {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.oauth-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--border);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  text-decoration: none;
  color: var(--text);
  background: var(--surface);
}
.oauth-btn:hover {
  border-color: var(--cyan);
  background: var(--surface-alt);
}
.oauth-btn svg { width: 18px; height: 18px; flex-shrink: 0; }
.auth-divider {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 1.2rem 0;
  color: var(--text-muted);
  font-size: 0.78rem;
}
.auth-divider::before, .auth-divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--border);
}
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.auth-form input {
  padding: 0.75rem 1rem;
  border: 1px solid var(--border);
  font-size: 0.85rem;
  background: var(--surface);
  color: var(--text);
  outline: none;
  font-family: var(--font-body);
}
.auth-form input:focus { border-color: var(--cyan); }
.auth-form input::placeholder { color: var(--text-muted); }
.auth-form .btn-primary {
  width: 100%;
}
.auth-connect-link {
  text-align: center;
  margin: 0.8rem 0 0;
  color: var(--text-muted);
  font-size: 0.82rem;
}
.auth-connect-link a {
  color: var(--cyan);
  text-decoration: none;
}
.auth-connect-link a:hover {
  text-decoration: underline;
}
.auth-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  padding: 0.6rem 1rem;
  font-size: 0.82rem;
  margin-bottom: 1rem;
}
.auth-error--info {
  background: color-mix(in srgb, var(--cyan) 8%, white 92%);
  border-color: color-mix(in srgb, var(--cyan) 24%, var(--border));
  color: var(--text);
}

.acct-card {
  width: 100%;
  max-width: 480px;
  display: grid;
  gap: 0;
}
.acct-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-bottom: 1.2rem;
}
.acct-avatar {
  width: 48px;
  height: 48px;
  background: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-family: var(--font-mono);
  font-size: 1.1rem;
  font-weight: 400;
  flex-shrink: 0;
}
.acct-identity { flex: 1; min-width: 0; }
.acct-name {
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 700;
  line-height: 1.1;
  margin: 0;
}
.acct-email {
  color: var(--text-dim);
  font-size: 0.84rem;
  margin: 4px 0 0;
}
.acct-badges {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding-bottom: 1.2rem;
  border-bottom: 1px solid var(--border);
}
.acct-badge {
  display: inline-flex;
  padding: 4px 10px;
  border: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 0.64rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.acct-badge--ok { border-color: rgba(40, 200, 64, 0.3); color: #1a7a2e; }
.acct-badge--warn { border-color: rgba(200, 140, 40, 0.3); color: #8a6420; }
.acct-section {
  padding: 1.2rem 0;
  border-bottom: 1px solid var(--border);
  display: grid;
  gap: 0.7rem;
}
.acct-section-label {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.64rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.acct-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
}
.acct-row span {
  font-size: 0.82rem;
  color: var(--text-dim);
}
.acct-row code {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  color: var(--text);
  background: var(--surface-alt);
  padding: 3px 8px;
  user-select: all;
  word-break: break-all;
}
.acct-section .btn-secondary {
  margin-top: 0.3rem;
  padding: 10px 20px;
  font-size: 0.7rem;
  justify-self: start;
}
.acct-email-form {
  display: flex;
  gap: 0;
}
.acct-email-form input {
  flex: 1;
  min-width: 0;
  padding: 0.7rem 1rem;
  border: 1px solid var(--border);
  font-size: 0.84rem;
  background: var(--surface);
  color: var(--text);
  outline: none;
  font-family: var(--font-body);
}
.acct-email-form input:focus { border-color: var(--cyan); }
.acct-email-form .btn-primary {
  padding: 10px 20px;
  font-size: 0.7rem;
  white-space: nowrap;
}
.acct-being {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--border);
  background: var(--surface);
  transition: border-color 0.15s;
}
.acct-being:hover { border-color: var(--cyan); }
.acct-being + .acct-being { margin-top: 0.4rem; }
.acct-being-handle {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--text);
}
.acct-being-handle a { text-decoration: none; }
.acct-being-handle a:hover { color: var(--cyan); }
.acct-being-id {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--text-muted);
}
.acct-being-badges { margin-left: auto; display: flex; gap: 6px; }
.acct-provider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--border);
  background: var(--surface);
}
.acct-provider + .acct-provider { margin-top: 0.4rem; }
.acct-provider svg { width: 18px; height: 18px; flex-shrink: 0; }
.acct-provider-name { font-size: 0.84rem; color: var(--text); }
.acct-provider-meta {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--text-muted);
}
.acct-empty { color: var(--text-muted); font-size: 0.84rem; }
.acct-footer {
  padding: 1.2rem 0 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.acct-footer .btn-secondary {
  padding: 10px 20px;
  font-size: 0.7rem;
}
.acct-meta {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--text-muted);
}

@media (max-width: 900px) {
  .old-lab-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .shell-topbar-inner {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 10px 12px;
    padding: 0.8rem 1rem 0.65rem;
  }
  .shell-wordmark-wrap {
    justify-self: auto;
  }
  .shell-wordmark {
    font-size: 1.25rem;
  }
  .shell-links--centered {
    order: 3;
    width: 100%;
    justify-self: auto;
    justify-content: flex-start;
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 2px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .shell-links--centered::-webkit-scrollbar {
    display: none;
  }
  .shell-links--auth {
    justify-self: auto;
    flex-wrap: nowrap;
    gap: 0;
  }
  .shell-link {
    font-size: 0.92rem;
  }
  .shell-links, .footer-links { gap: 12px; }
  .page-shell {
    width: min(100%, calc(100% - 2rem));
    grid-template-columns: 1fr;
    gap: 18px;
    padding-top: 12px;
  }
  .sidebar-card {
    position: static;
    padding: 0 0 18px;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }
  .page-main {
    width: 100%;
    padding: 0 1rem 64px;
  }
  .page-main--landing,
  .page-main--top-nav-only {
    padding: 0 1rem 64px;
  }
  .page-main--topic {
    margin: 0;
  }
  .old-home-hero { padding: 4rem 0 1.5rem; text-align: left; }
  .old-home-title { font-size: clamp(1.5rem, 8vw, 2.25rem); }
  .old-home-subtitle { margin-left: 0; margin-right: 0; }
  .old-terminal-body {
    padding: 16px 16px 20px;
    font-size: 0.8rem;
  }
  .old-home-stats { justify-content: flex-start; gap: 1rem; }
  .old-lab-grid { grid-template-columns: 1fr; }
  .old-protocol-row {
    flex-direction: column;
    gap: 0.25rem;
  }
  .old-protocol-label { min-width: 0; }
  .acct-row { flex-direction: column; align-items: flex-start; gap: 4px; }
  .acct-email-form { flex-direction: column; }
  .acct-email-form .btn-primary { width: 100%; }
  .acct-footer { flex-direction: column; align-items: flex-start; }
  footer { padding: 12px 1rem 36px; }
  /* stagger delays capped at 6 children on mobile */
  [data-stagger] > [data-animate]:nth-child(7),
  [data-stagger] > [data-animate]:nth-child(8),
  [data-stagger] > [data-animate]:nth-child(9),
  [data-stagger] > [data-animate]:nth-child(10),
  [data-stagger] > [data-animate]:nth-child(11),
  [data-stagger] > [data-animate]:nth-child(12) { transition-delay: 400ms; }
}

/* ---- scroll-reveal animation system ---- */
[data-animate] {
  opacity: 0;
  transform: translateY(18px);
  transition: opacity 0.55s cubic-bezier(0.16,1,0.3,1), transform 0.55s cubic-bezier(0.16,1,0.3,1);
}
[data-animate="slide-left"]  { transform: translateX(-24px); }
[data-animate="slide-right"] { transform: translateX(24px); }
[data-animate="scale"]       { transform: scale(0.95); }
[data-animate].is-visible    { opacity: 1; transform: none; }
[data-stagger] > [data-animate]:nth-child(1)  { transition-delay:   0ms; }
[data-stagger] > [data-animate]:nth-child(2)  { transition-delay:  80ms; }
[data-stagger] > [data-animate]:nth-child(3)  { transition-delay: 160ms; }
[data-stagger] > [data-animate]:nth-child(4)  { transition-delay: 240ms; }
[data-stagger] > [data-animate]:nth-child(5)  { transition-delay: 320ms; }
[data-stagger] > [data-animate]:nth-child(6)  { transition-delay: 400ms; }
[data-stagger] > [data-animate]:nth-child(7)  { transition-delay: 480ms; }
[data-stagger] > [data-animate]:nth-child(8)  { transition-delay: 560ms; }
[data-stagger] > [data-animate]:nth-child(9)  { transition-delay: 640ms; }
[data-stagger] > [data-animate]:nth-child(10) { transition-delay: 720ms; }
[data-stagger] > [data-animate]:nth-child(11) { transition-delay: 800ms; }
[data-stagger] > [data-animate]:nth-child(12) { transition-delay: 880ms; }

/* ---- hero load animation (CSS-only, no observer needed) ---- */
@keyframes heroEnter {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: none; }
}
.landing-hero-kicker  { animation: heroEnter 0.5s cubic-bezier(0.16,1,0.3,1) both; }
.landing-hero-title   { animation: heroEnter 0.55s 0.08s cubic-bezier(0.16,1,0.3,1) both; }
.landing-hero-lede    { animation: heroEnter 0.55s 0.16s cubic-bezier(0.16,1,0.3,1) both; }
.landing-hero-proof   { animation: heroEnter 0.55s 0.22s cubic-bezier(0.16,1,0.3,1) both; }
.landing-hero-actions { animation: heroEnter 0.55s 0.24s cubic-bezier(0.16,1,0.3,1) both; }

/* ---- ambient glow drift ---- */
@keyframes glowDrift {
  0%,100% { transform: translate(0,0) scale(1); }
  33%     { transform: translate(12px,-8px) scale(1.05); }
  66%     { transform: translate(-8px,10px) scale(0.95); }
}

/* ---- reduced-motion: disable everything ---- */
@media (prefers-reduced-motion: reduce) {
  [data-animate] { opacity:1!important; transform:none!important; transition:none!important; }
  .landing-hero-kicker, .landing-hero-title, .landing-hero-lede, .landing-hero-proof, .landing-hero-actions { animation:none!important; }
  .shell-glow-left, .shell-glow-right { animation:none!important; }
}
.btn-primary,
.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 14px 28px;
  border-radius: 0;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 400;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  text-decoration: none;
  border: 1px solid var(--text);
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease, border-color 160ms ease, transform 120ms ease;
}
.btn-primary {
  background: var(--text);
  color: #fff;
}
.btn-primary:hover {
  background: var(--cyan);
  border-color: var(--cyan);
  transform: translateY(-1px);
}
.btn-secondary {
  background: transparent;
  color: var(--text);
}
.btn-secondary:hover {
  border-color: var(--cyan);
  color: var(--cyan);
  transform: translateY(-1px);
}
`;
