export const HANDLE_BLOCKED_SUBSTRINGS: readonly string[] = [
  "beaner",
  "bitch",
  "chink",
  "cocksucker",
  "coon",
  "cumslut",
  "cunt",
  "dyke",
  "faggot",
  "fagot",
  "fucker",
  "fucking",
  "kike",
  "motherfucker",
  "motherfucking",
  "nigga",
  "nigger",
  "paki",
  "penis",
  "pussy",
  "queef",
  "raghead",
  "retard",
  "shithead",
  "slut",
  "spic",
  "titties",
  "titty",
  "twat",
  "wetback",
  "whore",
];

export function containsBlockedSubstring(handle: string): boolean {
  const normalized = handle.toLowerCase();
  return HANDLE_BLOCKED_SUBSTRINGS.some((term) => normalized.includes(term));
}
