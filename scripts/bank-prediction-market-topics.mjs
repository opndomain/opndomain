#!/usr/bin/env node

const ADMIN_CLIENT_ID = "cli_8308c04fc3a813a0e34435e08ec0c5f8";
const ADMIN_CLIENT_SECRET = "_1504zCRV7WRnBQ5dtZycHkcO7LxMsdC7P0Nkj5wTCM";
const API = "https://api.opndomain.com";

const topics = [
  {
    domainId: "dom_cryptocurrency",
    title: "Does off-chain order matching undermine the decentralization claims of hybrid prediction market protocols?",
    prompt: "Prism Market and similar hybrid protocols use off-chain central limit order books (CLOBs) for high-frequency order matching while settling trades on-chain via smart contracts. The claimed benefit is low latency and high throughput without sacrificing trust. But the off-chain matching engine is semi-centralized — it runs on cloud infrastructure controlled by the protocol operator, processes orders before they reach the chain, and determines which orders match. Critics argue this reintroduces the same single-point-of-failure and censorship risks that decentralized protocols exist to eliminate. Defenders argue that signed order intents and on-chain settlement make the matching engine non-custodial and verifiable. Evaluate whether hybrid architectures genuinely preserve the trust properties of decentralized systems or merely add blockchain settlement as a compliance veneer over a fundamentally centralized exchange. What specific failure modes does the off-chain component introduce that a fully on-chain protocol would not have?",
  },
  {
    domainId: "dom_cryptocurrency",
    title: "Do prediction markets actually outperform expert forecasters and polling aggregators?",
    prompt: "Prediction markets are frequently claimed to aggregate distributed information efficiently and outperform traditional forecasting methods. The academic evidence (Wolfers & Zitzewitz 2004, Berg et al. 2008) supports this for certain domains, particularly elections and sports. But recent high-profile failures — prediction markets pricing Trump's 2020 loss at 90%+ certainty days before the election, markets mispricing COVID timeline by months — suggest the track record is uneven. Evaluate the actual empirical evidence. In which domains do prediction markets reliably outperform polls, models, and expert panels? Where do they systematically fail? Is the information aggregation thesis robust, or does it depend on sufficient liquidity, diverse participants, and well-specified resolution criteria that are often absent in practice? Do thin markets with few sophisticated participants produce noise rather than signal?",
  },
  {
    domainId: "dom_cryptocurrency",
    title: "Is oracle-based market resolution the weakest link in decentralized prediction protocols?",
    prompt: "Decentralized prediction markets like Prism, Polymarket, and Augur all depend on oracle providers (Chainlink, Supra, UMA) to determine market outcomes and trigger settlement. The oracle is the single point where the protocol must trust an external entity to report ground truth accurately. Oracle failures can be catastrophic: incorrect resolution liquidates the wrong side, and delayed resolution locks collateral indefinitely. Decentralized oracles like UMA use economic bonding and dispute mechanisms, but these introduce their own game-theoretic vulnerabilities. Evaluate whether oracle design is the fundamental unsolved problem in prediction market architecture. Can any oracle mechanism provide resolution guarantees comparable to a trusted centralized authority? What happens when the market statement is ambiguous and reasonable people disagree on the outcome — who arbitrates, and how does that differ from centralized resolution?",
  },
  {
    domainId: "dom_economics",
    title: "Should prediction markets be regulated as gambling, financial instruments, or information utilities?",
    prompt: "Prediction markets exist in a regulatory gray zone. The CFTC treats some as derivatives (Kalshi received the first regulated prediction market license in 2020). State gambling commissions treat others as illegal betting. Some academics argue they should be classified as information utilities — public goods that produce valuable forecasting data and should receive regulatory protection rather than restriction. The classification matters enormously: gambling regulation imposes position limits, age restrictions, and advertising bans; derivatives regulation requires capital requirements, reporting, and clearing; information utility status could mean subsidies and legal protection. Evaluate which regulatory framework best fits the actual function of prediction markets. Does the answer depend on whether the market is used for hedging real risk (derivatives), entertainment (gambling), or forecasting (information)? Can a single market serve all three functions, and if so, how should regulators handle the overlap?",
  },
  {
    domainId: "dom_cryptocurrency",
    title: "Will AI agents become the dominant participants in prediction markets within five years?",
    prompt: "Prism Market explicitly designs for both human and algorithmic agent participation — any Hedera account, human or agent, can create markets, submit order intents, and trade positions. As LLMs become capable of parsing news, evaluating probabilities, and executing trades through APIs, the barrier for AI agent participation in prediction markets approaches zero. Polymarket already sees significant bot activity. Evaluate whether AI agents will dominate prediction market volume and price discovery within five years. Would AI-dominated markets produce better or worse forecasts than human-dominated ones? Do AI agents improve liquidity and price efficiency, or do they create new forms of manipulation (wash trading, coordinated position manipulation, oracle gaming)? If prediction markets become primarily AI-vs-AI, does the information aggregation thesis still hold — or does it require genuine diversity of information sources that AI models trained on similar data cannot provide?",
  },
  {
    domainId: "dom_cryptocurrency",
    title: "Does full collateralization make prediction markets safer or just less capital-efficient?",
    prompt: "Prism Market requires full USDC collateralization — every position is 100% backed, there is no borrowing, and losing positions forfeit all collateral. This eliminates counterparty risk and margin insolvency but locks significant capital in escrow for the duration of each market. Traditional derivatives markets use margin (typically 5-20% collateral) which is more capital-efficient but introduces systemic risk through leverage chains. Evaluate the tradeoff. Does full collateralization make prediction markets fundamentally safer than partially collateralized alternatives, or does it merely push the risk elsewhere (opportunity cost, reduced liquidity, smaller position sizes)? Would a prediction market with 10x leverage attract more sophisticated participants and produce better price discovery, or would leverage introduce the same toxic dynamics that plague crypto derivatives exchanges? Is there a middle ground between full collateralization and leveraged trading that optimizes for both safety and capital efficiency?",
  },
  {
    domainId: "dom_cryptocurrency",
    title: "Is Hedera's council-governed model a better foundation for financial protocols than permissionless blockchains?",
    prompt: "Prism Market chose Hedera specifically because of its governing council (Google, IBM, Boeing, etc.), fixed-fee model, ordering fairness, and high throughput without L2 compromises. The whitepaper argues that council governance ensures long-term stability and enables organizations to forecast operating costs — properties critical for financial applications. Critics of the council model argue it is centralized governance wearing decentralization clothing: 39 multinational corporations control the network, which is the opposite of the permissionless ethos that makes blockchain valuable. Evaluate whether council-governed networks like Hedera are genuinely better suited for financial applications than permissionless chains like Ethereum or Solana. Does predictable governance reduce risk for institutional users, or does it introduce regulatory capture risk? Would a prediction market built on Ethereum L2 (Optimism, Arbitrum) achieve comparable performance with stronger censorship resistance?",
  },
  {
    domainId: "dom_forecasting",
    title: "Can prediction markets serve as early warning systems for geopolitical and economic crises?",
    prompt: "Prediction markets aggregate beliefs about future events into real-time probability estimates. In theory, a well-functioning prediction market on questions like 'Will Russia invade Ukraine before March 2022' or 'Will Silicon Valley Bank fail within 60 days' could provide early warning signals that traditional intelligence and financial analysis miss. In practice, prediction markets often reflect the same information available to news consumers, with limited unique intelligence. Evaluate the actual evidence for prediction markets as early warning systems. Have prediction markets ever provided materially earlier warning of a crisis than traditional sources? What structural features (liquidity depth, participant diversity, resolution specificity) would a prediction market need to function as a genuine intelligence tool rather than a mirror of public sentiment? Could governments or institutions use prediction market signals as decision inputs, and what are the risks of doing so?",
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
    id: `tcand_predmkt_${String(i + 1).padStart(2, "0")}_${Date.now().toString(36)}`,
    source: "backfill",
    sourceId: "prism-market-whitepaper-v1",
    sourceUrl: "https://files.gitbook.com/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FzoEY4JMfie8enPMvlrez%2Fuploads%2F9SZi5xZKQBmjhEjBAEsE%2FPrism%20Market%20Whitepaper%20V1.pdf",
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
  console.log(`Source: Prism Market Whitepaper V1\n`);
  for (const t of topics) {
    console.log(`  [${t.domainId.replace("dom_", "")}] ${t.title}`);
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exitCode = 1; });
