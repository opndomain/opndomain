ALTER TABLE domains ADD COLUMN parent_domain_id TEXT
  REFERENCES domains(id) ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_domains_parent_domain_id
  ON domains(parent_domain_id);

-- Insert 13 parent domain rows (root containers)
INSERT OR IGNORE INTO domains (id, slug, name, description, status)
VALUES
  ('dom_ai-machine-intelligence', 'ai-machine-intelligence', 'AI & Machine Intelligence', 'Alignment, capabilities, ethics, and autonomous systems research.', 'active'),
  ('dom_computing-software', 'computing-software', 'Computing & Software', 'Computer science foundations, engineering practices, security, and technology governance.', 'active'),
  ('dom_math-statistics', 'math-statistics', 'Mathematics & Statistics', 'Pure and applied mathematics, statistical methods, and strategic interaction.', 'active'),
  ('dom_physical-sciences', 'physical-sciences', 'Physical Sciences', 'Physics, chemistry, energy systems, and space exploration.', 'active'),
  ('dom_earth-environment', 'earth-environment', 'Earth & Environment', 'Climate, ecology, conservation, and agricultural systems.', 'active'),
  ('dom_life-sciences-medicine', 'life-sciences-medicine', 'Life Sciences & Medicine', 'Biology, neuroscience, clinical research, biosecurity, and biotechnology.', 'active'),
  ('dom_economics-finance', 'economics-finance', 'Economics & Finance', 'Economic theory, financial markets, digital assets, and supply chain systems.', 'active'),
  ('dom_governance-security', 'governance-security', 'Governance & Security', 'Institutions, law, geopolitics, defense strategy, and urban systems.', 'active'),
  ('dom_social-behavioral-science', 'social-behavioral-science', 'Social & Behavioral Science', 'Psychology, sociology, demographics, education, and language.', 'active'),
  ('dom_philosophy-epistemics', 'philosophy-epistemics', 'Philosophy & Epistemics', 'Ethics, epistemology, forecasting, decision-making, and risk.', 'active'),
  ('dom_biz-strategy', 'biz-strategy', 'Business & Strategy', 'Competitive analysis, venture formation, and strategic planning.', 'active'),
  ('dom_sports-competition', 'sports-competition', 'Sports & Competition', 'Athletics, fantasy sports, esports, and competitive analysis.', 'active'),
  ('dom_media-culture', 'media-culture', 'Media & Culture', 'Journalism, entertainment, cultural trends, and historical analysis.', 'active');

-- Backfill parent_domain_id on all 48 existing child domains
UPDATE domains SET parent_domain_id = 'dom_ai-machine-intelligence' WHERE id IN ('dom_ai-safety', 'dom_machine-learning', 'dom_ai-ethics', 'dom_robotics') AND parent_domain_id IS NULL;
UPDATE domains SET parent_domain_id = 'dom_computing-software' WHERE id IN ('dom_computer-science', 'dom_software-engineering', 'dom_cybersecurity', 'dom_tech-policy') AND parent_domain_id IS NULL;
UPDATE domains SET parent_domain_id = 'dom_math-statistics' WHERE id IN ('dom_mathematics', 'dom_statistics', 'dom_game-theory') AND parent_domain_id IS NULL;
UPDATE domains SET parent_domain_id = 'dom_physical-sciences' WHERE id IN ('dom_physics', 'dom_chemistry', 'dom_energy', 'dom_space-exploration') AND parent_domain_id IS NULL;
UPDATE domains SET parent_domain_id = 'dom_earth-environment' WHERE id IN ('dom_climate-science', 'dom_environmental-science', 'dom_agriculture') AND parent_domain_id IS NULL;
UPDATE domains SET parent_domain_id = 'dom_life-sciences-medicine' WHERE id IN ('dom_biology', 'dom_neuroscience', 'dom_medicine', 'dom_biosecurity', 'dom_biotechnology') AND parent_domain_id IS NULL;
UPDATE domains SET parent_domain_id = 'dom_economics-finance' WHERE id IN ('dom_economics', 'dom_finance', 'dom_cryptocurrency', 'dom_supply-chains') AND parent_domain_id IS NULL;
UPDATE domains SET parent_domain_id = 'dom_governance-security' WHERE id IN ('dom_governance', 'dom_politics', 'dom_law', 'dom_geopolitics', 'dom_nuclear-strategy', 'dom_military-strategy', 'dom_urban-planning') AND parent_domain_id IS NULL;
UPDATE domains SET parent_domain_id = 'dom_social-behavioral-science' WHERE id IN ('dom_psychology', 'dom_sociology', 'dom_demographics', 'dom_education', 'dom_linguistics') AND parent_domain_id IS NULL;
UPDATE domains SET parent_domain_id = 'dom_philosophy-epistemics' WHERE id IN ('dom_philosophy', 'dom_forecasting', 'dom_decision-science', 'dom_risk-analysis') AND parent_domain_id IS NULL;
UPDATE domains SET parent_domain_id = 'dom_biz-strategy' WHERE id IN ('dom_business-strategy', 'dom_startups') AND parent_domain_id IS NULL;
UPDATE domains SET parent_domain_id = 'dom_sports-competition' WHERE id IN ('dom_sports', 'dom_fantasy-sports', 'dom_esports') AND parent_domain_id IS NULL;
UPDATE domains SET parent_domain_id = 'dom_media-culture' WHERE id IN ('dom_media', 'dom_entertainment', 'dom_history') AND parent_domain_id IS NULL;
