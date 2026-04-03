import type { ResolvedParticipationConfig } from "./config.js";

export type LaunchStatus =
  | "awaiting_verification"
  | "authenticated"
  | "launch_ready"
  | "reauth_required"
  | "recovery_required"
  | "awaiting_magic_link";

export type ParticipateStatus =
  | "awaiting_verification"
  | "awaiting_magic_link"
  | "launch_ready"
  | "joined_awaiting_start"
  | "joined_awaiting_round"
  | "topic_not_joinable"
  | "no_joinable_topic"
  | "contributed";

export type LaunchPayload = {
  agentId: string | null;
  clientId: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  mcpUrl: string;
  apiOrigin: string;
  rootDomain: string;
  clientSecret?: string;
};

export type CliState = {
  version: 1;
  status: LaunchStatus | ParticipateStatus;
  email: string | null;
  name: string | null;
  clientId: string | null;
  clientSecret: string | null;
  agentId: string | null;
  beingId?: string | null;
  beingHandle?: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  mcpUrl: string;
  apiOrigin: string | null;
  rootDomain: string | null;
};

export type ToolResponse = {
  status?: LaunchStatus | ParticipateStatus;
  clientId?: string | null;
  agentId?: string | null;
  beingId?: string | null;
  email?: string | null;
  launch?: LaunchPayload | null;
  delivery?: unknown;
  expiresAt?: string | null;
  message?: string | null;
  verification?: {
    expiresAt?: string | null;
    delivery?: unknown;
  };
  nextAction?: {
    tool?: string;
    message?: string;
    input?: Record<string, unknown>;
  } | null;
  clientSecret?: string;
  [key: string]: unknown;
};

type RegisterResponse = {
  clientId: string;
  clientSecret: string;
  agent?: {
    id?: string | null;
  };
  verification?: {
    expiresAt?: string | null;
    delivery?: unknown;
  };
};

export type ToolCaller = <T>(name: string, args: Record<string, unknown>) => Promise<T>;

export type ParticipateDeps = {
  callTool: ToolCaller;
  loadState: () => Promise<CliState | null>;
  saveState: (state: CliState) => Promise<void>;
};

function stateFromLaunchResult(
  result: ToolResponse,
  fallback: { email: string; name: string; clientSecret?: string; mcpUrl: string; beingId?: string | null; beingHandle?: string | null },
): CliState {
  return {
    version: 1,
    status: (result.status as LaunchStatus | undefined) ?? "launch_ready",
    email: result.email ?? fallback.email,
    name: fallback.name,
    clientId: result.launch?.clientId ?? result.clientId ?? null,
    clientSecret: result.launch?.clientSecret ?? result.clientSecret ?? fallback.clientSecret ?? null,
    agentId: result.launch?.agentId ?? result.agentId ?? null,
    beingId: result.beingId ?? fallback.beingId ?? null,
    beingHandle: (result.beingHandle as string | null | undefined) ?? fallback.beingHandle ?? null,
    accessToken: result.launch?.accessToken ?? null,
    refreshToken: result.launch?.refreshToken ?? null,
    expiresAt: result.launch?.expiresAt ?? result.expiresAt ?? null,
    mcpUrl: result.launch?.mcpUrl ?? fallback.mcpUrl,
    apiOrigin: result.launch?.apiOrigin ?? null,
    rootDomain: result.launch?.rootDomain ?? null,
  };
}

function awaitingVerificationPayload(
  state: CliState,
  verification?: RegisterResponse["verification"],
): ToolResponse {
  return {
    status: "awaiting_verification",
    clientId: state.clientId,
    agentId: state.agentId,
    email: state.email,
    expiresAt: verification?.expiresAt ?? state.expiresAt,
    verification: {
      expiresAt: verification?.expiresAt ?? state.expiresAt,
      delivery: verification?.delivery ?? null,
    },
    message: "Email verification is still required before participation can continue.",
  };
}

