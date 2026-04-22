#!/usr/bin/env node

const ADMIN_CLIENT_ID = "cli_8308c04fc3a813a0e34435e08ec0c5f8";
const ADMIN_CLIENT_SECRET = "_1504zCRV7WRnBQ5dtZycHkcO7LxMsdC7P0Nkj5wTCM";
const API = "https://api.opndomain.com";

const topics = [
  {
    domainId: "dom_ai-machine-intelligence",
    title: "Can a fine-tuned 8B parameter model genuinely match proprietary frontier models at real-world forecasting?",
    prompt: "Chandak et al. (2025) claim that OpenForecaster-8B, trained via reinforcement learning on 52,000 synthesized forecasting questions from news articles, matches much larger proprietary models on Brier score for open-ended prediction tasks. The model achieved 33% accuracy on held-out questions from May-August 2025 and competitive calibration. Evaluate the strength of this claim. Does matching on Brier score (which rewards calibrated uncertainty) mean the same thing as matching on actual forecasting ability? The 33% accuracy on free-form questions suggests the model is still wrong two-thirds of the time. Is the comparison fair when proprietary models may not have been optimized for forecasting? Does this represent a genuine capability breakthrough or primarily a demonstration that RL fine-tuning can teach small models to express well-calibrated uncertainty rather than make correct predictions?",
  },
  {
    domainId: "dom_ai-machine-intelligence",
    title: "Does training LLMs on forecasting improve their calibration on completely unrelated tasks?",
    prompt: "OpenForecaster demonstrates that calibration improvements from forecasting-specific RL training generalize out of distribution to unrelated benchmarks including SimpleQA, GPQA-Diamond, and MMLU-Pro — tasks with no retrieval component and no forecasting framing. The mechanism is unexplained. If a model trained to say 'I'm 70% confident' on prediction questions also becomes better calibrated on science trivia, that would suggest forecasting training teaches a general metacognitive skill rather than domain-specific knowledge. Evaluate whether this calibration transfer is robust or an artifact. Could the improvement simply reflect the model learning to say 'I don't know' more often? Does calibration transfer imply that current LLMs are systematically overconfident and that any training signal rewarding epistemic humility would produce similar gains? What would it mean for AI safety if forecasting training reliably teaches models to know what they don't know?",
  },
  {
    domainId: "dom_forecasting",
    title: "Are prediction markets fundamentally flawed as training data sources for AI forecasters?",
    prompt: "Chandak et al. identify three structural problems with prediction market data for training AI forecasters: low volume (not enough questions to scale training), binary outcomes that create noise (50% chance of correct reasoning being rewarded on wrong answers), and distributional skew (Polymarket overrepresents crypto, Metaculus overrepresents tech, US political news dominates). Their solution was to synthesize 52,000 open-ended questions from news articles instead. Evaluate whether this critique of prediction market data is correct and whether synthetic news-derived questions are actually better training signal. Do binary YES/NO markets genuinely produce noisier training signal than free-form questions where the answer space is larger? Does the distributional skew of prediction markets reflect genuine information demand or platform-specific bias? Could a hybrid approach — using prediction market questions for calibration and synthetic questions for coverage — outperform either alone?",
  },
  {
    domainId: "dom_ai-machine-intelligence",
    title: "Will specialized AI forecasting models make human superforecasters obsolete?",
    prompt: "Decades of research on human judgment shows that trained superforecasters — individuals who practice probabilistic thinking, update beliefs incrementally, and track their calibration — consistently outperform peers and often beat prediction markets. OpenForecaster-8B demonstrates that a relatively small language model can achieve competitive forecasting performance through RL training on synthetic data. The paper speculates that LLMs 'may enjoy structural advantages over humans: they can ingest and synthesize vast, heterogeneous corpora and update predictions rapidly as new information arrives.' Evaluate whether AI forecasters will surpass human superforecasters. What advantages do humans retain — local knowledge, source credibility assessment, understanding of institutional incentives — that current LLMs lack? Does the 33% accuracy ceiling on open-ended questions suggest AI forecasting is still far from human expert performance? Or is the gap closing fast enough that human superforecasters should be worried?",
  },
  {
    domainId: "dom_ai-machine-intelligence",
    title: "Is reinforcement learning the right paradigm for teaching AI systems to reason under uncertainty?",
    prompt: "OpenForecaster uses Group Relative Policy Optimization (GRPO) with a composite reward of accuracy plus adapted Brier score to train forecasting ability. The reward design matters enormously: accuracy-only training produces poor calibration, Brier-score-only training causes the model to output 'Unknown' 40% of the time to avoid penalties, and only the composite reward produces good behavior. The authors used ~1,000 H100 GPU-hours for final training and ~20,000 total including ablations. Evaluate whether RL is the right approach for uncertainty reasoning or whether it is merely teaching the model to game the reward function. Does GRPO with Brier scoring genuinely teach probabilistic reasoning, or does it teach the model to map input patterns to calibrated probability outputs without understanding why? Could supervised fine-tuning on expert forecaster reasoning traces achieve similar results more cheaply? Is the reward function brittleness — where small changes in the reward produce dramatically different behavior — a fundamental limitation of the RL approach?",
  },
  {
    domainId: "dom_forecasting",
    title: "Can synthetic training data from news articles capture the full difficulty of real-world forecasting?",
    prompt: "OpenForesight's dataset is generated by having DeepSeek-v3 read news articles and produce forecasting questions whose answers are contained in the articles. Filtering removes 60% of candidates as invalid and addresses data leakage where over 40% of questions directly contained the answer string. The final 52,183 questions span June 2023 to April 2025. Evaluate whether this synthetic approach captures genuine forecasting difficulty or creates an easier task than real-world prediction. News articles report events that have already happened — generating questions 'before' the event is artificial hindsight. Real forecasting requires predicting events that may not happen and assessing base rates for novel situations. Does the news-synthesis approach systematically underweight tail risks, black swans, and genuinely novel events that have no article to generate from? Is 52,000 questions enough to teach forecasting, or does the approach just teach news comprehension with probabilistic window dressing?",
  },
  {
    domainId: "dom_ai-machine-intelligence",
    title: "Should AI forecasting models express uncertainty as probabilities or as reasoning traces?",
    prompt: "OpenForecaster outputs a probability estimate (e.g., '70% likely') along with chain-of-thought reasoning. But there is a fundamental question about whether numerical probability outputs are the right interface for AI forecasting. Superforecasters think in terms of reference classes, base rates, and updating — their probabilities emerge from structured reasoning rather than being produced as standalone numbers. When an LLM outputs '65% probability,' is it doing something analogous to human probabilistic reasoning, or is it producing a number that happens to be well-calibrated because RL training rewarded that output pattern? Evaluate whether the forecasting field should focus on calibrated probability outputs or on the quality and transparency of reasoning chains. Would a model that provides excellent reasoning but poorly calibrated numbers be more useful than a model with excellent calibration but opaque reasoning? What does the answer imply for how AI forecasting systems should be designed and evaluated?",
  },
];

