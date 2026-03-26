const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const HIDDEN_UNICODE_PATTERN = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180D\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFE00-\uFE0F\uFEFF]/g;
const CODE_FENCE_PATTERN = /```[\s\S]*?```/g;
const ROLE_MARKUP_PATTERN = /<\/?\s*(system|assistant|user|developer|instructions)\s*>/gi;
const WRAPPER_MARKUP_PATTERN = /<\/?\s*(prompt|transcript|context|messages?|wrapper)\b[^>]*>/gi;
const ROLE_PREFIX_PATTERN = /^\s*(system|assistant|user|developer|instructions)\s*:/gim;
const PROMPT_WRAPPER_PATTERN = /\b(begin|start|end)\s+(prompt|system prompt|instructions|transcript|context)\b/gi;
const TOOL_CALL_PATTERN = /\b(function_call|tool_call)\s*:/gi;
const BRACKET_ROLE_PATTERN = /\[(system|assistant|user|developer|instructions)\]/gi;
const BRACKET_WRAPPER_PATTERN = /\{\{(system|assistant|user|developer|instructions|prompt|transcript|context|wrapper)\}\}/gi;
const MULTI_SPACE_PATTERN = /[ \t]{2,}/g;
const MULTI_NEWLINE_PATTERN = /\n{3,}/g;

export type SanitizationResult = {
  bodyClean: string;
  transforms: string[];
};

function applyTransform(
  value: string,
  pattern: RegExp,
  replacement: string | ((substring: string, ...args: string[]) => string),
  name: string,
  transforms: string[],
) {
  const nextValue = value.replace(pattern, replacement as never);
  if (nextValue !== value) {
    transforms.push(name);
  }
  return nextValue;
}

export function sanitizeContributionBody(body: string): SanitizationResult {
  const transforms: string[] = [];
  let sanitized = body.normalize("NFKC");

  sanitized = applyTransform(sanitized, CONTROL_CHAR_PATTERN, " ", "control_chars_to_space", transforms);
  sanitized = applyTransform(sanitized, HIDDEN_UNICODE_PATTERN, "", "hidden_unicode_removed", transforms);
  sanitized = applyTransform(sanitized, CODE_FENCE_PATTERN, "[quoted block]", "code_fences_quoted", transforms);
  sanitized = applyTransform(sanitized, ROLE_MARKUP_PATTERN, "[quoted role marker]", "role_markup_quoted", transforms);
  sanitized = applyTransform(sanitized, WRAPPER_MARKUP_PATTERN, "[quoted wrapper]", "wrapper_markup_quoted", transforms);
  sanitized = applyTransform(
    sanitized,
    ROLE_PREFIX_PATTERN,
    (_substring, role: string) => `quoted-${role.toLowerCase()}:`,
    "role_prefixes_quoted",
    transforms,
  );
  sanitized = applyTransform(sanitized, PROMPT_WRAPPER_PATTERN, "quoted prompt wrapper", "prompt_wrappers_quoted", transforms);
  sanitized = applyTransform(
    sanitized,
    TOOL_CALL_PATTERN,
    (_substring, callType: string) => `quoted_${callType.toLowerCase()}:`,
    "tool_calls_quoted",
    transforms,
  );
  sanitized = applyTransform(sanitized, BRACKET_ROLE_PATTERN, "[quoted role]", "bracket_roles_quoted", transforms);
  sanitized = applyTransform(sanitized, BRACKET_WRAPPER_PATTERN, "[quoted wrapper]", "bracket_wrappers_quoted", transforms);

  sanitized = sanitized
    .replace(/\r\n/g, "\n")
    .replace(MULTI_NEWLINE_PATTERN, "\n\n")
    .replace(MULTI_SPACE_PATTERN, " ")
    .trim();

  if (sanitized.length === 0) {
    transforms.push("empty_fallback");
    sanitized = "[empty]";
  }

  return {
    bodyClean: sanitized,
    transforms,
  };
}
