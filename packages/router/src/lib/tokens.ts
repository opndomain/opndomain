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
  display: grid;
  gap: 12px;
  padding: 10px 0 0;
  border-top: 1px solid var(--border);
}
.topics-filter-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
  gap: 10px 14px;
  align-items: end;
}
.topics-filter-field {
  display: grid;
  gap: 4px;
}
.topics-filter-field label {
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 0.63rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.topics-filter-actions {
  display: flex;
  gap: 0;
  flex-wrap: nowrap;
  align-self: end;
}
.topics-filter-actions .button,
.topics-filter-actions button {
  border: 1px solid var(--border);
  border-radius: 0;
  padding: 11px 14px;
  background: #fff;
  color: var(--text);
  font-weight: 500;
}
.topics-filter-actions button {
  border-right: 0;
}
.topics-filter-actions .button:hover,
.topics-filter-actions button:hover {
  border-color: var(--cyan);
  color: var(--cyan);
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
.topics-filter-form select {
  border-radius: 0;
  border-color: var(--border);
  background: #fff;
  box-shadow: none;
  min-height: 44px;
}
.topics-filter-form select:focus {
  outline: none;
  border-color: var(--cyan);
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
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .topics-filter-actions {
    grid-column: 1 / -1;
    justify-content: flex-start;
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
  .topics-filter-form,
  .topics-card-meta {
    grid-template-columns: 1fr;
  }
  .topics-filter-actions {
    flex-wrap: wrap;
    gap: 8px;
  }
  .topics-filter-actions button {
    border-right: 1px solid var(--border);
  }
}
`;

export const LANDING_PAGE_STYLES = `
.verdict-feature {
  display: grid;
  gap: 18px;
  margin: 0 0 2rem;
  padding: 1.1rem 1.15rem 1.2rem;
  border: 1px solid color-mix(in srgb, var(--cyan) 24%, var(--border));
  border-radius: 16px;
  background:
    linear-gradient(135deg, rgba(77, 103, 128, 0.08), rgba(123, 98, 88, 0.05)),
    color-mix(in srgb, var(--surface) 90%, white 10%);
  box-shadow: 0 18px 50px rgba(23, 25, 29, 0.08);
}
.verdict-feature-head {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: end;
}
.verdict-feature-kicker,
.verdict-card-domain,
.verdict-card-confidence,
.verdict-card-footer {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.verdict-feature-title {
  margin: 0.3rem 0 0.45rem;
  font-size: clamp(1.45rem, 2.6vw, 2rem);
  line-height: 1.02;
}
.verdict-feature-lede {
  max-width: 64ch;
  color: var(--text-dim);
}
.verdict-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.verdict-card {
  display: grid;
  gap: 12px;
  min-height: 100%;
  padding: 1rem 1.05rem 1.1rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  text-decoration: none;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.76), rgba(255, 255, 255, 0.35)),
    var(--surface);
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.verdict-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--cyan) 34%, var(--border));
  box-shadow: 0 16px 36px rgba(23, 25, 29, 0.08);
}
.verdict-card-topline {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: start;
}
.verdict-card-confidence {
  color: var(--purple);
}
.verdict-card-title {
  margin: 0;
  font-size: 1.15rem;
  line-height: 1.12;
}
.verdict-card-summary {
  color: var(--text-dim);
  font-size: 0.9rem;
  line-height: 1.55;
}
.verdict-card-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: auto;
  color: var(--text-muted);
  letter-spacing: 0.08em;
}

@media (max-width: 800px) {
  .verdict-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .verdict-feature-head {
    flex-direction: column;
    align-items: start;
  }
}

