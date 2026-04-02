export const FONT_PRECONNECT = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&family=Newsreader:opsz,wght@6..72,500;6..72,700&display=swap" rel="stylesheet">
`;

export const TOPICS_PAGE_STYLES = `
.topics-page {
  padding-top: 28px;
}
.topics-shell {
  display: grid;
  gap: 28px;
}
.topics-header {
  display: grid;
  gap: 16px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border);
}
.topics-kicker {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.topics-title {
  max-width: 760px;
  margin: 0;
  font-size: clamp(2rem, 4.2vw, 3.4rem);
  line-height: 0.98;
}
.topics-lede {
  max-width: 760px;
  color: var(--text-dim);
  font-size: 1rem;
}
.topics-filterbar {
  padding: 14px 0 0;
  border-top: 1px solid var(--border);
}
.topics-filter-shell {
  display: grid;
  gap: 16px;
  padding: 16px 18px;
  border: 1px solid var(--border);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(246,248,250,0.92) 100%);
}
.topics-search-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  align-items: end;
}
.topics-search-field {
  display: grid;
  gap: 6px;
}
.topics-search-field label {
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 0.63rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.topics-search-field input {
  border-radius: 0;
  border-color: var(--border);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: none;
  min-height: 48px;
  padding: 12px 14px;
  color: var(--text);
}
.topics-search-field input:hover,
.topics-search-field input:focus {
  border-color: var(--cyan);
}
.topics-filter-status {
  display: grid;
  gap: 8px;
}
.topics-filter-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  align-items: end;
}
.topics-filter-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 14px;
}
.topics-filter-field {
  display: grid;
  gap: 6px;
}
.topics-filter-field label,
.topics-filter-label {
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 0.63rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.topics-status-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.topics-status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0 16px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.86);
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 0.76rem;
  letter-spacing: 0.08em;
  text-decoration: none;
  text-transform: uppercase;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease, transform 120ms ease;
}
.topics-status-pill:hover {
  border-color: var(--cyan);
  color: var(--cyan);
  transform: translateY(-1px);
}
.topics-status-pill.is-active {
  border-color: var(--cyan);
  background: color-mix(in srgb, var(--cyan) 12%, white 88%);
  color: var(--text);
}
.topics-filter-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-self: end;
  align-items: center;
}
.topics-filter-actions button {
  border: 1px solid var(--border);
  padding: 11px 16px;
  background: var(--text);
  color: #fff;
  font-weight: 600;
}
.topics-filter-actions button:hover {
  border-color: var(--cyan);
  background: var(--cyan);
}
.topics-filter-clear {
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
.topics-filter-form select {
  border-radius: 0;
  border-color: var(--border);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: none;
  min-height: 46px;
  padding-inline: 12px 40px;
  color: var(--text);
}
.topics-filter-form select:hover,
.topics-filter-form select:focus {
  border-color: var(--cyan);
}
.topics-active-filters {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  padding-top: 2px;
}
.topics-active-filter,
.topics-card-eyebrow,
.topics-card-stat,
.topics-card-state {
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
.topics-active-filter strong,
.topics-card-state strong {
  color: var(--text);
  font-weight: 500;
}
.topics-active-filter span,
.topics-card-state span,
.topics-card-stat span:last-child {
  color: var(--text);
  font-size: 0.82rem;
  letter-spacing: 0.01em;
  text-transform: none;
}
.topics-list {
  display: grid;
  gap: 14px;
}
.topics-card {
  display: grid;
  gap: 14px;
  padding: 18px 0 20px;
  border-top: 1px solid var(--border);
}
.topics-card:first-child {
  border-top: 0;
  padding-top: 0;
}
.topics-card-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
.topics-card-copy {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.topics-card-copy h2 {
  margin: 0;
  font-size: 1.35rem;
  line-height: 1.1;
}
.topics-card-copy h2 a {
  text-decoration: none;
}
.topics-card-copy h2 a:hover {
  color: var(--cyan);
}
.topics-card-copy p {
  max-width: 70ch;
  color: var(--text-dim);
}
.topics-card-eyebrow {
  color: var(--cyan);
}
.topics-card-state {
  justify-self: end;
  color: var(--text);
  text-align: right;
}
.topics-card-meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px 16px;
}
.topics-card-stat {
  align-content: start;
}
.topics-card-stat a {
  text-decoration: none;
}
.topics-filter-form select:focus {
  outline: none;
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
  .topics-card-meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .topics-filter-form {
    grid-template-columns: 1fr;
  }
  .topics-search-form {
    grid-template-columns: 1fr;
  }
  .topics-filter-actions {
    justify-content: flex-start;
  }
  .topics-filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .topics-card-head {
    flex-direction: column;
    align-items: flex-start;
  }
  .topics-card-state {
    justify-self: start;
    text-align: left;
  }
}

@media (max-width: 640px) {
  .topics-page {
    padding-top: 18px;
  }
  .topics-shell {
    gap: 22px;
  }
  .topics-filter-grid,
  .topics-card-meta {
    grid-template-columns: 1fr;
  }
  .topics-filter-shell {
    padding: 14px;
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

export const LANDING_PAGE_STYLES = `
.page-main--landing {
  width: 100%;
}
.landing-page {
  display: grid;
  gap: 0;
}
.lp-hero {
  display: grid;
  place-items: center;
  min-height: calc(100svh - 72px);
  padding: 48px 24px 36px;
  text-align: center;
  position: relative;
  isolation: isolate;
  overflow: hidden;
}
.lp-hero::before {
  content: "";
  position: absolute;
  inset: 0;
  background: url("/landing/background.png") center center / cover no-repeat;
  opacity: 0.12;
  transform: scale(1.03);
  z-index: -2;
}
.lp-hero::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 50% 42%, rgba(255, 255, 255, 0.18), transparent 38%),
    linear-gradient(180deg, rgba(247, 241, 230, 0.3), rgba(247, 241, 230, 0.72));
  z-index: -1;
}
.lp-hero-inner {
  display: grid;
  gap: 22px;
  justify-items: center;
  max-width: 680px;
}
.lp-hero-kicker,
.lp-quickstart-kicker,
.lp-rail-kicker {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.lp-hero h1,
.lp-quickstart-copy h2,
.lp-rail-head h2 {
  margin: 0;
  font-size: clamp(2.8rem, 6vw, 5.2rem);
  line-height: 0.92;
  letter-spacing: -0.04em;
}
.lp-hero p,
.lp-quickstart-copy p,
.lp-rail-head p {
  margin: 0;
  color: var(--text-dim);
  font-size: 1rem;
  line-height: 1.6;
}
.lp-hero p {
  max-width: 54ch;
}
.lp-hero-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}
.lp-quickstart {
  padding: 80px 24px;
  border-top: 1px solid var(--border);
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
.lp-rail {
  display: grid;
  gap: 28px;
  padding: 80px 0 88px;
  border-top: 1px solid var(--border);
  overflow: hidden;
  background:
    radial-gradient(circle at top, rgba(197, 170, 118, 0.14), transparent 54%),
    linear-gradient(180deg, #f7f1e6 0%, #f3ecdf 100%);
  mask-image: linear-gradient(to right, transparent, black 3%, black 97%, transparent);
  -webkit-mask-image: linear-gradient(to right, transparent, black 3%, black 97%, transparent);
}
.lp-rail-head {
  display: grid;
  gap: 12px;
  max-width: 720px;
  padding: 0 24px;
  margin: 0 auto;
  text-align: center;
}
.lp-rail-head h2 {
  font-size: clamp(1.8rem, 3.5vw, 3rem);
}
.lp-rail-track {
  display: flex;
  align-items: flex-start;
  gap: 28px;
  width: max-content;
  padding: 24px max(24px, calc(50vw - 680px));
  animation: lp-scroll 58s linear infinite;
}
.lp-rail-track:hover {
  animation-play-state: paused;
}
.lp-og-card {
  flex: 0 0 212px;
  display: grid;
  gap: 16px;
  min-height: 326px;
  padding: 16px 14px 12px;
  border: 1px solid rgba(120, 105, 79, 0.14);
  background: #f7f3eb;
  box-shadow:
    0 18px 44px rgba(64, 46, 18, 0.05),
    0 6px 14px rgba(64, 46, 18, 0.04);
  text-decoration: none;
  color: #201812;
  transition: transform 0.28s ease, box-shadow 0.28s ease, border-color 0.28s ease;
  will-change: transform;
}
.lp-og-card:hover {
  transform: translate3d(0, -10px, 0) rotate(0deg) !important;
  box-shadow:
    0 24px 58px rgba(64, 46, 18, 0.08),
    0 8px 20px rgba(64, 46, 18, 0.06);
  border-color: rgba(120, 105, 79, 0.24);
}
.lp-og-card:nth-child(4n + 1) {
  transform: translateY(6px) rotate(-0.72deg);
}
.lp-og-card:nth-child(4n + 2) {
  transform: translateY(-10px) rotate(0.62deg);
}
.lp-og-card:nth-child(4n + 3) {
  transform: translateY(14px) rotate(-0.48deg);
}
.lp-og-card:nth-child(4n + 4) {
  transform: translateY(-6px) rotate(0.78deg);
}
.lp-og-card-chrome {
  display: grid;
  gap: 8px;
  align-content: start;
}
.lp-og-card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.54rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(76, 66, 49, 0.48);
}
.lp-og-card-kicker {
  max-width: 15ch;
}
.lp-og-card-date {
  white-space: nowrap;
}
.lp-og-card h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.45rem, 1.9vw, 1.9rem);
  line-height: 0.92;
  font-weight: 500;
  letter-spacing: -0.045em;
  max-width: 8ch;
}
.lp-og-card p {
  margin: 0;
  max-width: 24ch;
  font-size: 0.68rem;
  line-height: 1.52;
  color: rgba(60, 51, 37, 0.7);
}
.lp-og-card-footer {
  margin-top: auto;
  display: grid;
  gap: 12px;
  padding-top: 10px;
}
.lp-og-card-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(120, 105, 79, 0.1);
}
.lp-og-card-stat {
  display: grid;
  gap: 4px;
}
.lp-og-card-stat span,
.lp-og-card-actions,
.lp-og-card-actions code {
  color: rgba(76, 66, 49, 0.56);
  font-family: var(--font-mono);
  font-size: 0.5rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.lp-og-card-stat strong {
  color: #201812;
  font-family: var(--font-mono);
  font-size: 0.58rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: none;
}
.lp-og-card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 2px;
}
.lp-og-card-link {
  color: var(--text);
}
.lp-og-card-actions code {
  border: 1px solid rgba(120, 105, 79, 0.12);
  background: rgba(255, 255, 255, 0.34);
  padding: 3px 5px 2px;
  border-radius: 2px;
  font-size: 0.47rem;
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
@media (max-width: 800px) {
  .lp-qs-inner {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 640px) {
  .lp-hero {
    padding: 36px 18px 28px;
    min-height: calc(100svh - 64px);
  }
  .lp-quickstart {
    padding: 56px 18px;
  }
  .lp-rail {
    padding: 56px 0 64px;
  }
  .lp-rail-head {
    padding: 0 18px;
  }
  .lp-rail-track {
    gap: 18px;
    padding: 20px 18px;
  }
  .lp-og-card {
    flex-basis: min(212px, calc(100vw - 44px));
    min-height: 314px;
    padding: 14px 12px 12px;
  }
  .lp-terminal-body {
    min-height: 96px;
    padding: 20px 18px;
    font-size: 0.75rem;
  }
}
`;
export const TOPIC_DETAIL_PAGE_STYLES = `
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
  border-bottom: 1px solid var(--border);
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
.topic-kicker-domain,
.topic-kicker-template {
  color: var(--text-dim);
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
.topic-header-meta {
  display: flex;
  gap: 18px 22px;
  flex-wrap: wrap;
}
.topic-header-meta-item {
  display: grid;
  gap: 3px;
  min-width: 112px;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.topic-header-meta-item strong {
  color: var(--text-dim);
  font-weight: 500;
}
.topic-header-meta-item span {
  color: var(--text);
  font-size: 0.82rem;
  letter-spacing: 0.01em;
  text-transform: none;
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
.topic-featured-score-bar-track,
.topic-score-bar-track {
  width: 100%;
  height: 4px;
  background: var(--border);
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
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 1rem;
  line-height: 1;
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
  .topic-header-meta {
    gap: 12px;
  }
  .topic-header-meta-item {
    min-width: calc(50% - 6px);
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
  grid-template-columns: minmax(0, 1.6fr) minmax(260px, 0.85fr);
  gap: 32px;
  padding-bottom: 36px;
}
.topic-hero-col {
  gap: 24px;
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
    padding-top: 12px;
    padding-bottom: 48px;
  }
  .topic-above-fold {
    gap: 20px;
    padding-bottom: 24px;
  }
  .topic-header-prompt {
    max-width: none;
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

export const DOMAIN_ARCHIVE_PAGE_STYLES = `
.editorial-page.domain-archive-page {
  padding-top: 34px;
}
.domain-archive-main {
  width: min(100%, 1220px);
}
.domain-archive-shell {
  display: grid;
  gap: 30px;
}
.domain-archive-header {
  display: grid;
  gap: 16px;
  max-width: 760px;
  justify-items: center;
  margin: 0 auto;
  text-align: center;
}
.domain-archive-header .editorial-title,
.domain-archive-header .editorial-lede {
  max-width: none;
}
.domain-archive-header .editorial-lede {
  max-width: 58ch;
}
.domain-archive-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
  align-items: stretch;
}
.domain-archive-grid .lp-og-card {
  min-height: 348px;
  border: 1px solid rgba(116, 123, 131, 0.32);
}
.domain-archive-grid .lp-og-card h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.45rem, 1.9vw, 1.9rem);
  line-height: 0.92;
  font-weight: 500;
  letter-spacing: -0.045em;
  max-width: 8ch;
}
.domain-archive-grid .lp-og-card h2 a {
  color: inherit;
  text-decoration: none;
}
.domain-archive-grid .lp-og-card h2 a:hover {
  color: var(--text);
}

@media (max-width: 1120px) {
  .domain-archive-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .domain-archive-main {
    width: min(100%, 920px);
  }
  .domain-archive-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .editorial-page.domain-archive-page {
    padding-top: 20px;
  }
  .domain-archive-shell {
    gap: 24px;
  }
  .domain-archive-grid {
    grid-template-columns: 1fr;
  }
  .domain-archive-grid .lp-og-card,
  .domain-archive-grid .lp-og-card:nth-child(4n + 1),
  .domain-archive-grid .lp-og-card:nth-child(4n + 2),
  .domain-archive-grid .lp-og-card:nth-child(4n + 3),
  .domain-archive-grid .lp-og-card:nth-child(4n + 4) {
    transform: none;
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
.auth-page { display: flex; justify-content: center; padding: 4rem 1.5rem; }
.auth-card { width: 100%; max-width: 420px; }
.auth-card h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
.auth-subtitle { color: var(--text-dim); margin-bottom: 2rem; font-size: 0.9rem; }
.oauth-buttons { display: flex; flex-direction: column; gap: 0.6rem; margin-bottom: 1.5rem; }
.oauth-btn { display: flex; align-items: center; justify-content: center; gap: 0.6rem; padding: 0.7rem 1rem; border: 1px solid var(--border); border-radius: 8px; font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: border-color 0.15s, background 0.15s; text-decoration: none; color: var(--text); background: var(--surface); }
.oauth-btn:hover { border-color: var(--cyan); background: var(--surface-alt); }
.oauth-btn svg { width: 18px; height: 18px; flex-shrink: 0; }
.auth-divider { display: flex; align-items: center; gap: 1rem; margin: 1.5rem 0; color: var(--text-muted); font-size: 0.8rem; }
.auth-divider::before, .auth-divider::after { content: ""; flex: 1; height: 1px; background: var(--border); }
.auth-form { display: flex; flex-direction: column; gap: 0.75rem; }
.auth-form label { font-size: 0.82rem; color: var(--text-dim); }
.auth-form input { padding: 0.7rem 1rem; border: 1px solid var(--border); border-radius: 8px; font-size: 0.85rem; background: var(--surface); color: var(--text); outline: none; font-family: var(--font-body); }
.auth-form input:focus { border-color: var(--cyan); }
.auth-form input::placeholder { color: var(--text-muted); }
.auth-form button { padding: 0.75rem 1rem; border: none; border-radius: 8px; background: var(--cyan); color: white; font-size: 0.85rem; font-weight: 600; cursor: pointer; font-family: var(--font-body); }
.auth-form button:hover { opacity: 0.9; }
.auth-footer-text { margin-top: 1.5rem; font-size: 0.8rem; color: var(--text-muted); text-align: center; }
.auth-footer-text a { color: var(--cyan); }
.auth-error { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; padding: 0.6rem 1rem; border-radius: 8px; font-size: 0.82rem; margin-bottom: 1rem; }

.acct-header { display: flex; align-items: flex-start; gap: 1.5rem; padding: 3rem 0 2rem; }
.acct-avatar { width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, var(--cyan), var(--purple)); display: flex; align-items: center; justify-content: center; color: white; font-family: var(--font-display); font-size: 1.6rem; font-weight: 700; flex-shrink: 0; }
.acct-identity { flex: 1; min-width: 0; }
.acct-name { font-family: var(--font-display); font-size: clamp(1.5rem, 2.5vw, 2rem); font-weight: 700; line-height: 1.1; letter-spacing: -0.02em; margin: 0 0 6px; }
.acct-email { color: var(--text-dim); font-size: 0.88rem; margin: 0 0 10px; }
.acct-badges { display: flex; gap: 8px; flex-wrap: wrap; }
.acct-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-family: var(--font-mono); font-size: 0.68rem; letter-spacing: 0.08em; text-transform: uppercase; }
.acct-badge.trust { background: rgba(77, 103, 128, 0.11); color: var(--cyan); }
.acct-badge.status { background: var(--surface-alt); color: var(--text-muted); }
.acct-badge.verified { background: rgba(40, 200, 64, 0.1); color: #1a7a2e; }
.acct-badge.unverified { background: rgba(200, 140, 40, 0.1); color: #8a6420; }
.acct-section { padding: 1.5rem 0; border-top: 1px solid var(--border); }
.acct-section-label { margin-bottom: 1rem; color: var(--text-muted); font-family: var(--font-mono); font-size: 0.66rem; letter-spacing: 0.12em; text-transform: uppercase; }
.acct-cred { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }
.acct-cred:last-child { border-bottom: 0; }
.acct-cred strong { font-size: 0.82rem; color: var(--text-dim); min-width: 100px; }
.acct-cred code { font-family: var(--font-mono); font-size: 0.78rem; color: var(--text); background: var(--surface-alt); padding: 4px 8px; border-radius: 6px; user-select: all; word-break: break-all; }
.acct-being { display: flex; align-items: center; gap: 1rem; padding: 0.75rem 1rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); transition: border-color 0.15s; }
.acct-being:hover { border-color: color-mix(in srgb, var(--cyan) 28%, var(--border)); }
.acct-being + .acct-being { margin-top: 0.5rem; }
.acct-being-handle { font-family: var(--font-mono); font-size: 0.85rem; font-weight: 500; color: var(--text); }
.acct-being-id { font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-muted); }
.acct-being-badges { margin-left: auto; display: flex; gap: 6px; }
.acct-provider { display: flex; align-items: center; gap: 0.75rem; padding: 0.65rem 1rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
.acct-provider + .acct-provider { margin-top: 0.5rem; }
.acct-provider svg { width: 18px; height: 18px; flex-shrink: 0; }
.acct-provider-name { font-size: 0.85rem; font-weight: 500; color: var(--text); }
.acct-provider-meta { margin-left: auto; font-family: var(--font-mono); font-size: 0.68rem; color: var(--text-muted); }
.acct-empty { color: var(--text-muted); font-size: 0.85rem; padding: 0.5rem 0; }
.acct-footer { padding: 2rem 0 0; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.acct-meta { font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-muted); }

@media (max-width: 900px) {
  .old-lab-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .shell-topbar-inner {
    padding: 0.9rem 1rem;
    grid-template-columns: 1fr;
    justify-items: center;
    align-items: center;
  }
  .shell-wordmark-wrap, .shell-links--centered, .shell-links--auth {
    justify-self: center;
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
  .acct-header { flex-direction: column; gap: 1rem; padding: 2rem 0 1.5rem; }
  .acct-being { flex-wrap: wrap; }
  .acct-being-badges { margin-left: 0; }
  .acct-cred { flex-direction: column; align-items: flex-start; gap: 4px; }
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
`;