async function ensureLaunchState(config: ResolvedParticipationConfig, deps: ParticipateDeps): Promise<{ state: CliState | null; result?: ToolResponse }> {
  const email = config.operator.email;
  const name = config.operator.name;
  let state = await deps.loadState();
  let registration: RegisterResponse | null = null;

  if (!state) {
    registration = await deps.callTool<RegisterResponse>("register", { email, name });
    state = {
      version: 1,
      status: "awaiting_verification",
      email,
      name,
      clientId: registration.clientId,
      clientSecret: registration.clientSecret,
      agentId: registration.agent?.id ?? null,
      accessToken: null,
      refreshToken: null,
      expiresAt: registration.verification?.expiresAt ?? null,
      mcpUrl: config.mcpUrl ?? "",
      apiOrigin: null,
      rootDomain: null,
    };
    await deps.saveState(state);
  }

  if (state.status === "awaiting_verification") {
    const verificationCode = config.auth?.verificationCode;
    if (!verificationCode) {
      return { state, result: awaitingVerificationPayload(state, registration?.verification) };
    }

    await deps.callTool("verify-email", {
      clientId: state.clientId,
      email,
      code: verificationCode,
    });
  }

  let launch = await deps.callTool<ToolResponse>("establish-launch-state", {
    clientId: state.clientId,
    email,
    refreshToken: state.refreshToken,
    accessToken: state.accessToken,
    clientSecret: state.clientSecret,
  });

  if ((launch.status === "recovery_required" || launch.status === "reauth_required") && config.auth?.magicLinkTokenOrUrl) {
    launch = await deps.callTool<ToolResponse>("recover-launch-state", {
      email,
      tokenOrUrl: config.auth.magicLinkTokenOrUrl,
    });
  } else if (launch.status === "recovery_required" || launch.status === "reauth_required") {
    const recovery = await deps.callTool<ToolResponse>("request-magic-link", { email });
    return { state, result: recovery };
  }

  const nextState = stateFromLaunchResult(launch, {
    email,
    name,
    clientSecret: state.clientSecret ?? undefined,
    mcpUrl: config.mcpUrl ?? state.mcpUrl,
    beingId: state.beingId ?? null,
    beingHandle: state.beingHandle ?? null,
  });
  await deps.saveState(nextState);

  if (launch.status !== "launch_ready") {
    return { state: nextState, result: launch };
  }

  return { state: nextState };
}

export async function runParticipate(config: ResolvedParticipationConfig, deps: ParticipateDeps): Promise<ToolResponse> {
  const launch = await ensureLaunchState(config, deps);
  if (launch.result) {
    return launch.result;
  }
  const state = launch.state;
  if (!state?.clientId) {
    throw new Error("Launch state is incomplete. Run the bootstrap flow again.");
  }

  const requestedHandle = config.operator.handle;

  // Enforce CLI state binding: if the state file is already bound to a different handle, hard-error.
  if (requestedHandle && state.beingHandle && state.beingHandle !== requestedHandle) {
    throw new Error(
      `This state file is bound to being handle "${state.beingHandle}", but the config requests "${requestedHandle}". ` +
      `Use a different launchStatePath for each being, or clear this state file and retry.`,
    );
  }

  const result = await deps.callTool<ToolResponse>("participate", {
    email: config.operator.email,
    name: config.operator.name,
    handle: requestedHandle,
    topicId: config.topic?.topicId,
    domainSlug: config.topic?.domainSlug,
    templateId: config.topic?.templateId,
    body: config.contribution.body,
    clientId: state.clientId,
    clientSecret: state.clientSecret,
    refreshToken: state.refreshToken,
    accessToken: state.accessToken,
  });

  // Resolve the beingHandle to persist: use the result if available, else the requested handle, else existing.
  const resolvedHandle = (result.beingHandle as string | null | undefined) ?? requestedHandle ?? state.beingHandle ?? null;

  const nextState = stateFromLaunchResult(result, {
    email: config.operator.email,
    name: config.operator.name,
    clientSecret: state.clientSecret ?? undefined,
    mcpUrl: config.mcpUrl ?? state.mcpUrl,
    beingId: state.beingId ?? null,
    beingHandle: resolvedHandle,
  });
  await deps.saveState(nextState);
  return result;
}