@media (max-width: 640px) {
  .verdict-feature {
    margin-bottom: 1.5rem;
    padding: 1rem;
  }
  .verdict-grid {
    grid-template-columns: 1fr;
  }
}
`;

export const TOPIC_DETAIL_PAGE_STYLES = `
.topic-verdict-summary {
  display: grid;
  gap: 18px;
  padding: 24px 24px 22px;
  border: 1px solid color-mix(in srgb, var(--cyan) 24%, var(--border));
  border-radius: 18px;
  background:
    linear-gradient(135deg, rgba(77, 103, 128, 0.09), rgba(123, 98, 88, 0.05)),
    var(--surface);
}
.topic-verdict-header {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: end;
}
.topic-verdict-kicker,
.topic-round-index,
.topic-round-meta,
.topic-contribution-meta,
.topic-contribution-score {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.topic-verdict-kicker,
.topic-round-index,
.topic-contribution-score {
  color: var(--cyan);
}
.topic-verdict-header h2 {
  margin: 0.35rem 0 0;
  font-size: clamp(1.55rem, 2.8vw, 2.2rem);
  line-height: 1.02;
}
.topic-verdict-lede {
  max-width: 60ch;
  color: var(--text);
  font-size: 1rem;
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
.topic-verdict-stat-label,
.topic-verdict-section-kicker,
.topic-verdict-item-meta,
.topic-verdict-item-score,
.topic-claim-status {
  color: var(--cyan);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.topic-verdict-scoreboard {
  border: 1px solid color-mix(in srgb, var(--cyan) 16%, var(--border));
  border-radius: 14px;
  padding: 0 16px;
  background: rgba(255, 255, 255, 0.35);
}
.topic-verdict-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.topic-verdict-section {
  display: grid;
  gap: 16px;
  padding: 24px 24px 22px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.68), rgba(255, 255, 255, 0.18)),
    var(--surface);
}
.topic-verdict-section-head {
  display: grid;
  gap: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
}
.topic-verdict-section-head h3,
.topic-verdict-item h4,
.topic-claim-card h4 {
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
  padding: 14px 15px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-alt) 72%, white 28%);
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
  color: var(--text-muted);
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
.topic-transcript {
  display: grid;
  gap: 18px;
}
.topic-round {
  display: grid;
  gap: 14px;
  padding: 16px 0 0;
  border-top: 1px solid var(--border);
}
.topic-round:first-child {
  padding-top: 0;
  border-top: 0;
}
.topic-round-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: end;
}
.topic-round-head h4 {
  margin: 0.25rem 0 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  line-height: 1.1;
}
.topic-round-meta {
  color: var(--text-muted);
}
.topic-round-body {
  display: grid;
  gap: 12px;
}
.topic-contribution {
  display: grid;
  gap: 10px;
  padding: 14px 15px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-alt) 72%, white 28%);
}
.topic-contribution-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: start;
}
.topic-contribution-meta {
  display: grid;
  gap: 2px;
  color: var(--text-muted);
}
.topic-contribution-meta strong {
  color: var(--text);
  font-family: var(--font-body);
  font-size: 0.9rem;
  letter-spacing: 0;
  text-transform: none;
}
.topic-contribution-meta span:last-child {
  font-size: 0.72rem;
  letter-spacing: 0.08em;
}
.topic-contribution-score {
  padding-top: 2px;
}
.topic-contribution p {
  color: var(--text-dim);
}
.topic-share-panel {
  display: grid;
  gap: 18px;
  padding: 24px 24px 22px;
  border: 1px solid color-mix(in srgb, var(--purple) 26%, var(--border));
  border-radius: 18px;
  background:
    linear-gradient(135deg, rgba(123, 98, 88, 0.09), rgba(77, 103, 128, 0.06)),
    linear-gradient(180deg, rgba(255, 255, 255, 0.56), rgba(255, 255, 255, 0.16)),
    var(--surface);
  box-shadow: 0 16px 36px rgba(23, 25, 29, 0.06);
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
  .topic-verdict-header,
  .topic-verdict-item-topline,
  .topic-claim-card-head,
  .topic-round-head,
  .topic-share-head {
    flex-direction: column;
    align-items: start;
  }
  .topic-verdict-confidence {
    grid-template-columns: 1fr;
  }
  .topic-verdict-meta,
  .topic-share-meta {
    justify-content: flex-start;
  }
}

@media (max-width: 640px) {
  .topic-verdict-summary,
  .topic-verdict-section,
  .topic-share-panel {
    padding: 18px 16px;
  }
  .topic-claim-relation {
    grid-template-columns: 1fr;
    gap: 4px;
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
}
.shell-glow-right {
  top: 220px;
  right: -120px;
  background: rgba(123, 98, 88, 0.16);
}
main { max-width: var(--max-w); margin: 0 auto; padding: 28px 1.5rem 88px; position: relative; z-index: 1; }
header.shell { max-width: var(--max-w); margin: 0 auto; padding: 10px 1.5rem 0; position: relative; z-index: 1; }
nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  padding: 1rem 0 0.9rem;
  border-bottom: 1px solid var(--border);
  position: relative;
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
  color: var(--cyan);
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
  max-width: var(--max-w);
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
.old-home-terminal-wrap {
  max-width: 860px;
  margin: 0 0 4rem;
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
  font-size: 0.92rem;
  font-weight: 500;
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
  main { padding: 20px 1rem 64px; }
  header.shell { padding: 8px 1rem 0; }
  nav {
    padding-bottom: 14px;
    align-items: flex-start;
  }
  .nav-links, .footer-links { gap: 12px; }
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
}
`;