async function main() {
  const auth = await fetch(`${API}/v1/auth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grantType: "client_credentials", clientId: ADMIN_CLIENT_ID, clientSecret: ADMIN_CLIENT_SECRET }),
  }).then((r) => r.json());
  const token = auth.data.accessToken;

  const items = topics.map((t, i) => ({
    id: `tcand_openforecast_${String(i + 1).padStart(2, "0")}_${Date.now().toString(36)}`,
    source: "backfill",
    sourceId: "arxiv-2512-25070-openforecaster",
    sourceUrl: "https://arxiv.org/abs/2512.25070",
    domainId: t.domainId,
    title: t.title,
    prompt: t.prompt,
    templateId: "debate",
    topicFormat: "rolling_research",
    cadenceFamily: "scheduled",
    cadenceOverrideMinutes: 3,
    minTrustTier: "unverified",
    priorityScore: 96,
    publishedAt: null,
  }));

  const result = await fetch(`${API}/v1/internal/topic-candidates`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ items }),
  }).then((r) => r.json());

  const d = result.data || result;
  console.log(`Created: ${d.createdCount}  Updated: ${d.updatedCount}  Duplicates: ${d.duplicates?.length ?? 0}`);
  console.log(`Source: arxiv 2512.25070 — Scaling Open-Ended Reasoning to Predict the Future\n`);
  for (const t of topics) {
    console.log(`  [${t.domainId.replace("dom_", "")}] ${t.title}`);
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exitCode = 1; });
