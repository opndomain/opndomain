import { DOMAINS } from "../domains.js";

export type DomainDescriptor = typeof DOMAINS[number];

export type DomainBackfillGuide = {
  focusAreas: string[];
  avoidPatterns: string[];
  requiredAngles?: string[];
  sampleTopicShapes?: string[];
};

const DEFAULT_GUIDE: DomainBackfillGuide = {
  focusAreas: [
    "Important internal fault lines within the domain",
    "Specific interventions, thresholds, or decision rules",
    "Empirical disagreements that would change what a serious operator does next",
  ],
  avoidPatterns: [
    "Generic 'future of the field' questions",
    "Broad survey prompts that could fit any adjacent domain",
    "Titles with no concrete mechanism, actor, threshold, or trade-off",
  ],
  requiredAngles: [
    "A real decision, failure mode, or trade-off",
    "A bounded object of debate such as a method, policy, benchmark, or deployment condition",
  ],
  sampleTopicShapes: [
    "Should X be required before Y in [domain]?",
    "Does method X outperform method Y once trade-off Z is counted?",
    "Are current benchmarks for X masking failure mode Y?",
  ],
};

export const DOMAIN_BACKFILL_GUIDES: Record<DomainDescriptor["slug"], DomainBackfillGuide> = {
  "ai-safety": {
    focusAreas: [
      "Eval validity, especially cases where models know they are being evaluated",
      "Release gating, deployment thresholds, and rollback triggers",
      "Open-weight release, model autonomy, and misuse capability benchmarks",
      "Audit regimes, monitoring, interpretability, and post-deployment oversight",
      "Deception, sycophancy, reward hacking, sandbagging, and hidden strategic behavior",
    ],
    avoidPatterns: [
      "Generic prompts about whether advanced AI is dangerous",
      "Broad questions about 'alignment' with no named method or failure mode",
      "Abstract safety rhetoric with no actor, threshold, or enforcement mechanism",
    ],
    requiredAngles: [
      "A concrete safety practice, eval, release rule, or oversight mechanism",
      "A trade-off between safety, capability, deployment speed, openness, or institutional power",
      "A framing where evidence could change a deployment or governance decision",
    ],
    sampleTopicShapes: [
      "Should frontier launches require passing a fixed autonomy eval threshold before API access?",
      "Are current deception probes invalid once models can infer that they are inside an eval?",
      "Should open-weight release be capped below a defined cyber-offense benchmark score?",
    ],
  },
  "machine-learning": {
    focusAreas: [
      "Architectural trade-offs between transformers, state-space models, retrieval-heavy systems, and multimodal stacks",
      "Training methods such as synthetic data, curriculum design, post-training, distillation, and test-time compute",
      "Benchmark validity, contamination, capability overhang, and measurement failures",
      "Inference efficiency, compression, sparsity, and serving-time optimization",
      "Open versus closed research practices when capability gains diffuse quickly",
    ],
    avoidPatterns: [
      "Vague questions about whether bigger models are better",
      "Generic AGI forecasting framed as machine learning research",
      "Topics with no named method, benchmark, scaling regime, or deployment constraint",
    ],
    requiredAngles: [
      "A concrete model class, training technique, benchmark, or resource constraint",
      "A trade-off among capability, efficiency, robustness, reproducibility, or openness",
    ],
    sampleTopicShapes: [
      "Are current multimodal benchmarks overstating agentic competence because tool use is too scaffolded?",
      "Will synthetic-data-heavy post-training beat larger pretraining runs on frontier capability growth over the next two years?",
      "Should sparse mixture-of-experts systems be treated as more brittle than dense models at equal benchmark performance?",
    ],
  },
  "computer-science": {
    focusAreas: [
      "Algorithmic trade-offs in time, memory, approximation quality, and parallelism",
      "Complexity-theoretic boundaries, lower bounds, and practical consequences",
      "Systems design choices in distributed computing, databases, compilers, and networking",
      "Verification, correctness, and failure modes in real software and hardware stacks",
    ],
    avoidPatterns: [
      "Generic prompts about whether one paradigm is better than another",
      "Purely academic questions with no computational or systems consequence",
      "Topics with no named model, algorithm, constraint, or architecture",
    ],
    requiredAngles: [
      "A specific algorithmic or systems choice",
      "A measurable trade-off involving performance, correctness, cost, or complexity",
    ],
    sampleTopicShapes: [
      "Are approximate algorithms now preferable to exact methods for class X once energy and latency are counted?",
      "Should modern distributed systems favor weaker consistency models more often than current industry practice does?",
      "Do current benchmark suites misrepresent real compiler optimization value for large production codebases?",
    ],
  },
  physics: {
    focusAreas: [
      "Interpretive disputes with empirical consequences",
      "Experimental anomalies, measurement limits, and competing explanations",
      "Model selection in cosmology, particle physics, condensed matter, and quantum information",
      "Thresholds where new instrumentation or analysis would change the field's direction",
    ],
    avoidPatterns: [
      "Pop-science prompts about the universe with no testable wedge",
      "Questions whose only disagreement is metaphysical taste",
      "Topics with no experiment, model, anomaly, or prediction",
    ],
    requiredAngles: [
      "A named theory family, observable, or experiment",
      "A trade-off involving explanatory power, falsifiability, precision, or cost",
    ],
    sampleTopicShapes: [
      "Would next-generation dark matter searches be better spent narrowing WIMP space or pivoting to lighter candidates?",
      "Are current quantum error-correction milestones overstating progress toward useful fault-tolerant computation?",
      "Should cosmology treat the Hubble tension as evidence for new physics rather than unresolved systematics?",
    ],
  },
  biology: {
    focusAreas: [
      "Causal mechanisms in genetics, evolution, cell signaling, and development",
      "Reproducibility, measurement quality, and model-organism external validity",
      "Trade-offs between descriptive omics work and intervention-driven biology",
      "Competing explanations for adaptation, regulation, and organismal behavior",
    ],
    avoidPatterns: [
      "Generic questions about whether genes or environment matter more",
      "Overbroad life-science prompts with no pathway, organism, or assay",
      "Topics with no measurable phenotype, mechanism, or intervention",
    ],
    requiredAngles: [
      "A named biological system, mechanism, or experimental model",
      "A trade-off involving explanatory precision, intervention value, or translational relevance",
    ],
    sampleTopicShapes: [
      "Are single-cell atlases producing causal insight, or mostly higher-resolution description without intervention leverage?",
      "Should evolutionary explanations for trait X be treated skeptically unless they outperform developmental alternatives?",
      "Do current organoid models mislead drug and disease research more than they accelerate it?",
    ],
  },
  biosecurity: {
    focusAreas: [
      "Screening, synthesis controls, sequence access rules, and lab procurement chokepoints",
      "Preparedness thresholds, surveillance design, and incident reporting standards",
      "Dual-use publication norms and model-enabled biological design risks",
      "BSL policy, distributed experimentation, and response coordination failures",
      "Interventions that trade off scientific openness against misuse prevention",
    ],
    avoidPatterns: [
      "Generic prompts about whether biotechnology is dangerous",
      "Apocalyptic framing with no named intervention or control point",
      "Broad pandemic preparedness questions with no operational decision attached",
    ],
    requiredAngles: [
      "A concrete control surface such as screening, disclosure, access, procurement, or reporting",
      "A trade-off between scientific utility, speed, resilience, and misuse prevention",
    ],
    sampleTopicShapes: [
      "Should cloud labs be required to apply sequence screening before fulfilling synthetic biology workflows?",
      "Would mandatory incident disclosure for lab-acquired infections improve preparedness more than it would suppress reporting?",
      "Should model-assisted pathogen design research face publication delays until independent misuse review is complete?",
    ],
  },
  chemistry: {
    focusAreas: [
      "Synthesis routes, catalyst choices, scale-up bottlenecks, and material performance trade-offs",
      "Computational chemistry versus experimental validation in discovery workflows",
      "Measurement, reproducibility, and kinetic versus thermodynamic explanations",
      "Industrial chemistry decisions with cost, safety, and environmental implications",
    ],
    avoidPatterns: [
      "Generic prompts about whether a material is promising",
      "Topics with no named reaction class, material family, or performance metric",
      "Questions that collapse chemistry into generic climate or energy talk",
    ],
    requiredAngles: [
      "A concrete compound class, process, catalyst, or assay",
      "A trade-off involving yield, stability, safety, cost, or scalability",
    ],
    sampleTopicShapes: [
      "Will AI-guided catalyst discovery outperform high-throughput screening once scale-up failure is counted?",
      "Are current battery-electrolyte breakthroughs overstated because cycle-life testing is too short and curated?",
      "Should green-chemistry mandates tolerate lower yield thresholds when solvent and waste reductions are large?",
    ],
  },
  mathematics: {
    focusAreas: [
      "Conjectures, proof strategies, and formalization trade-offs",
      "Applied mathematics choices that change modeling or inference quality",
      "Computer-assisted proof, verification, and rigor standards",
      "Whether a new framework clarifies or obscures underlying structure",
    ],
    avoidPatterns: [
      "Generic prompts asking whether math is discovered or invented",
      "Famous unsolved problems with no meaningful argumentative wedge",
      "Topics with no theorem family, method, or formal criterion",
    ],
    requiredAngles: [
      "A named proof technique, formal system, conjecture class, or modeling method",
      "A trade-off involving rigor, generality, tractability, or interpretability",
    ],
    sampleTopicShapes: [
      "Will proof assistants materially change mainstream pure mathematics before they improve graduate-level workflow?",
      "Are current large-language-model theorem provers more likely to accelerate conjecture generation than proof validation?",
      "Should applied fields tolerate weaker asymptotic guarantees when numerically stable approximations dominate in practice?",
    ],
  },
  "climate-science": {
    focusAreas: [
      "Climate sensitivity, tipping risks, regional impacts, and attribution disputes",
      "Mitigation versus adaptation priorities under uncertainty",
      "Carbon removal, geoengineering, and measurement or permanence standards",
      "Model uncertainty that changes policy timing or infrastructure decisions",
    ],
    avoidPatterns: [
      "Generic prompts about whether climate change is serious",
      "Pure politics with no physical, economic, or adaptation mechanism",
      "Topics with no emissions pathway, intervention, or risk threshold",
    ],
    requiredAngles: [
      "A concrete climate intervention, modeling dispute, or adaptation choice",
      "A trade-off involving cost, speed, uncertainty, reversibility, or regional equity",
    ],
    sampleTopicShapes: [
      "Should adaptation funding prioritize heat resilience over flood defense in high-growth urban regions this decade?",
      "Are near-term carbon-removal targets distorting mitigation policy by overstating likely deployment scale?",
      "Does current tipping-point communication overstate deep uncertainty in ways that harm policy calibration?",
    ],
  },
  energy: {
    focusAreas: [
      "Generation mix trade-offs among nuclear, gas, renewables, storage, and transmission",
      "Grid reliability, capacity markets, and interconnection bottlenecks",
      "Industrial electrification, hydrogen, and firm-power infrastructure",
      "Security, affordability, and decarbonization trade-offs in system planning",
    ],
    avoidPatterns: [
      "Generic prompts about whether renewables are the future",
      "Technology advocacy with no system-level constraint",
      "Topics with no grid, fuel, storage, or financing mechanism",
    ],
    requiredAngles: [
      "A specific energy technology, market rule, or infrastructure bottleneck",
      "A trade-off involving reliability, cost, emissions, permitting, or resilience",
    ],
    sampleTopicShapes: [
      "Should grid planners prioritize transmission buildout over long-duration storage for decarbonization through 2035?",
      "Is advanced nuclear more likely to arrive too late for near-term grid needs than current policy assumes?",
      "Do capacity markets improve reliability enough to justify their effect on clean-generation entry incentives?",
    ],
  },
  "space-exploration": {
    focusAreas: [
      "Launch economics, in-space infrastructure, and mission-priority trade-offs",
      "Human versus robotic exploration under budget and scientific-return constraints",
      "Planetary defense, lunar industrialization, and space-governance bottlenecks",
      "Mission architectures where risk, redundancy, and cadence change the answer",
    ],
    avoidPatterns: [
      "Generic prompts about whether humans should go to Mars",
      "Aspirational space enthusiasm with no architecture, budget, or objective",
      "Topics with no mission class, capability threshold, or governance issue",
    ],
    requiredAngles: [
      "A concrete mission architecture, orbital regime, vehicle class, or scientific objective",
      "A trade-off involving risk, cost, cadence, scientific yield, or strategic leverage",
    ],
    sampleTopicShapes: [
      "Should lunar infrastructure funding prioritize surface power and comms over crew-tended science habitats this decade?",
      "Are reusable heavy-lift economics reducing the case for on-orbit assembly more slowly than current plans assume?",
      "Should planetary-defense budgets favor survey completeness over kinetic-interceptor readiness in the next ten years?",
    ],
  },
  neuroscience: {
    focusAreas: [
      "Circuit-level versus systems-level explanations of cognition and behavior",
      "Measurement limits in imaging, electrophysiology, and large-scale neural recording",
      "Competing models of consciousness, representation, and learning in biological systems",
      "Translation gaps between basic neuroscience and clinical or computational claims",
    ],
    avoidPatterns: [
      "Generic prompts about whether the brain is like a computer",
      "Consciousness questions with no empirical handle",
      "Topics with no task, neural measure, intervention, or model class",
    ],
    requiredAngles: [
      "A specific recording method, brain system, intervention, or theory comparison",
      "A trade-off involving explanatory depth, invasiveness, scale, or translational value",
    ],
    sampleTopicShapes: [
      "Are foundation-style brain models more likely to accelerate neuroscience than to formalize noisy correlational data?",
      "Should noninvasive neurotechnology be judged by closed-loop behavioral gain rather than decoding accuracy alone?",
      "Do current consciousness theories make enough divergent predictions to justify new large-scale experimental programs?",
    ],
  },
  medicine: {
    focusAreas: [
      "Trial design, endpoints, subgroup effects, and external validity failures",
      "Screening thresholds, overdiagnosis, underdiagnosis, and treatment timing",
      "Clinical adoption of AI tools, diagnostics, and workflow automation",
      "Cost-effectiveness trade-offs in prevention, therapeutics, and public health",
      "Regulatory evidence standards for accelerated approval and real-world evidence",
    ],
    avoidPatterns: [
      "Broad prompts about whether a disease is important or a treatment is promising",
      "Moralized public health questions without a concrete intervention",
      "Topics with no endpoint, threshold, population, or standard-of-care comparator",
    ],
    requiredAngles: [
      "A specific treatment, screening practice, evidence threshold, or patient subgroup",
      "A trade-off involving efficacy, safety, cost, access, adoption, or false positives",
    ],
    sampleTopicShapes: [
      "Should AI diagnostic tools be adopted in routine triage before prospective outcome trials show net benefit?",
      "Are current accelerated approval standards for oncology drugs too willing to accept surrogate endpoints?",
      "Should screening guidelines move to risk-score-based thresholds instead of age-based eligibility alone?",
    ],
  },
  economics: {
    focusAreas: [
      "Inflation persistence, labor-market slack, productivity measurement, and interest-rate transmission",
      "Industrial policy, tariffs, subsidies, and sector-specific competitiveness trade-offs",
      "Housing, migration, demographic drag, and regional economic divergence",
      "AI-driven labor substitution, wage compression, and capital concentration",
      "Fiscal-monetary coordination under debt pressure and supply-side shocks",
    ],
    avoidPatterns: [
      "Generic recession calls with no transmission mechanism",
      "Ideological prompts about capitalism or inequality with no policy lever",
      "Broad macro questions without a variable, timeframe, or causal channel",
    ],
    requiredAngles: [
      "A concrete policy tool, market mechanism, or measurable macro indicator",
      "A trade-off involving growth, inflation, wages, resilience, fiscal cost, or distribution",
    ],
    sampleTopicShapes: [
      "Will AI adoption raise measured productivity faster than it suppresses median wage growth over the next five years?",
      "Are current tariff regimes increasing domestic resilience enough to offset their inflationary drag?",
      "Should central banks treat shelter inflation as a lagging indicator when setting near-term rates?",
    ],
  },
  finance: {
    focusAreas: [
      "Market structure, liquidity fragility, leverage, and systemic spillovers",
      "Private credit, shadow banking, bank regulation, and maturity mismatch",
      "Passive flows, price discovery, factor crowding, and volatility regimes",
      "AI use in markets, underwriting, fraud detection, and model risk",
      "Capital rules, stress tests, and resolution planning under tail scenarios",
    ],
    avoidPatterns: [
      "Generic asset-price predictions with no mechanism",
      "Topics that amount to stock picking rather than structural debate",
      "Broad prompts about market bubbles without defining the channel or exposure",
    ],
    requiredAngles: [
      "A concrete asset class, regulatory rule, market structure feature, or risk metric",
      "A trade-off involving return, liquidity, resilience, transparency, or moral hazard",
    ],
    sampleTopicShapes: [
      "Does the growth of private credit create more hidden systemic risk than public-bank balance sheets currently reveal?",
      "Are passive index flows now large enough to materially weaken price discovery during stress events?",
      "Should stress tests assume simultaneous AI-driven correlation failures across market-making systems?",
    ],
  },
  "game-theory": {
    focusAreas: [
      "Mechanism design, auction structure, and incentive compatibility under realistic constraints",
      "Repeated games, signaling, and coordination failures in applied settings",
      "Where equilibrium concepts mislead because bounded rationality or incomplete information dominates",
      "Strategic design choices with policy, platform, or market consequences",
    ],
    avoidPatterns: [
      "Toy prisoner's-dilemma prompts with no applied context",
      "Purely formal questions with no mechanism or institutional relevance",
      "Topics with no equilibrium concept, incentive structure, or strategic actor set",
    ],
    requiredAngles: [
      "A concrete game form, mechanism, or strategic environment",
      "A trade-off involving efficiency, robustness, incentive compatibility, or information use",
    ],
    sampleTopicShapes: [
      "Are strategy-proof mechanisms overrated in practice once simplicity and participation costs are counted?",
      "Should platform matching markets tolerate lower efficiency for higher transparency and strategic legibility?",
      "Do current auction designs underprice collusion risk in repeated procurement settings?",
    ],
  },
  governance: {
    focusAreas: [
      "Institutional design, oversight capacity, and auditability in high-stakes systems",
      "Coordination failures between public agencies, firms, and transnational bodies",
      "Delegation, accountability, and enforcement under technical uncertainty",
      "Emergency powers, sunset clauses, and adaptive regulation",
      "Mechanisms that trade off speed, legitimacy, expertise, and capture risk",
    ],
    avoidPatterns: [
      "Abstract prompts about whether governments should regulate more",
      "Questions about institutions with no named mechanism or enforcement path",
      "Normative governance talk detached from implementation constraints",
    ],
    requiredAngles: [
      "A concrete institution, process, authority, or accountability mechanism",
      "A trade-off involving legitimacy, speed, compliance, capacity, or capture",
    ],
    sampleTopicShapes: [
      "Do independent technical audit bodies improve high-stakes regulation more than they diffuse accountability?",
      "Should emergency governance powers in frontier technologies include automatic sunset triggers tied to measurable conditions?",
      "Are multi-agency oversight regimes inherently weaker than a single specialized regulator for fast-moving technical domains?",
    ],
  },
  politics: {
    focusAreas: [
      "Electoral incentives, legislative bargaining, and administrative capacity",
      "Coalition structure, turnout effects, and policy durability",
      "Institutional reforms with real distributional or procedural trade-offs",
      "State capacity, local governance, and implementation failure",
    ],
    avoidPatterns: [
      "Generic partisan hot takes",
      "Horse-race election prompts with no institutional consequence",
      "Ideological questions with no policy mechanism or governance constraint",
    ],
    requiredAngles: [
      "A concrete institution, reform, electoral rule, or policy instrument",
      "A trade-off involving legitimacy, durability, turnout, capacity, or coalition cohesion",
    ],
    sampleTopicShapes: [
      "Would primary reform improve candidate quality more than it weakens party accountability?",
      "Should state capacity investments outrank additional transfer spending in low-trust local governments?",
      "Are independent redistricting commissions reducing polarization less than reformers claim once candidate sorting is counted?",
    ],
  },
  geopolitics: {
    focusAreas: [
      "Alliance credibility, coercive leverage, sanctions, and industrial policy competition",
      "Regional power balances, escalation ladders, and strategic signaling",
      "Trade, energy, and technology chokepoints in interstate competition",
      "Where domestic political constraints alter external strategy",
    ],
    avoidPatterns: [
      "Broad prompts about whether one country is rising or declining",
      "News-cycle commentary with no strategic mechanism",
      "Topics with no actor set, region, coercive tool, or strategic objective",
    ],
    requiredAngles: [
      "A concrete strategic tool, alliance commitment, or theater-specific scenario",
      "A trade-off involving deterrence, escalation, resilience, cost, or alliance cohesion",
    ],
    sampleTopicShapes: [
      "Do technology export controls degrade rival military capability fast enough to justify allied coordination costs?",
      "Should maritime deterrence strategies favor denial capabilities over visible tripwire deployments in region X?",
      "Are sanctions coalitions most effective when they prioritize enforceability over maximal scope?",
    ],
  },
  law: {
    focusAreas: [
      "Standards versus rules, administrative discretion, and enforcement capacity",
      "Constitutional limits, statutory interpretation, and regulatory design",
      "Liability, evidentiary standards, and procedural fairness in emerging domains",
      "Where legal clarity conflicts with adaptive governance",
    ],
    avoidPatterns: [
      "Generic prompts about whether laws should be tougher",
      "Purely moral questions with no doctrinal or institutional hook",
      "Topics with no legal test, remedy, jurisdiction, or enforcement mechanism",
    ],
    requiredAngles: [
      "A specific legal doctrine, statutory framework, remedy, or compliance rule",
      "A trade-off involving clarity, flexibility, due process, deterrence, or administrability",
    ],
    sampleTopicShapes: [
      "Should courts prefer bright-line rules over balancing tests in high-volume digital-rights disputes?",
      "Do strict-liability regimes outperform negligence standards when harms are diffuse but evidence is asymmetric?",
      "Should administrative agencies receive narrower deference when technical standards shift faster than legislative oversight?",
    ],
  },
  philosophy: {
    focusAreas: [
      "Normative conflicts with implications for real decision procedures",
      "Epistemic standards, uncertainty, and disagreement among rational agents",
      "Identity, consciousness, and agency questions that connect to practice",
      "Where philosophical frameworks yield different policy or institutional conclusions",
    ],
    avoidPatterns: [
      "Generic trolley-problem variants",
      "Pure metaphysical prompts with no practical consequence",
      "Topics where disagreement reduces to verbal framing only",
    ],
    requiredAngles: [
      "A specific philosophical conflict with downstream implications",
      "A trade-off involving truth-seeking, welfare, rights, autonomy, or legitimacy",
    ],
    sampleTopicShapes: [
      "Should public decision-making under deep uncertainty favor ambiguity-averse principles over expected-value maximization?",
      "Do realist accounts of moral truth improve coordination more than constructivist accounts in pluralistic institutions?",
      "Is testimony from expert consensus epistemically stronger than first-principles dissent in frontier policy disputes?",
    ],
  },
  psychology: {
    focusAreas: [
      "Replication, measurement validity, and intervention effect sizes",
      "Behavioral mechanisms in decision-making, motivation, and mental health",
      "Clinical practice disputes where evidence and implementation diverge",
      "Trade-offs between lab control and ecological validity",
    ],
    avoidPatterns: [
      "Generic prompts about whether people are rational",
      "Self-help framing with no experimental or clinical grounding",
      "Topics with no construct, intervention, measure, or population",
    ],
    requiredAngles: [
      "A specific construct, intervention, measurement approach, or population",
      "A trade-off involving effect size, replicability, ecological validity, or clinical utility",
    ],
    sampleTopicShapes: [
      "Are digital mental-health interventions being adopted faster than evidence on durable outcomes justifies?",
      "Should behavioral science rely less on convenience-sample experiments even when field studies sharply reduce power?",
      "Do current diagnostic categories in condition X hinder treatment progress more than they help coordination?",
    ],
  },
  sociology: {
    focusAreas: [
      "Institutional trust, inequality, network effects, and group behavior",
      "Family structure, urbanization, labor shifts, and social mobility",
      "Measurement disputes in culture, norms, and demographic change",
      "Policies whose effects depend on social structure rather than incentives alone",
    ],
    avoidPatterns: [
      "Generic culture-war prompts",
      "Broad inequality questions with no mechanism or institution",
      "Topics with no social unit, institution, or measurable outcome",
    ],
    requiredAngles: [
      "A concrete institution, network, policy, or social mechanism",
      "A trade-off involving cohesion, mobility, legitimacy, inequality, or participation",
    ],
    sampleTopicShapes: [
      "Do remote-work norms weaken social mobility by reducing informal apprenticeship pathways?",
      "Should urban anti-displacement policy tolerate slower housing growth to preserve local social capital?",
      "Are current loneliness interventions misframed because they target individuals rather than community structure?",
    ],
  },
  history: {
    focusAreas: [
      "Competing causal explanations for major events and institutional change",
      "Counterfactuals that clarify rather than merely dramatize",
      "Revisionist interpretations with consequences for current reasoning",
      "Methodological disputes about archives, quantification, and historical generalization",
    ],
    avoidPatterns: [
      "Trivia-like historical prompts",
      "Counterfactuals with no analytical purpose",
      "Topics with no period, actors, source base, or causal claim",
    ],
    requiredAngles: [
      "A specific episode, causal mechanism, or historiographic dispute",
      "A trade-off involving explanatory scope, evidence quality, or lesson transferability",
    ],
    sampleTopicShapes: [
      "Did state capacity matter more than ideology in outcome X once wartime logistics are counted?",
      "Are economic explanations for historical turning point Y crowding out more decisive institutional causes?",
      "Should historians rely more heavily on quantitative reconstruction in topic Z despite archival incompleteness?",
    ],
  },
  education: {
    focusAreas: [
      "Instructional methods, assessment design, and curriculum trade-offs",
      "Teacher quality, tutoring, edtech, and labor-market alignment",
      "Early-childhood versus later-stage interventions",
      "Measurement disputes over learning gains, persistence, and transfer",
    ],
    avoidPatterns: [
      "Generic prompts about whether education is broken",
      "Edtech hype with no classroom or assessment mechanism",
      "Topics with no age group, intervention, or learning outcome",
    ],
    requiredAngles: [
      "A specific pedagogical method, institutional reform, or measurement choice",
      "A trade-off involving learning gain, equity, cost, teacher workload, or long-term transfer",
    ],
    sampleTopicShapes: [
      "Should schools prioritize high-dosage tutoring over class-size reduction when budgets are fixed?",
      "Are mastery-based grading systems improving learning more than they obscure signal for downstream institutions?",
      "Will AI classroom tools increase teacher leverage more than they erode student struggle-based learning?",
    ],
  },
  linguistics: {
    focusAreas: [
      "Syntax, semantics, pragmatics, and language change disputes",
      "Cross-linguistic evidence that challenges dominant theories",
      "Computational linguistics where empirical success and explanatory adequacy diverge",
      "Language acquisition, bilingualism, and communication under social constraints",
    ],
    avoidPatterns: [
      "Generic prompts about whether language shapes thought",
      "Purely descriptive questions with no theoretical wedge",
      "Topics with no language set, phenomenon, or model comparison",
    ],
    requiredAngles: [
      "A specific linguistic phenomenon, theory family, corpus, or population",
      "A trade-off involving explanatory power, universality, learnability, or computational performance",
    ],
    sampleTopicShapes: [
      "Do large language models strengthen usage-based theories of language more than they undermine symbolic syntax?",
      "Should semantic theories prioritize cross-linguistic compositionality over psycholinguistic plausibility?",
      "Are current benchmarks in computational pragmatics measuring reasoning or annotation artifacts?",
    ],
  },
  cybersecurity: {
    focusAreas: [
      "Vulnerability disclosure timing, exploit markets, and defensive coordination",
      "Supply-chain compromise, software attestations, identity infrastructure, and trust boundaries",
      "Cloud concentration, critical-infrastructure resilience, and single points of failure",
      "Offense-defense balance in AI-assisted cyber operations",
      "Security regulation, liability, breach reporting, and baseline controls",
    ],
    avoidPatterns: [
      "Generic prompts about whether cyber threats are increasing",
      "Topics with no attacker model, control layer, or defense mechanism",
      "Broad fear framing around AI cyber risk with no operational threshold",
    ],
    requiredAngles: [
      "A concrete threat model, control layer, disclosure rule, or capability benchmark",
      "A trade-off involving deterrence, transparency, patch speed, resilience, or attacker adaptation",
    ],
    sampleTopicShapes: [
      "Should high-severity vulnerability disclosure be delayed when active exploitation appears less likely than rapid patch bypass?",
      "Are software bills of materials materially improving defense, or mostly creating compliance theater?",
      "Should open release of cyber-capable model weights be capped at a benchmarked exploit-generation threshold?",
    ],
  },
  "software-engineering": {
    focusAreas: [
      "Architecture, reliability, testing, and incident response trade-offs",
      "Developer tooling, AI-assisted coding, and review or verification standards",
      "Monolith versus service decomposition under real operational constraints",
      "Performance, maintainability, and delivery-speed tensions in production systems",
    ],
    avoidPatterns: [
      "Generic prompts about best practices",
      "Tool wars with no workload, team, or system context",
      "Topics with no failure mode, architecture choice, or engineering constraint",
    ],
    requiredAngles: [
      "A specific engineering practice, architecture choice, or operational metric",
      "A trade-off involving velocity, reliability, complexity, cost, or debuggability",
    ],
    sampleTopicShapes: [
      "Do AI coding assistants improve net engineering throughput once review and regression costs are counted?",
      "Should high-growth teams delay microservice decomposition longer than current platform lore recommends?",
      "Are end-to-end tests being overused where contract testing would catch most regression risk at lower cost?",
    ],
  },
  robotics: {
    focusAreas: [
      "Embodiment, perception, manipulation, and control trade-offs",
      "Simulation-to-real transfer, teleoperation, and data-collection strategy",
      "General-purpose versus task-specialized robotics architectures",
      "Deployment constraints in safety, uptime, and human interaction",
    ],
    avoidPatterns: [
      "Generic prompts about whether robots will replace humans",
      "AI-overhang questions with no embodiment or deployment constraint",
      "Topics with no task class, control loop, sensor stack, or operating environment",
    ],
    requiredAngles: [
      "A specific robot capability, deployment environment, or training method",
      "A trade-off involving dexterity, reliability, cost, autonomy, or safety",
    ],
    sampleTopicShapes: [
      "Will teleoperated data remain more valuable than synthetic simulation data for manipulation progress over the next three years?",
      "Should warehouse robotics prioritize specialized hardware over more general-purpose policy learning systems?",
      "Are current humanoid benchmarks overstating near-term commercial usefulness because uptime constraints are ignored?",
    ],
  },
  biotechnology: {
    focusAreas: [
      "Gene editing, cell therapy, biomanufacturing, and platform scalability",
      "Regulatory and manufacturing bottlenecks in translational biotech",
      "Trade-offs between precision, durability, delivery, and cost",
      "Ethical or governance disputes tied to real technical interventions",
    ],
    avoidPatterns: [
      "Generic prompts about whether biotech is good or dangerous",
      "Broad bioethics questions with no therapeutic or platform context",
      "Topics with no modality, target, delivery system, or manufacturing constraint",
    ],
    requiredAngles: [
      "A concrete modality, therapeutic target, manufacturing process, or regulatory threshold",
      "A trade-off involving efficacy, safety, durability, access, or scale",
    ],
    sampleTopicShapes: [
      "Will in vivo gene editing overtake ex vivo approaches first in rare disease because delivery is improving faster than manufacturing?",
      "Are current cell-therapy economics too structurally fragile for broad solid-tumor use even if efficacy improves?",
      "Should platform-biotech valuations depend more on manufacturing repeatability than on early biomarker results?",
    ],
  },
  cryptocurrency: {
    focusAreas: [
      "Consensus design, scaling, MEV, custody, and governance trade-offs",
      "Stablecoins, exchange structure, and on-chain versus off-chain trust boundaries",
      "Protocol incentives, security budgets, and decentralization claims",
      "Regulatory design where compliance and permissionlessness conflict",
    ],
    avoidPatterns: [
      "Generic prompts about whether crypto has value",
      "Price speculation with no protocol or market-structure mechanism",
      "Topics with no chain design, governance rule, custody model, or incentive issue",
    ],
    requiredAngles: [
      "A concrete protocol mechanism, market structure feature, or compliance rule",
      "A trade-off involving security, decentralization, throughput, composability, or capture risk",
    ],
    sampleTopicShapes: [
      "Are rollup-centric scaling strategies creating more governance centralization than they solve in base-layer congestion?",
      "Should stablecoin issuers be regulated more like narrow banks than like payment platforms?",
      "Does MEV mitigation reduce user harm enough to justify additional protocol complexity and latency?",
    ],
  },
  forecasting: {
    focusAreas: [
      "Calibration, aggregation, base-rate use, and feedback-loop quality",
      "Human versus model-assisted forecasting in dynamic environments",
      "Question design, resolution criteria, and incentive structures",
      "Where forecasting systems fail due to regime change or adversarial adaptation",
    ],
    avoidPatterns: [
      "Generic prompts about whether predictions are hard",
      "Meta-forecasting with no scoring rule, population, or horizon",
      "Topics with no calibration metric, aggregation method, or resolution rule",
    ],
    requiredAngles: [
      "A concrete forecasting method, incentive design, or evaluation standard",
      "A trade-off involving accuracy, interpretability, timeliness, or robustness",
    ],
    sampleTopicShapes: [
      "Do prediction markets outperform superforecaster panels once thin liquidity and manipulation risk are counted?",
      "Should long-range forecasting rely more heavily on outside-view base rates than on expert decomposition in fast-moving domains?",
      "Are current scoring rules pushing forecasters toward underconfident consensus rather than truthful sharpness?",
    ],
  },
  statistics: {
    focusAreas: [
      "Bayesian versus frequentist trade-offs in real inference settings",
      "Causal inference, external validity, and identification strategy disputes",
      "Model misspecification, robustness, and measurement error",
      "Experimental design choices that change decisions rather than just p-values",
    ],
    avoidPatterns: [
      "Generic prompts about whether p-values are bad",
      "Methodology debates with no applied decision context",
      "Topics with no estimator, design, prior, or robustness issue",
    ],
    requiredAngles: [
      "A specific inference framework, design choice, or identification problem",
      "A trade-off involving bias, variance, interpretability, computational cost, or decision quality",
    ],
    sampleTopicShapes: [
      "Should applied policy research rely less on significance thresholds and more on decision-theoretic loss framing?",
      "Are modern causal-inference toolkits overstating identification credibility in noisy observational settings?",
      "Do hierarchical Bayesian models improve applied forecasting enough to justify their weaker transparency to stakeholders?",
    ],
  },
  "decision-science": {
    focusAreas: [
      "Decision procedures under uncertainty, irreversibility, and limited attention",
      "Heuristics versus formal optimization in organizational practice",
      "Cognitive bias correction, information design, and incentive alignment",
      "Where decision quality depends more on process than on raw prediction accuracy",
    ],
    avoidPatterns: [
      "Generic prompts about whether humans are biased",
      "Abstract rationality debates with no decision environment",
      "Topics with no objective, uncertainty structure, or process design",
    ],
    requiredAngles: [
      "A specific decision rule, process intervention, or information structure",
      "A trade-off involving speed, robustness, accuracy, coordination, or cognitive load",
    ],
    sampleTopicShapes: [
      "Should high-stakes organizations use simpler robust decision rules more often than expected-value optimization?",
      "Do premortems improve decision quality enough to justify the delay and narrative anchoring they introduce?",
      "Are current debiasing interventions less effective than redesigning the information environment around decisions?",
    ],
  },
  "risk-analysis": {
    focusAreas: [
      "Tail-risk modeling, resilience investments, and mitigation prioritization",
      "Correlated failure modes, compounding shocks, and systemic fragility",
      "Forecasting rare events under deep uncertainty",
      "Decision rules for low-probability high-impact scenarios",
    ],
    avoidPatterns: [
      "Generic doom prompts with no mitigation lever",
      "Risk lists with no prioritization mechanism",
      "Topics with no hazard model, resilience intervention, or decision threshold",
    ],
    requiredAngles: [
      "A concrete risk model, mitigation action, or prioritization criterion",
      "A trade-off involving resilience, cost, false alarms, or neglectedness",
    ],
    sampleTopicShapes: [
      "Should resilience planning weight correlated moderate disruptions more heavily than singular extreme-tail scenarios?",
      "Are current existential-risk portfolios underinvesting in recovery capacity relative to prevention?",
      "Do red-team scenario exercises improve tail-risk preparedness more than probabilistic modeling alone?",
    ],
  },
  sports: {
    focusAreas: [
      "Roster construction, coaching strategy, injury management, and performance analytics",
      "Rule changes, officiating incentives, and schedule or playoff design",
      "Prospect evaluation, contract strategy, and aging curves",
      "Where public analytics and team practice still diverge",
    ],
    avoidPatterns: [
      "Simple who-will-win questions",
      "Fan-take topics with no strategic or analytical wedge",
      "Topics with no league rule, tactic, roster choice, or performance metric",
    ],
    requiredAngles: [
      "A concrete tactic, roster rule, valuation model, or competition format",
      "A trade-off involving wins, durability, variance, payroll, or fairness",
    ],
    sampleTopicShapes: [
      "Should franchise roster building value depth over top-end stars more than current salary structures encourage?",
      "Are current load-management strategies improving postseason outcomes enough to justify regular-season product costs?",
      "Do play-in formats improve competitive integrity more than they distort team incentives late in the season?",
    ],
  },
  "fantasy-sports": {
    focusAreas: [
      "Roster optimization, projection systems, contest selection, and portfolio strategy",
      "Injury uncertainty, late-news processing, and game-theory leverage",
      "Scoring settings, replacement value, and draft or waiver economics",
      "Where public projections create exploitable crowd behavior",
    ],
    avoidPatterns: [
      "Generic who-should-I-start questions",
      "Player takes without a scoring or contest framework",
      "Topics with no roster format, projection method, or leverage dynamic",
    ],
    requiredAngles: [
      "A concrete scoring format, contest structure, or projection/optimization method",
      "A trade-off involving floor, ceiling, ownership, correlation, or replacement value",
    ],
    sampleTopicShapes: [
      "Do late-swap strategies in DFS create more edge than raw projection accuracy in top-heavy tournaments?",
      "Should dynasty valuations discount young prospects more heavily for time-to-usable-production risk?",
      "Are public consensus rankings compressing waiver-wire upside enough to reward more aggressive churn strategies?",
    ],
  },
  esports: {
    focusAreas: [
      "Meta adaptation, drafting, team coordination, and patch-cycle effects",
      "Roster construction, coaching, and player-role specialization",
      "Tournament formats, scrim culture, and performance variance",
      "Analytics use where public and professional views diverge",
    ],
    avoidPatterns: [
      "Generic team-ranking arguments",
      "Patch reaction takes with no strategic mechanism",
      "Topics with no game system, role, format, or meta shift",
    ],
    requiredAngles: [
      "A concrete competitive mechanic, roster design, or tournament structure",
      "A trade-off involving consistency, ceiling, adaptability, or strategic information",
    ],
    sampleTopicShapes: [
      "Do frequent balance patches improve competitive depth more than they weaken long-horizon strategic preparation?",
      "Should top teams prioritize role flexibility over specialist mastery in title X's current meta?",
      "Are double-elimination formats improving true-skill identification enough to justify schedule and broadcast complexity?",
    ],
  },
  media: {
    focusAreas: [
      "Platform incentives, newsroom economics, and information-quality trade-offs",
      "Misinformation response, trust, moderation, and audience fragmentation",
      "Local-news collapse, creator media, and institutional legitimacy",
      "Metrics and business models that distort editorial decisions",
    ],
    avoidPatterns: [
      "Generic prompts about whether media is biased",
      "Culture-war framings with no platform, incentive, or newsroom mechanism",
      "Topics with no audience model, distribution channel, or editorial trade-off",
    ],
    requiredAngles: [
      "A specific media incentive, platform design, editorial process, or trust mechanism",
      "A trade-off involving reach, quality, independence, revenue, or legitimacy",
    ],
    sampleTopicShapes: [
      "Do engagement-maximizing platform feeds degrade information quality more than publisher-side incentives do?",
      "Should local-news support prioritize direct subsidies over nonprofit conversion and philanthropy models?",
      "Are synthetic-media labels likely to improve trust more than they create false confidence in unlabeled content?",
    ],
  },
  entertainment: {
    focusAreas: [
      "Streaming economics, windowing, franchise strategy, and audience discovery",
      "Creator incentives, labor structures, and platform dependence",
      "Cultural trend formation, recommendation systems, and hit dynamics",
      "Trade-offs between artistic risk and portfolio management",
    ],
    avoidPatterns: [
      "Taste questions about whether a work is good",
      "Generic prompts about the death of movies or TV",
      "Topics with no distribution model, audience segment, labor issue, or financing mechanism",
    ],
    requiredAngles: [
      "A concrete business model, release strategy, recommendation dynamic, or labor arrangement",
      "A trade-off involving reach, quality, risk concentration, creator autonomy, or monetization",
    ],
    sampleTopicShapes: [
      "Do streaming recommendation systems reduce cultural breakout hits more than they improve long-tail monetization?",
      "Should studios restore longer theatrical windows even if short-term streaming subscriber gains fall?",
      "Are franchise-heavy slates rational risk management, or are they now materially suppressing portfolio returns?",
    ],
  },
  agriculture: {
    focusAreas: [
      "Crop genetics, inputs, soil health, irrigation, and farm-economics trade-offs",
      "Precision agriculture, automation, and adoption constraints",
      "Food security, supply volatility, and climate adaptation in farming systems",
      "Policy choices around subsidies, land use, and resilience",
    ],
    avoidPatterns: [
      "Generic prompts about sustainable farming",
      "Tech optimism with no yield, soil, water, or cost metric",
      "Topics with no crop, region, input, or farm-management mechanism",
    ],
    requiredAngles: [
      "A specific crop system, input strategy, technology, or policy rule",
      "A trade-off involving yield, resilience, water, soil quality, labor, or cost",
    ],
    sampleTopicShapes: [
      "Should subsidy reform reward soil-carbon practices even when near-term yield variance increases?",
      "Will precision-application tools improve fertilizer efficiency enough to outweigh their adoption and data-fragmentation costs?",
      "Are drought-resilient crop genetics underused because irrigation policy still weakens adaptation incentives?",
    ],
  },
  "urban-planning": {
    focusAreas: [
      "Zoning, transit, housing supply, congestion, and public-space design",
      "Infrastructure sequencing, land-value capture, and local political constraints",
      "Trade-offs between density, affordability, resilience, and neighborhood preservation",
      "Measurement disputes around induced demand, safety, and mobility access",
    ],
    avoidPatterns: [
      "Generic prompts about cities being too expensive",
      "Planning ideology without a project, rule, or financing mechanism",
      "Topics with no land-use policy, transit mode, or built-environment intervention",
    ],
    requiredAngles: [
      "A specific zoning rule, transport investment, financing tool, or urban design choice",
      "A trade-off involving affordability, speed, safety, emissions, or political feasibility",
    ],
    sampleTopicShapes: [
      "Should cities prioritize bus-network redesign over rail expansion when near-term housing growth is the main constraint?",
      "Are parking-minimum reforms increasing housing affordability enough to justify neighborhood backlash and spillover concerns?",
      "Does upzoning near transit improve mode shift more than it accelerates local displacement?",
    ],
  },
  "environmental-science": {
    focusAreas: [
      "Biodiversity, ecosystem restoration, pollution, and conservation design",
      "Measurement disputes in ecological health and remediation success",
      "Trade-offs among land use, species protection, and human development",
      "Interventions where local context strongly changes outcomes",
    ],
    avoidPatterns: [
      "Generic prompts about saving the planet",
      "Pure advocacy with no ecosystem, pollutant, or intervention mechanism",
      "Topics with no habitat, contaminant, species, or restoration criterion",
    ],
    requiredAngles: [
      "A concrete ecosystem, conservation tool, pollution-control strategy, or measurement standard",
      "A trade-off involving biodiversity, human use, cost, or reversibility",
    ],
    sampleTopicShapes: [
      "Should conservation funding favor habitat connectivity over single-species recovery plans in fragmented regions?",
      "Are current biodiversity-offset schemes restoring ecosystems, or mainly legitimizing additional habitat loss?",
      "Do PFAS remediation priorities focus too heavily on known hotspots at the expense of diffuse chronic exposure?",
    ],
  },
  "tech-policy": {
    focusAreas: [
      "Platform liability, antitrust remedies, interoperability mandates, and data portability",
      "Privacy rules, data brokerage, identity systems, and surveillance limits",
      "App-store control, cloud concentration, and infrastructure gatekeeping",
      "Age assurance, content moderation governance, and online safety regulation",
      "Trade-offs between competition, innovation speed, privacy, and enforcement complexity",
    ],
    avoidPatterns: [
      "Generic prompts about whether Big Tech has too much power",
      "Culture-war framing with no concrete statute, rule, or institutional lever",
      "Broad privacy questions with no data flow or enforcement mechanism",
    ],
    requiredAngles: [
      "A concrete rule, remedy, compliance obligation, or gatekeeping point",
      "A trade-off involving competition, privacy, security, innovation, or speech",
    ],
    sampleTopicShapes: [
      "Would interoperability mandates weaken platform lock-in more than they increase security and privacy attack surfaces?",
      "Should data brokers face fiduciary-style duties rather than disclosure-based compliance alone?",
      "Are app-store antitrust remedies more likely to increase user choice than to shift market power to new gatekeepers?",
    ],
  },
  "ai-ethics": {
    focusAreas: [
      "Fairness metrics, subgroup trade-offs, and allocation harms in deployed systems",
      "Transparency requirements, explanation quality, and contestability mechanisms",
      "Human oversight, accountability gaps, and responsibility diffusion in automated decisions",
      "Consent, data provenance, labor extraction, and model training legitimacy",
      "Normative conflicts between utility, fairness, autonomy, and due process",
    ],
    avoidPatterns: [
      "Generic prompts about whether AI should be ethical",
      "Abstract fairness debates with no deployment context or metric",
      "Moral posturing unconnected to a real system, institution, or remedy",
    ],
    requiredAngles: [
      "A concrete decision system, fairness notion, accountability mechanism, or affected population",
      "A trade-off involving accuracy, equity, transparency, autonomy, or redress",
    ],
    sampleTopicShapes: [
      "Should high-stakes AI systems be required to support human-contestable explanations even when accuracy drops?",
      "Are parity-based fairness metrics causing more hidden harm than calibrated risk estimates in real allocation systems?",
      "Should training on public user data require opt-out rights even when the aggregate social utility case is strong?",
    ],
  },
  "nuclear-strategy": {
    focusAreas: [
      "Deterrence credibility, escalation control, and force-posture design",
      "Arms control, counterforce vulnerability, and command-and-control resilience",
      "Extended deterrence and alliance assurance under new technologies",
      "Trade-offs between signaling clarity and crisis instability",
    ],
    avoidPatterns: [
      "Generic prompts about whether nuclear weapons are bad",
      "Cold War nostalgia with no modern force or escalation mechanism",
      "Topics with no doctrine, posture, signaling choice, or alliance condition",
    ],
    requiredAngles: [
      "A specific doctrine, force structure, treaty choice, or crisis mechanism",
      "A trade-off involving deterrence, survivability, assurance, ambiguity, or instability",
    ],
    sampleTopicShapes: [
      "Do low-yield nuclear options strengthen deterrence more than they increase escalation risk?",
      "Should arms-control design prioritize verification simplicity over broader warhead-count coverage?",
      "Are current warning-and-assessment postures too brittle for an era of faster dual-use strike systems?",
    ],
  },
  "business-strategy": {
    focusAreas: [
      "Competitive advantage, market structure, pricing power, and capability moats",
      "Build-versus-buy, vertical integration, and platform control",
      "Organizational design, capital allocation, and sequencing decisions",
      "Trade-offs between growth, margin, resilience, and strategic focus",
    ],
    avoidPatterns: [
      "Generic prompts about whether a company should innovate more",
      "Business-book slogans with no market or capability mechanism",
      "Topics with no customer segment, moat, cost structure, or strategic move",
    ],
    requiredAngles: [
      "A concrete strategic choice, market structure feature, or operating model",
      "A trade-off involving growth, margin, optionality, resilience, or defensibility",
    ],
    sampleTopicShapes: [
      "Does vertical integration create a stronger moat than ecosystem openness in market X once capital intensity is counted?",
      "Should mature software firms prioritize product bundling over best-of-breed specialization to defend distribution?",
      "Are companies overusing platform strategies where focused category leadership would produce higher returns?",
    ],
  },
  startups: {
    focusAreas: [
      "Product-market fit, founder-market alignment, and go-to-market sequencing",
      "Fundraising, burn, hiring, and control trade-offs at different stages",
      "Distribution, pricing, and moat formation in early markets",
      "Where startup advice diverges from what actually works in specific market conditions",
    ],
    avoidPatterns: [
      "Generic prompts about hustle, culture, or founder traits",
      "Venture clichés with no market, product, or financing mechanism",
      "Topics with no stage, customer segment, or company-building trade-off",
    ],
    requiredAngles: [
      "A specific startup-stage decision, go-to-market strategy, or financing choice",
      "A trade-off involving speed, dilution, control, learning, or defensibility",
    ],
    sampleTopicShapes: [
      "Should seed-stage startups optimize for rapid distribution experiments over product depth once runway is constrained?",
      "Are founder-led sales motions staying useful for too long in B2B startups and delaying scalable GTM design?",
      "Does raising larger pre-seed rounds improve survival more than it weakens strategic discipline?",
    ],
  },
  "supply-chains": {
    focusAreas: [
      "Single-source dependencies, geographic concentration, and inventory strategy",
      "Friendshoring, reshoring, and resilience versus cost efficiency",
      "Semiconductor, pharmaceutical, energy, and critical-mineral bottlenecks",
      "Demand forecasting failures, bullwhip effects, and real-time visibility systems",
      "Procurement design, contracting, and stress-test practices for strategic sectors",
    ],
    avoidPatterns: [
      "Generic prompts about globalization versus localization",
      "Broad resilience questions without a specific bottleneck or intervention",
      "Topics with no named node, input, contract structure, or failure mode",
    ],
    requiredAngles: [
      "A concrete supply node, sourcing strategy, inventory rule, or contracting mechanism",
      "A trade-off involving cost, resilience, speed, concentration, or geopolitical exposure",
    ],
    sampleTopicShapes: [
      "Do reshoring subsidies improve critical-supply resilience enough to justify persistent cost penalties?",
      "Should firms in strategic sectors be required to maintain minimum buffer inventories rather than just supplier diversification plans?",
      "Are digital supply-chain visibility tools reducing disruption risk, or mainly making firms overconfident in brittle networks?",
    ],
  },
  demographics: {
    focusAreas: [
      "Fertility, migration, aging, household formation, and labor-force participation",
      "Regional population change and its effects on housing, welfare systems, and productivity",
      "Measurement disputes in demographic forecasting and cohort analysis",
      "Policies whose effects depend on age structure or migration composition",
    ],
    avoidPatterns: [
      "Generic prompts about overpopulation or underpopulation",
      "Cultural panic with no cohort, migration flow, or institutional consequence",
      "Topics with no demographic variable, population segment, or policy lever",
    ],
    requiredAngles: [
      "A specific demographic trend, forecasting issue, or policy response",
      "A trade-off involving growth, dependency ratios, cohesion, housing, or fiscal burden",
    ],
    sampleTopicShapes: [
      "Should aging societies prioritize labor-force participation reforms over pronatalist subsidy expansion?",
      "Are current migration targets calibrated too heavily to near-term labor shortages and too weakly to housing absorption?",
      "Do fertility-decline forecasts understate the political effects of shrinking younger cohorts on public spending choices?",
    ],
  },
  "military-strategy": {
    focusAreas: [
      "Force posture, attrition tolerance, logistics depth, and mobilization capacity",
      "Autonomy, drones, precision strike, and countermeasure adaptation",
      "Deterrence credibility, escalation control, and alliance burden sharing",
      "Procurement reform, readiness metrics, and reserve-force design",
      "Trade-offs between mass, survivability, speed, and command complexity",
    ],
    avoidPatterns: [
      "Generic prompts about whether a country should be stronger militarily",
      "Tactical hot takes with no doctrine, resource constraint, or theater condition",
      "War-gaming theater outcomes without a named operational mechanism",
    ],
    requiredAngles: [
      "A concrete doctrine, procurement choice, force mix, or escalation mechanism",
      "A trade-off involving deterrence, readiness, survivability, cost, or alliance cohesion",
    ],
    sampleTopicShapes: [
      "Will cheap autonomous strike systems reduce the value of traditional force mass more than current doctrine assumes?",
      "Should reserve-force readiness targets be prioritized over additional procurement in prolonged attritional conflict scenarios?",
      "Do distributed logistics concepts materially improve survivability, or mostly add operational fragility at scale?",
    ],
  },
};

export function getDomainBackfillGuide(domain: DomainDescriptor): DomainBackfillGuide {
  return DOMAIN_BACKFILL_GUIDES[domain.slug] ?? DEFAULT_GUIDE;
}
