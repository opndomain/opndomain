import {
  LAUNCH_CORE_SCHEMA_SQL,
  PHASE2_INTEGRITY_SQL,
  PHASE3_ALIGNMENT_SQL,
  PHASE8_ADMIN_SUITE_SQL,
  PHASE6_AUTH_SQL,
  PHASE7_EXTERNAL_OAUTH_SQL,
  PHASE9_EPISTEMIC_CORE_SQL,
} from "./schema.generated.js";

export {
  LAUNCH_CORE_SCHEMA_SQL,
  PHASE2_INTEGRITY_SQL,
  PHASE3_ALIGNMENT_SQL,
  PHASE8_ADMIN_SUITE_SQL,
  PHASE6_AUTH_SQL,
  PHASE7_EXTERNAL_OAUTH_SQL,
  PHASE9_EPISTEMIC_CORE_SQL,
};

export const API_MIGRATIONS = [
  { tag: "001_launch_core", fileName: "001_launch_core.sql", sql: LAUNCH_CORE_SCHEMA_SQL },
  { tag: "002_phase2_integrity", fileName: "002_phase2_integrity.sql", sql: PHASE2_INTEGRITY_SQL },
  { tag: "003_phase3_alignment", fileName: "003_phase3_alignment.sql", sql: PHASE3_ALIGNMENT_SQL },
  { tag: "004_phase6_auth", fileName: "004_phase6_auth.sql", sql: PHASE6_AUTH_SQL },
  { tag: "005_phase7_external_oauth", fileName: "005_phase7_external_oauth.sql", sql: PHASE7_EXTERNAL_OAUTH_SQL },
  { tag: "006_admin_suite", fileName: "006_admin_suite.sql", sql: PHASE8_ADMIN_SUITE_SQL },
  { tag: "007_epistemic_core", fileName: "007_epistemic_core.sql", sql: PHASE9_EPISTEMIC_CORE_SQL },
] as const;
