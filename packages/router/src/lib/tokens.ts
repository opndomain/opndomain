export const FONT_PRECONNECT = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600;700&family=Cormorant+Garamond:wght@500;600;700&display=swap" rel="stylesheet">
`;

export const GLOBAL_STYLES = `
:root {
  --bg: #f5f0e7;
  --bg-soft: #f1ebe1;
  --panel: rgba(252, 247, 239, 0.9);
  --ink: #18181b;
  --muted: #706d67;
  --muted-soft: #a19a8f;
  --border: rgba(24, 24, 27, 0.085);
  --accent: #92a0bb;
  --accent-deep: #8798b8;
  --shadow: 0 20px 48px rgba(40, 31, 22, 0.05);
  --radius: 22px;
  --shell-width: 1180px;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  color: var(--ink);
  font-family: "Inter", sans-serif;
  background:
    radial-gradient(circle at top center, rgba(135, 152, 184, 0.06), transparent 34%),
    linear-gradient(180deg, var(--bg-soft) 0%, var(--bg) 100%);
}
a { color: inherit; }
main { max-width: var(--shell-width); margin: 0 auto; padding: 28px 22px 88px; }
header.shell { max-width: var(--shell-width); margin: 0 auto; padding: 10px 22px 0; }
nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  padding: 14px 0 16px;
  border-bottom: 1px solid var(--border);
}
.wordmark {
  font-size: 0.94rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  text-decoration: none;
}
.wordmark-accent {
  color: var(--accent-deep);
}
.nav-links, .footer-links {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  align-items: center;
}
.nav-links a, .footer-links a {
  text-decoration: none;
  color: var(--muted-soft);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.nav-links a:hover, .footer-links a:hover, .old-lab-card a:hover, .old-terminal-link:hover { color: var(--ink); }
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
  font-family: "IBM Plex Mono", monospace;
}
.eyebrow { background: rgba(127, 144, 177, 0.08); color: var(--accent-deep); }
.data-badge { background: rgba(135, 152, 184, 0.11); color: var(--accent-deep); }
.status-pill { background: rgba(22, 23, 27, 0.06); color: var(--muted); }
h1, h2, h3 {
  font-family: "Cormorant Garamond", serif;
  line-height: 0.94;
  letter-spacing: -0.045em;
  margin: 0 0 12px;
}
h1 { font-size: clamp(2.8rem, 7vw, 5.4rem); }
h2 { font-size: clamp(2rem, 4vw, 3rem); }
h3 { font-size: 1.6rem; }
p, li, td, th, label, input, textarea, select, button { font-size: 0.98rem; line-height: 1.65; }
p { color: var(--muted); }
.lede { max-width: 780px; font-size: 1.08rem; }
.grid { display: grid; gap: 18px; }
.grid.two { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
.grid.three { grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }
.card, .transcript-block, .admin-table-wrap, .form-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
  box-shadow: var(--shadow);
  backdrop-filter: blur(10px);
}
.card, .transcript-block, .form-card { padding: 22px; }
.stat-row {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(22, 23, 27, 0.08);
}
.stat-row:last-child { border-bottom: 0; }
.mono, code, pre { font-family: "IBM Plex Mono", monospace; }
.muted { color: var(--muted); }
.actions { display: flex; gap: 10px; flex-wrap: wrap; }
button, .button {
  border: 0;
  border-radius: 999px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #8093b6, #9cabca);
  color: white;
  cursor: pointer;
  text-decoration: none;
  font-weight: 600;
}
.button.secondary, button.secondary { background: rgba(22, 23, 27, 0.08); color: var(--ink); }
input, textarea, select {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.84);
  color: var(--ink);
}
textarea { min-height: 140px; resize: vertical; }
form { display: grid; gap: 12px; }
table { width: 100%; border-collapse: collapse; }
th, td {
  padding: 12px 14px;
  border-bottom: 1px solid rgba(22, 23, 27, 0.08);
  text-align: left;
  vertical-align: top;
}
footer {
  max-width: var(--shell-width);
  margin: 0 auto;
  padding: 10px 22px 42px;
  color: var(--muted-soft);
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}

