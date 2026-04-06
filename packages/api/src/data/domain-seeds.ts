type DomainSeed = {
  id: string;
  slug: string;
  name: string;
  description: string;
  parentId?: string;
};

// --- Parent domains (13 groups) ---
const PARENT_AI = "dom_ai-machine-intelligence";
const PARENT_COMPUTING = "dom_computing-software";
const PARENT_MATH = "dom_math-statistics";
const PARENT_PHYSICAL = "dom_physical-sciences";
const PARENT_EARTH = "dom_earth-environment";
const PARENT_LIFE = "dom_life-sciences-medicine";
const PARENT_ECON = "dom_economics-finance";
const PARENT_GOV = "dom_governance-security";
const PARENT_SOCIAL = "dom_social-behavioral-science";
const PARENT_PHIL = "dom_philosophy-epistemics";
const PARENT_BIZ = "dom_biz-strategy";
const PARENT_SPORTS = "dom_sports-competition";
const PARENT_MEDIA = "dom_media-culture";

export const DOMAIN_SEEDS: DomainSeed[] = [
  // ===== Parent domains (no parentId — they are roots) =====
  {
    id: PARENT_AI,
    slug: "ai-machine-intelligence",
    name: "AI & Machine Intelligence",
    description:
      "Alignment, capabilities, ethics, and autonomous systems research.",
  },
  {
    id: PARENT_COMPUTING,
    slug: "computing-software",
    name: "Computing & Software",
    description:
      "Computer science foundations, engineering practices, security, and technology governance.",
  },
  {
    id: PARENT_MATH,
    slug: "math-statistics",
    name: "Mathematics & Statistics",
    description:
      "Pure and applied mathematics, statistical methods, and strategic interaction.",
  },
  {
    id: PARENT_PHYSICAL,
    slug: "physical-sciences",
    name: "Physical Sciences",
    description:
      "Physics, chemistry, energy systems, and space exploration.",
  },
  {
    id: PARENT_EARTH,
    slug: "earth-environment",
    name: "Earth & Environment",
    description:
      "Climate, ecology, conservation, and agricultural systems.",
  },
  {
    id: PARENT_LIFE,
    slug: "life-sciences-medicine",
    name: "Life Sciences & Medicine",
    description:
      "Biology, neuroscience, clinical research, biosecurity, and biotechnology.",
  },
  {
    id: PARENT_ECON,
    slug: "economics-finance",
    name: "Economics & Finance",
    description:
      "Economic theory, financial markets, digital assets, and supply chain systems.",
  },
  {
    id: PARENT_GOV,
    slug: "governance-security",
    name: "Governance & Security",
    description:
      "Institutions, law, geopolitics, defense strategy, and urban systems.",
  },
  {
    id: PARENT_SOCIAL,
    slug: "social-behavioral-science",
    name: "Social & Behavioral Science",
    description:
      "Psychology, sociology, demographics, education, and language.",
  },
  {
    id: PARENT_PHIL,
    slug: "philosophy-epistemics",
    name: "Philosophy & Epistemics",
    description:
      "Ethics, epistemology, forecasting, decision-making, and risk.",
  },
  {
    id: PARENT_BIZ,
    slug: "biz-strategy",
    name: "Business & Strategy",
    description:
      "Competitive analysis, venture formation, and strategic planning.",
  },
  {
    id: PARENT_SPORTS,
    slug: "sports-competition",
    name: "Sports & Competition",
    description:
      "Athletics, fantasy sports, esports, and competitive analysis.",
  },
  {
    id: PARENT_MEDIA,
    slug: "media-culture",
    name: "Media & Culture",
    description:
      "Journalism, entertainment, cultural trends, and historical analysis.",
  },

  // ===== Subdomains (48 children) =====

  // --- AI & Machine Intelligence ---
  {
    id: "dom_ai-safety",
    slug: "ai-safety",
    name: "AI Safety",
    description:
      "Alignment, evaluation, oversight, and deployment-risk research topics.",
    parentId: PARENT_AI,
  },
  {
    id: "dom_machine-learning",
    slug: "machine-learning",
    name: "Machine Learning",
    description:
      "Model architectures, training methods, benchmarks, and capability research.",
    parentId: PARENT_AI,
  },
  {
    id: "dom_ai-ethics",
    slug: "ai-ethics",
    name: "AI Ethics",
    description:
      "Fairness, accountability, transparency, and societal impact of AI systems.",
    parentId: PARENT_AI,
  },
  {
    id: "dom_robotics",
    slug: "robotics",
    name: "Robotics",
    description:
      "Autonomous systems, manipulation, perception, and human-robot interaction.",
    parentId: PARENT_AI,
  },

  // --- Computing & Software ---
  {
    id: "dom_computer-science",
    slug: "computer-science",
    name: "Computer Science",
    description:
      "Algorithms, data structures, complexity theory, and systems design.",
    parentId: PARENT_COMPUTING,
  },
  {
    id: "dom_software-engineering",
    slug: "software-engineering",
    name: "Software Engineering",
    description:
      "Architecture, development practices, reliability, and systems at scale.",
    parentId: PARENT_COMPUTING,
  },
  {
    id: "dom_cybersecurity",
    slug: "cybersecurity",
    name: "Cybersecurity",
    description:
      "Threat analysis, defense strategies, vulnerability research, and information security.",
    parentId: PARENT_COMPUTING,
  },
  {
    id: "dom_tech-policy",
    slug: "tech-policy",
    name: "Tech Policy",
    description:
      "Platform regulation, antitrust, data privacy, and technology governance.",
    parentId: PARENT_COMPUTING,
  },

  // --- Mathematics & Statistics ---
  {
    id: "dom_mathematics",
    slug: "mathematics",
    name: "Mathematics",
    description:
      "Pure and applied mathematics, proofs, conjectures, and formal systems.",
    parentId: PARENT_MATH,
  },
  {
    id: "dom_statistics",
    slug: "statistics",
    name: "Statistics",
    description:
      "Statistical methods, Bayesian inference, causal inference, and experimental design.",
    parentId: PARENT_MATH,
  },
  {
    id: "dom_game-theory",
    slug: "game-theory",
    name: "Game Theory",
    description:
      "Strategic interaction, mechanism design, auction theory, and equilibrium analysis.",
    parentId: PARENT_MATH,
  },

  // --- Physical Sciences ---
  {
    id: "dom_physics",
    slug: "physics",
    name: "Physics",
    description:
      "Theoretical and experimental physics, cosmology, and fundamental forces.",
    parentId: PARENT_PHYSICAL,
  },
  {
    id: "dom_chemistry",
    slug: "chemistry",
    name: "Chemistry",
    description:
      "Organic, inorganic, and physical chemistry, materials science, and synthesis.",
    parentId: PARENT_PHYSICAL,
  },
  {
    id: "dom_energy",
    slug: "energy",
    name: "Energy",
    description:
      "Power generation, grid infrastructure, renewables, nuclear, and energy transitions.",
    parentId: PARENT_PHYSICAL,
  },
  {
    id: "dom_space-exploration",
    slug: "space-exploration",
    name: "Space Exploration",
    description:
      "Spaceflight, planetary science, astrobiology, and space industry analysis.",
    parentId: PARENT_PHYSICAL,
  },

  // --- Earth & Environment ---
  {
    id: "dom_climate-science",
    slug: "climate-science",
    name: "Climate Science",
    description:
      "Climate modeling, emissions trajectories, adaptation strategies, and earth systems.",
    parentId: PARENT_EARTH,
  },
  {
    id: "dom_environmental-science",
    slug: "environmental-science",
    name: "Environmental Science",
    description:
      "Ecology, conservation, biodiversity, and pollution mitigation.",
    parentId: PARENT_EARTH,
  },
  {
    id: "dom_agriculture",
    slug: "agriculture",
    name: "Agriculture",
    description:
      "Food systems, crop science, supply chains, and agricultural technology.",
    parentId: PARENT_EARTH,
  },

  // --- Life Sciences & Medicine ---
  {
    id: "dom_biology",
    slug: "biology",
    name: "Biology",
    description:
      "Molecular biology, genetics, evolution, and life sciences research.",
    parentId: PARENT_LIFE,
  },
  {
    id: "dom_neuroscience",
    slug: "neuroscience",
    name: "Neuroscience",
    description:
      "Brain function, cognition, consciousness, and neural computation.",
    parentId: PARENT_LIFE,
  },
  {
    id: "dom_medicine",
    slug: "medicine",
    name: "Medicine",
    description:
      "Clinical research, drug development, epidemiology, and public health interventions.",
    parentId: PARENT_LIFE,
  },
  {
    id: "dom_biosecurity",
    slug: "biosecurity",
    name: "Biosecurity",
    description:
      "Preparedness, dual-use risk, and intervention analysis for biological threats.",
    parentId: PARENT_LIFE,
  },
  {
    id: "dom_biotechnology",
    slug: "biotechnology",
    name: "Biotechnology",
    description:
      "Gene editing, synthetic biology, biomanufacturing, and bioethics.",
    parentId: PARENT_LIFE,
  },

  // --- Economics & Finance ---
  {
    id: "dom_economics",
    slug: "economics",
    name: "Economics",
    description:
      "Macro and microeconomic theory, monetary policy, labor markets, and trade.",
    parentId: PARENT_ECON,
  },
  {
    id: "dom_finance",
    slug: "finance",
    name: "Finance",
    description:
      "Markets, asset pricing, risk management, banking, and financial regulation.",
    parentId: PARENT_ECON,
  },
  {
    id: "dom_cryptocurrency",
    slug: "cryptocurrency",
    name: "Cryptocurrency",
    description:
      "Blockchain protocols, tokenomics, DeFi, and decentralized governance.",
    parentId: PARENT_ECON,
  },
  {
    id: "dom_supply-chains",
    slug: "supply-chains",
    name: "Supply Chains",
    description:
      "Logistics, global trade networks, resilience, and manufacturing.",
    parentId: PARENT_ECON,
  },

  // --- Governance & Security ---
  {
    id: "dom_governance",
    slug: "governance",
    name: "Governance",
    description:
      "Institutions, coordination mechanisms, and policy design for high-stakes systems.",
    parentId: PARENT_GOV,
  },
  {
    id: "dom_politics",
    slug: "politics",
    name: "Politics",
    description:
      "Domestic policy, elections, political institutions, and legislative analysis.",
    parentId: PARENT_GOV,
  },
  {
    id: "dom_law",
    slug: "law",
    name: "Law",
    description:
      "Legal theory, constitutional analysis, regulatory frameworks, and jurisprudence.",
    parentId: PARENT_GOV,
  },
  {
    id: "dom_geopolitics",
    slug: "geopolitics",
    name: "Geopolitics",
    description:
      "International relations, great power competition, alliances, and conflict analysis.",
    parentId: PARENT_GOV,
  },
  {
    id: "dom_nuclear-strategy",
    slug: "nuclear-strategy",
    name: "Nuclear Strategy",
    description:
      "Deterrence theory, arms control, proliferation, and nuclear security.",
    parentId: PARENT_GOV,
  },
  {
    id: "dom_military-strategy",
    slug: "military-strategy",
    name: "Military Strategy",
    description:
      "Doctrine, operational analysis, defense technology, and war studies.",
    parentId: PARENT_GOV,
  },
  {
    id: "dom_urban-planning",
    slug: "urban-planning",
    name: "Urban Planning",
    description:
      "City design, transportation, housing policy, and infrastructure development.",
    parentId: PARENT_GOV,
  },

  // --- Social & Behavioral Science ---
  {
    id: "dom_psychology",
    slug: "psychology",
    name: "Psychology",
    description:
      "Cognitive science, behavioral research, decision-making, and mental health.",
    parentId: PARENT_SOCIAL,
  },
  {
    id: "dom_sociology",
    slug: "sociology",
    name: "Sociology",
    description:
      "Social structures, inequality, institutions, culture, and demographic trends.",
    parentId: PARENT_SOCIAL,
  },
  {
    id: "dom_demographics",
    slug: "demographics",
    name: "Demographics",
    description:
      "Population trends, migration, fertility rates, and societal aging.",
    parentId: PARENT_SOCIAL,
  },
  {
    id: "dom_education",
    slug: "education",
    name: "Education",
    description:
      "Pedagogy, learning science, education policy, and workforce development.",
    parentId: PARENT_SOCIAL,
  },
  {
    id: "dom_linguistics",
    slug: "linguistics",
    name: "Linguistics",
    description:
      "Language structure, semantics, pragmatics, and computational linguistics.",
    parentId: PARENT_SOCIAL,
  },

  // --- Philosophy & Epistemics ---
  {
    id: "dom_philosophy",
    slug: "philosophy",
    name: "Philosophy",
    description:
      "Ethics, epistemology, metaphysics, logic, and philosophy of mind.",
    parentId: PARENT_PHIL,
  },
  {
    id: "dom_forecasting",
    slug: "forecasting",
    name: "Forecasting",
    description:
      "Prediction methodology, calibration, base rates, and superforecasting techniques.",
    parentId: PARENT_PHIL,
  },
  {
    id: "dom_decision-science",
    slug: "decision-science",
    name: "Decision Science",
    description:
      "Rational choice, heuristics, cognitive biases, and decision analysis under uncertainty.",
    parentId: PARENT_PHIL,
  },
  {
    id: "dom_risk-analysis",
    slug: "risk-analysis",
    name: "Risk Analysis",
    description:
      "Existential risk, catastrophic scenarios, tail-risk assessment, and resilience.",
    parentId: PARENT_PHIL,
  },

  // --- Business & Strategy ---
  {
    id: "dom_business-strategy",
    slug: "business-strategy",
    name: "Business Strategy",
    description:
      "Competitive analysis, market dynamics, business models, and strategic planning.",
    parentId: PARENT_BIZ,
  },
  {
    id: "dom_startups",
    slug: "startups",
    name: "Startups",
    description:
      "Venture formation, product-market fit, fundraising, and scaling.",
    parentId: PARENT_BIZ,
  },

  // --- Sports & Competition ---
  {
    id: "dom_sports",
    slug: "sports",
    name: "Sports",
    description:
      "Professional and amateur athletics, performance analysis, and competitive outcomes.",
    parentId: PARENT_SPORTS,
  },
  {
    id: "dom_fantasy-sports",
    slug: "fantasy-sports",
    name: "Fantasy Sports",
    description:
      "Player valuation, roster optimization, matchup analysis, and draft strategy.",
    parentId: PARENT_SPORTS,
  },
  {
    id: "dom_esports",
    slug: "esports",
    name: "Esports",
    description:
      "Competitive gaming, team dynamics, meta-analysis, and tournament predictions.",
    parentId: PARENT_SPORTS,
  },

  // --- Media & Culture ---
  {
    id: "dom_media",
    slug: "media",
    name: "Media",
    description:
      "Journalism, misinformation, media ecosystems, and information integrity.",
    parentId: PARENT_MEDIA,
  },
  {
    id: "dom_entertainment",
    slug: "entertainment",
    name: "Entertainment",
    description:
      "Film, television, music, and cultural trend analysis.",
    parentId: PARENT_MEDIA,
  },
  {
    id: "dom_history",
    slug: "history",
    name: "History",
    description:
      "Historical analysis, counterfactuals, historiography, and lessons from the past.",
    parentId: PARENT_MEDIA,
  },
];
