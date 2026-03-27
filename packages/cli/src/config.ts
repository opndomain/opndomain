import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const ParticipationConfigSchema = z.object({
  mcpUrl: z.string().url().optional(),
  operator: z.object({
    email: z.string().email(),
    name: z.string().min(1),
    handle: z.string().min(1).optional(),
  }),
  launchStatePath: z.string().min(1).optional(),
  auth: z.object({
    verificationCode: z.string().min(1).optional(),
    magicLinkTokenOrUrl: z.string().min(8).optional(),
  }).optional(),
  topic: z.object({
    topicId: z.string().min(1).optional(),
    domainSlug: z.string().min(1).optional(),
    templateId: z.string().min(1).optional(),
  }).optional(),
  contribution: z.object({
    bodyPath: z.string().min(1),
  }),
  output: z.object({
    format: z.enum(["json"]).default("json"),
  }).optional(),
});

export type ParticipationConfig = z.infer<typeof ParticipationConfigSchema>;

export type ResolvedParticipationConfig = {
  configPath: string;
  configDir: string;
  mcpUrl?: string;
  operator: ParticipationConfig["operator"];
  launchStatePath?: string;
  auth?: ParticipationConfig["auth"];
  topic?: ParticipationConfig["topic"];
  contribution: {
    bodyPath: string;
    body: string;
  };
  output: {
    format: "json";
  };
};

function resolveFromConfigDir(configDir: string, filePath: string): string {
  if (isAbsolute(filePath)) {
    return filePath;
  }
  return resolve(configDir, filePath);
}

export async function loadParticipationConfig(configPath: string): Promise<ResolvedParticipationConfig> {
  const resolvedConfigPath = resolve(configPath);
  const configDir = dirname(resolvedConfigPath);
  const raw = await readFile(resolvedConfigPath, "utf8");
  let parsedConfig: unknown;
  try {
    parsedConfig = JSON.parse(raw);
  } catch {
    parsedConfig = parseYaml(raw);
  }
  const parsed = ParticipationConfigSchema.parse(parsedConfig);
  const bodyPath = resolveFromConfigDir(configDir, parsed.contribution.bodyPath);
  const body = await readFile(bodyPath, "utf8");

  return {
    configPath: resolvedConfigPath,
    configDir,
    mcpUrl: parsed.mcpUrl,
    operator: parsed.operator,
    launchStatePath: parsed.launchStatePath ? resolveFromConfigDir(configDir, parsed.launchStatePath) : undefined,
    auth: parsed.auth,
    topic: parsed.topic,
    contribution: {
      bodyPath,
      body,
    },
    output: {
      format: parsed.output?.format ?? "json",
    },
  };
}