.old-home { padding-top: 6px; }
.old-home-hero { text-align: center; padding: 44px 0 20px; }
.old-home-kicker {
  margin-bottom: 14px;
  color: var(--muted-soft);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.old-home-title {
  max-width: 980px;
  margin: 0 auto;
  font-size: clamp(3.8rem, 7.4vw, 6.25rem);
  font-weight: 600;
}
.old-home-title .accent { color: var(--accent-deep); }
.old-home-subtitle {
  max-width: 760px;
  margin: 18px auto 0;
  font-size: 1.04rem;
  line-height: 1.75;
}
.old-home-terminal-wrap {
  max-width: 860px;
  margin: 34px auto 0;
}
.old-terminal {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
  background: linear-gradient(180deg, #17181d 0%, #111216 100%);
  border: 1px solid rgba(255, 255, 255, 0.045);
  box-shadow: 0 24px 56px rgba(17, 18, 22, 0.16);
}
.old-terminal::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 24%);
  pointer-events: none;
}
.old-terminal-topbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.old-terminal-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}
.old-terminal-dot.red { background: #ff6b5f; }
.old-terminal-dot.yellow { background: #ffbd30; }
.old-terminal-dot.green { background: #27c93f; }
.old-terminal-body {
  margin: 0;
  padding: 18px 22px 24px;
  overflow-x: auto;
  color: #d5d2cb;
  font-size: 0.87rem;
  line-height: 1.8;
}
.old-terminal-line { white-space: pre-wrap; }
.old-terminal-line.prompt { color: #ea9d4d; }
.old-terminal-line.output { color: #7f858f; }
.old-terminal-line.success { color: #86c88f; }
.old-terminal-link {
  color: var(--accent-deep);
  text-decoration: none;
}
.old-home-stats {
  max-width: 940px;
  margin: 22px auto 0;
  padding: 18px 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}
.old-home-stat { text-align: center; }
.old-home-stat-value {
  color: var(--ink);
  font-size: 0.92rem;
  font-weight: 700;
}
.old-home-stat-label {
  margin-top: 4px;
  color: var(--muted-soft);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}
.old-section { padding-top: 44px; }
.old-section-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
  margin-bottom: 18px;
}
.old-section-title {
  font-family: "Cormorant Garamond", serif;
  font-size: 2rem;
  font-weight: 600;
  letter-spacing: -0.04em;
}
.old-section-link {
  color: var(--muted-soft);
  text-decoration: none;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.old-lab-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.old-lab-card {
  padding: 16px 18px 18px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: rgba(250, 245, 236, 0.82);
  box-shadow: 0 8px 24px rgba(33, 28, 21, 0.03);
}
.old-lab-card-meta {
  color: var(--muted-soft);
  font-size: 0.67rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.old-lab-card-title {
  margin: 10px 0 16px;
  font-size: 1rem;
  line-height: 1.55;
  color: var(--ink);
  font-weight: 600;
}
.old-lab-card-title a { text-decoration: none; }
.old-lab-card-footer {
  color: var(--muted-soft);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

@media (max-width: 900px) {
  .old-home-stats,
  .old-lab-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  main { padding: 20px 16px 64px; }
  header.shell { padding: 8px 16px 0; }
  nav {
    padding-bottom: 14px;
    align-items: flex-start;
  }
  .nav-links, .footer-links { gap: 12px; }
  .old-home-hero { padding-top: 28px; }
  .old-home-title { font-size: clamp(2.8rem, 13vw, 4.1rem); }
  .old-terminal-body {
    padding: 16px 16px 20px;
    font-size: 0.8rem;
  }
  .old-home-stats,
  .old-lab-grid {
    grid-template-columns: 1fr;
  }
  footer { padding: 12px 16px 36px; }
}
`;
