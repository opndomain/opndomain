import { z } from "zod";

export const ParsedFinalArgumentSchema = z.object({
  mapPosition: z.number().int().nullable(),
  myThesis: z.string().min(1),
  whyIHoldIt: z.string().min(1),
  strongestObjection: z.string().min(1),
  changeMyMindStatus: z.string().min(1),
  whatSettled: z.string().min(1),
  whatContested: z.string().min(1),
  neutralVerdict: z.string().min(1),
  kicker: z.string().min(1),
});

export type ParsedFinalArgument = z.infer<typeof ParsedFinalArgumentSchema>;

const LABELS = {
  mapPosition: ["MAP_POSITION"],
  myThesis: ["MY THESIS"],
  whyIHoldIt: ["WHY I HOLD IT"],
  strongestObjection: [
    "STRONGEST OBJECTION I CAN'T FULLY ANSWER",
    "STRONGEST OBJECTION I CANNOT FULLY ANSWER",
  ],
  changeMyMindStatus: ["CHANGE-MY-MIND STATUS"],
  whatSettled: ["WHAT THIS DEBATE SETTLED"],
  whatContested: ["WHAT REMAINS CONTESTED"],
  neutralVerdict: ["NEUTRAL VERDICT"],
  kicker: ["KICKER"],
  partA: ["PART A[\\s—-]*MY POSITION"],
  partB: ["PART B[\\s—-]*IMPARTIAL SYNTHESIS"],
} as const;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labelPattern(labels: readonly string[]): string {
  return labels
    .map((label) => label.includes("[") || label.includes("\\") ? label : escapeRegex(label))
    .join("|");
}

function extractSection(
  body: string,
  labels: readonly string[],
  nextLabels: readonly string[],
): string | null {
  const current = labelPattern(labels);
  const lookaheads = [
    ...(nextLabels.length > 0 ? [`\\n\\s*(?:${labelPattern(nextLabels)})\\s*:`] : []),
    `\\n\\s*(?:${LABELS.partA[0]}|${LABELS.partB[0]})\\s*`,
    "$",
  ];
  const match = new RegExp(
    `(?:^|\\n)\\s*(?:${current})\\s*:\\s*([\\s\\S]*?)(?=${lookaheads.join("|")})`,
    "i",
  ).exec(body);
  const value = match?.[1]?.trim() ?? "";
  return value.length > 0 ? value : null;
}

export function parseFinalArgument(body: string): ParsedFinalArgument | null {
  const myThesis = extractSection(body, LABELS.myThesis, [
    ...LABELS.whyIHoldIt,
    ...LABELS.strongestObjection,
    ...LABELS.changeMyMindStatus,
    ...LABELS.whatSettled,
    ...LABELS.whatContested,
    ...LABELS.neutralVerdict,
    ...LABELS.kicker,
  ]);
  const whyIHoldIt = extractSection(body, LABELS.whyIHoldIt, [
    ...LABELS.strongestObjection,
    ...LABELS.changeMyMindStatus,
    ...LABELS.whatSettled,
    ...LABELS.whatContested,
    ...LABELS.neutralVerdict,
    ...LABELS.kicker,
  ]);
  const strongestObjection = extractSection(body, LABELS.strongestObjection, [
    ...LABELS.changeMyMindStatus,
    ...LABELS.whatSettled,
    ...LABELS.whatContested,
    ...LABELS.neutralVerdict,
    ...LABELS.kicker,
  ]);
  const changeMyMindStatus = extractSection(body, LABELS.changeMyMindStatus, [
    ...LABELS.whatSettled,
    ...LABELS.whatContested,
    ...LABELS.neutralVerdict,
    ...LABELS.kicker,
  ]);
  const whatSettled = extractSection(body, LABELS.whatSettled, [
    ...LABELS.whatContested,
    ...LABELS.neutralVerdict,
    ...LABELS.kicker,
  ]);
  const whatContested = extractSection(body, LABELS.whatContested, [
    ...LABELS.neutralVerdict,
    ...LABELS.kicker,
  ]);
  const neutralVerdict = extractSection(body, LABELS.neutralVerdict, LABELS.kicker);
  const kicker = extractSection(body, LABELS.kicker, []);

  if (!myThesis || !whyIHoldIt || !strongestObjection || !changeMyMindStatus || !whatSettled || !whatContested || !neutralVerdict || !kicker) {
    return null;
  }

  const mapPositionMatch = /(?:^|\n)\s*MAP_POSITION\s*:\s*(-?\d+)\s*(?=\n|$)/i.exec(body);
  const parsed = ParsedFinalArgumentSchema.safeParse({
    mapPosition: mapPositionMatch ? Number.parseInt(mapPositionMatch[1] ?? "", 10) : null,
    myThesis,
    whyIHoldIt,
    strongestObjection,
    changeMyMindStatus,
    whatSettled,
    whatContested,
    neutralVerdict,
    kicker,
  });

  return parsed.success ? parsed.data : null;
}
