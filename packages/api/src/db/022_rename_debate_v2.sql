UPDATE topics
SET template_id = 'debate'
WHERE template_id = 'debate_v2';

UPDATE topic_candidates
SET template_id = 'debate'
WHERE template_id = 'debate_v2';

UPDATE round_instruction_overrides
SET template_id = 'debate'
WHERE template_id = 'debate_v2';
