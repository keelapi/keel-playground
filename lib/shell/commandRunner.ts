import { COMMAND_REGISTRY } from "@/lib/shell/commandRegistry";
import { parseShellCommand } from "@/lib/shell/commandRegistry";
import {
  cloneSessionState,
  createInitialSessionState,
  createPermitId,
  createRequestId,
  createTraceId,
  formatUsd,
  nextTimestamp,
} from "@/lib/shell/sessionState";
import type {
  CommandArtifact,
  CommandRunResult,
  GovernanceInspectorState,
  GovernanceStageId,
  GovernanceStageState,
  PermitDecision,
  PermitReasonCode,
  PermitRecord,
  RequestRecord,
  SessionState,
  ShellCommand,
  TerminalRow,
} from "@/lib/shell/types";

type Evaluation = {
  decision: PermitDecision;
  reasonCode: PermitReasonCode;
  why: string[];
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};

type LifecycleMode = "permit" | "execution";

type LifecycleParams = {
  mode: LifecycleMode;
  decision: PermitDecision;
  reasonCode: PermitReasonCode;
  provider: string;
  model: string;
  matchedPolicy: string;
  route: string | null;
  estimatedCostUsd: number;
  actualCostUsd: number;
  budgetBeforeUsd: number;
  budgetAfterUsd: number;
};

function requireFlag(command: ShellCommand, flag: string): string {
  const value = command.flags[flag];

  if (!value) {
    throw new Error(`Missing required flag: --${flag}`);
  }

  return value.trim();
}

function computeInputTokens(input: string): number {
  return Math.max(28, Math.ceil(input.trim().length * 0.82) + 22);
}

function computeOutputTokens(input: string, model: string): number {
  const normalized = input.toLowerCase();
  let complexityBoost = model.includes("claude") ? 28 : 16;

  if (normalized.includes("detailed")) {
    complexityBoost += 240;
  }

  if (normalized.includes("checklist")) {
    complexityBoost += 420;
  }

  if (normalized.includes("risk controls")) {
    complexityBoost += 900;
  }

  if (normalized.includes("handoff")) {
    complexityBoost += 280;
  }

  return Math.max(64, Math.ceil(input.trim().length * 0.68) + complexityBoost);
}

function getModelPricing(model: string): number {
  switch (model) {
    case "gpt-4.1-mini":
      return 0.0000042;
    case "claude-3.5-haiku":
      return 0.0000036;
    case "gpt-4.1":
      return 0.000018;
    default:
      return 0.0000068;
  }
}

function evaluateRequest(
  session: SessionState,
  provider: string,
  model: string,
  input: string,
): Evaluation {
  const inputTokens = computeInputTokens(input);
  const outputTokens = computeOutputTokens(input, model);
  const estimatedCostUsd = Number(
    ((inputTokens + outputTokens) * getModelPricing(model)).toFixed(4),
  );

  if (session.requestsRemaining <= 0) {
    return {
      decision: "deny",
      reasonCode: "sandbox_request_limit_reached",
      why: [
        "The deterministic sandbox has exhausted its governed execution allowance.",
        "Reset the sandbox to restore the fixed request budget.",
      ],
      inputTokens,
      outputTokens,
      estimatedCostUsd,
    };
  }

  if (!session.allowedModels.includes(model)) {
    return {
      decision: "deny",
      reasonCode: "model_not_allowed",
      why: [
        `${model} is outside the allowed model set for policy ${session.policy}.`,
        "Keel denies the request before provider dispatch when model policy fails.",
      ],
      inputTokens,
      outputTokens,
      estimatedCostUsd,
    };
  }

  if (estimatedCostUsd >= session.budgetUsdRemaining) {
    return {
      decision: "deny",
      reasonCode: "sandbox_budget_exceeded",
      why: [
        `Estimated cost $${formatUsd(estimatedCostUsd)} exceeds the remaining sandbox budget.`,
        "The deny happens inside Keel before any execution path is opened.",
      ],
      inputTokens,
      outputTokens,
      estimatedCostUsd,
    };
  }

  if (!session.providersAvailable.includes(provider)) {
    return {
      decision: "deny",
      reasonCode: "provider_not_available",
      why: [
        `${provider} is not enabled in this deterministic sandbox.`,
        "Routing cannot resolve an eligible upstream provider, so execution is denied.",
      ],
      inputTokens,
      outputTokens,
      estimatedCostUsd,
    };
  }

  return {
    decision: "allow",
    reasonCode: "policy_passed",
    why: [
      `Model ${model} is allowed by policy ${session.policy}.`,
      `Estimated cost $${formatUsd(estimatedCostUsd)} fits inside the remaining sandbox budget.`,
      `Provider ${provider} resolves to an approved route in the sandbox.`,
    ],
    inputTokens,
    outputTokens,
    estimatedCostUsd,
  };
}

function createLifecycle(
  session: SessionState,
  params: LifecycleParams,
): GovernanceStageState[] {
  const timeline: GovernanceStageState[] = [];

  function push(
    stage: GovernanceStageId,
    status: GovernanceStageState["status"],
    detail: string,
  ) {
    session.eventCounter += 1;
    timeline.push({
      stage,
      status,
      detail,
      timestamp: nextTimestamp(session.eventCounter),
    });
  }

  const isRequestLimit = params.reasonCode === "sandbox_request_limit_reached";
  const isPolicyDenied = params.reasonCode === "model_not_allowed";
  const isBudgetDenied = params.reasonCode === "sandbox_budget_exceeded";
  const isRoutingDenied = params.reasonCode === "provider_not_available";

  push("auth", "completed", "Sandbox identity was accepted for the local workbench session.");
  push(
    "authorization",
    isRequestLimit ? "blocked" : "completed",
    isRequestLimit
      ? "Sandbox execution allowance is exhausted for this deterministic session."
      : "Actor is authorized to request governed execution in sandbox-demo.",
  );
  push(
    "freshness",
    isRequestLimit ? "skipped" : "completed",
    isRequestLimit
      ? "Freshness checks were skipped after authorization failed."
      : "Request input falls within the deterministic freshness window.",
  );
  push(
    "policy",
    isRequestLimit ? "skipped" : isPolicyDenied ? "blocked" : "completed",
    isRequestLimit
      ? "Policy evaluation did not run because authorization was blocked."
      : isPolicyDenied
        ? `${params.model} is outside the allowed model profile for ${params.matchedPolicy}.`
        : `Matched policy ${params.matchedPolicy}.`,
  );
  push(
    "budget",
    isRequestLimit || isPolicyDenied
      ? "skipped"
      : isBudgetDenied
        ? "blocked"
        : "completed",
    isRequestLimit || isPolicyDenied
      ? "Budget evaluation was skipped because an earlier stage denied the request."
      : isBudgetDenied
        ? `Estimated cost $${formatUsd(params.estimatedCostUsd)} exceeded the remaining budget of $${formatUsd(params.budgetBeforeUsd)}.`
        : `Estimated cost $${formatUsd(params.estimatedCostUsd)} fits within the remaining budget of $${formatUsd(params.budgetBeforeUsd)}.`,
  );
  push(
    "firewall",
    isRequestLimit || isPolicyDenied || isBudgetDenied ? "skipped" : "completed",
    isRequestLimit || isPolicyDenied || isBudgetDenied
      ? "Sandbox firewall checks were skipped because execution was already denied."
      : "Request shape passed the sandbox firewall and deterministic safety gates.",
  );
  push(
    "routing",
    params.mode === "permit"
      ? "skipped"
      : isRoutingDenied
        ? "blocked"
        : params.decision === "allow"
          ? "completed"
          : "skipped",
    params.mode === "permit"
      ? "Routing stays deferred until an explicit governed execution command is issued."
      : isRoutingDenied
        ? `No eligible route was resolved for provider ${params.provider}.`
        : params.decision === "allow"
          ? `Resolved route ${params.route}.`
          : "Routing was skipped because execution did not reach dispatch.",
  );
  push(
    "execution",
    params.mode === "permit"
      ? "skipped"
      : params.decision === "allow"
        ? "completed"
        : "skipped",
    params.mode === "permit"
      ? "Permit creation ends before any provider execution path is opened."
      : params.decision === "allow"
        ? "Provider execution was simulated inside the deterministic sandbox."
        : "Execution was never dispatched upstream.",
  );
  push(
    "terminal-accounting",
    params.mode === "execution" && params.decision === "allow" ? "completed" : "skipped",
    params.mode === "execution" && params.decision === "allow"
      ? `Actual cost $${formatUsd(params.actualCostUsd)} posted. Budget moved to $${formatUsd(params.budgetAfterUsd)}.`
      : "Terminal accounting only posts when a governed execution completes.",
  );
  push(
    "audit",
    "completed",
    params.mode === "permit"
      ? `Permit decision ${params.decision} recorded for ${params.matchedPolicy}.`
      : `Governed request ${params.decision} recorded with lifecycle and accounting data.`,
  );

  return timeline;
}

function buildActualCost(provider: string, estimatedCostUsd: number): number {
  return Number(
    (
      estimatedCostUsd + (provider === "anthropic" ? 0.0001 : 0.0002)
    ).toFixed(4),
  );
}

function createPermitRecord(
  session: SessionState,
  provider: string,
  model: string,
  input: string,
  evaluation: Evaluation,
): PermitRecord {
  session.permitCounter += 1;

  const lifecycle = createLifecycle(session, {
    mode: "permit",
    decision: evaluation.decision,
    reasonCode: evaluation.reasonCode,
    provider,
    model,
    matchedPolicy: session.policy,
    route: null,
    estimatedCostUsd: evaluation.estimatedCostUsd,
    actualCostUsd: 0,
    budgetBeforeUsd: session.budgetUsdRemaining,
    budgetAfterUsd: session.budgetUsdRemaining,
  });

  const permit: PermitRecord = {
    id: createPermitId(session.permitCounter),
    decision: evaluation.decision,
    reasonCode: evaluation.reasonCode,
    why: evaluation.why,
    matchedPolicy: session.policy,
    model,
    provider,
    input,
    estimatedCostUsd: evaluation.estimatedCostUsd,
    budgetBeforeUsd: session.budgetUsdRemaining,
    budgetAfterUsd: session.budgetUsdRemaining,
    timestamp: lifecycle.at(-1)?.timestamp ?? nextTimestamp(session.eventCounter),
    lifecycle,
  };

  session.lastPermitId = permit.id;
  session.permits = [permit, ...session.permits].slice(0, 12);

  return permit;
}

function createRequestRecord(
  session: SessionState,
  provider: string,
  model: string,
  input: string,
  permitId: string,
  evaluation: Evaluation,
): RequestRecord {
  session.requestCounter += 1;
  session.traceCounter += 1;

  const route = evaluation.decision === "allow" ? `${provider} / ${model}` : null;
  const actualCostUsd =
    evaluation.decision === "allow" ? buildActualCost(provider, evaluation.estimatedCostUsd) : 0;
  const budgetBeforeUsd = session.budgetUsdRemaining;
  const budgetAfterUsd =
    evaluation.decision === "allow"
      ? Number(Math.max(0, budgetBeforeUsd - actualCostUsd).toFixed(4))
      : budgetBeforeUsd;
  const lifecycle = createLifecycle(session, {
    mode: "execution",
    decision: evaluation.decision,
    reasonCode: evaluation.reasonCode,
    provider,
    model,
    matchedPolicy: session.policy,
    route,
    estimatedCostUsd: evaluation.estimatedCostUsd,
    actualCostUsd,
    budgetBeforeUsd,
    budgetAfterUsd,
  });

  const request: RequestRecord = {
    id: createRequestId(session.requestCounter),
    permitId,
    decision: evaluation.decision,
    reasonCode: evaluation.reasonCode,
    why: evaluation.why,
    status: evaluation.decision === "allow" ? "completed" : "denied",
    provider,
    model,
    input,
    matchedPolicy: session.policy,
    routing: route,
    inputTokens: evaluation.inputTokens,
    outputTokens: evaluation.decision === "allow" ? evaluation.outputTokens : 0,
    estimatedCostUsd: evaluation.estimatedCostUsd,
    actualCostUsd,
    budgetBeforeUsd,
    budgetAfterUsd,
    traceId: createTraceId(session.traceCounter),
    timestamp: lifecycle.at(-1)?.timestamp ?? nextTimestamp(session.eventCounter),
    lifecycle,
  };

  session.lastRequestId = request.id;
  session.requests = [request, ...session.requests].slice(0, 12);
  session.usage.totalRequests += 1;

  if (request.status === "completed") {
    session.requestsRemaining -= 1;
    session.budgetUsdRemaining = request.budgetAfterUsd;
    session.usage.completedRequests += 1;
    session.usage.totalInputTokens += request.inputTokens;
    session.usage.totalOutputTokens += request.outputTokens;
    session.usage.totalActualCostUsd = Number(
      (session.usage.totalActualCostUsd + request.actualCostUsd).toFixed(4),
    );
  } else {
    session.usage.deniedRequests += 1;
  }

  return request;
}

function createDecisionInspector(
  title: string,
  subtitle: string,
  request: RequestRecord | null,
  permit: PermitRecord,
  command: string,
): GovernanceInspectorState {
  return {
    title,
    subtitle,
    decision: request?.decision ?? permit.decision,
    why: request?.why ?? permit.why,
    matchedPolicy: request?.matchedPolicy ?? permit.matchedPolicy,
    budgetBeforeUsd: request?.budgetBeforeUsd ?? permit.budgetBeforeUsd,
    budgetAfterUsd: request?.budgetAfterUsd ?? permit.budgetAfterUsd,
    providerResolved: request?.routing ? request.provider : permit.provider,
    modelResolved: request?.model ?? permit.model,
    requestId: request?.id ?? null,
    permitId: permit.id,
    usage:
      request === null
        ? {
            estimatedCostUsd: permit.estimatedCostUsd,
          }
        : {
            inputTokens: request.inputTokens,
            outputTokens: request.outputTokens,
            estimatedCostUsd: request.estimatedCostUsd,
            actualCostUsd: request.actualCostUsd,
          },
    lifecycle: request?.lifecycle ?? permit.lifecycle,
    traceId: request?.traceId,
    summaryRows: [
      { label: "project", value: "sandbox-demo" },
      { label: "input", value: request?.input ?? permit.input },
    ],
    quickActions:
      request === null
        ? [{ label: "Copy command", command }]
        : [
            { label: "Explain", command: `keel explain ${request.id}` },
            { label: "Replay timeline", command: `keel timeline ${request.id}` },
            { label: "Copy command", command },
          ],
  };
}

function createExplainInspector(request: RequestRecord, command: string): GovernanceInspectorState {
  return {
    title: "Decision explanation",
    subtitle: "Structured explanation of why the request was allowed or denied.",
    decision: request.decision,
    why: request.why,
    matchedPolicy: request.matchedPolicy,
    budgetBeforeUsd: request.budgetBeforeUsd,
    budgetAfterUsd: request.budgetAfterUsd,
    providerResolved: request.routing ? request.provider : null,
    modelResolved: request.model,
    requestId: request.id,
    permitId: request.permitId,
    usage: {
      inputTokens: request.inputTokens,
      outputTokens: request.outputTokens,
      estimatedCostUsd: request.estimatedCostUsd,
      actualCostUsd: request.actualCostUsd,
    },
    lifecycle: request.lifecycle,
    traceId: request.traceId,
    summaryRows: [
      { label: "routing", value: request.routing ?? "not dispatched" },
      { label: "status", value: request.status },
    ],
    quickActions: [
      { label: "Replay timeline", command: `keel timeline ${request.id}` },
      { label: "Copy command", command },
    ],
  };
}

function createTimelineInspector(
  request: RequestRecord,
  command: string,
): GovernanceInspectorState {
  return {
    title: "Governance timeline",
    subtitle: "Lifecycle replay across Keel's governed execution spine.",
    decision: request.decision,
    why: request.why,
    matchedPolicy: request.matchedPolicy,
    budgetBeforeUsd: request.budgetBeforeUsd,
    budgetAfterUsd: request.budgetAfterUsd,
    providerResolved: request.routing ? request.provider : null,
    modelResolved: request.model,
    requestId: request.id,
    permitId: request.permitId,
    usage: {
      inputTokens: request.inputTokens,
      outputTokens: request.outputTokens,
      estimatedCostUsd: request.estimatedCostUsd,
      actualCostUsd: request.actualCostUsd,
    },
    lifecycle: request.lifecycle,
    traceId: request.traceId,
    summaryRows: [
      { label: "stages", value: request.lifecycle.map((stage) => stage.stage).join(" -> ") },
      { label: "status", value: request.status },
    ],
    quickActions: [
      { label: "Explain", command: `keel explain ${request.id}` },
      { label: "Copy command", command },
    ],
  };
}

function createUsageInspector(command: string, session: SessionState): GovernanceInspectorState {
  return {
    title: "Usage and accounting",
    subtitle: "Deterministic ledger totals for this local sandbox session.",
    matchedPolicy: session.policy,
    budgetBeforeUsd: session.budgetUsdTotal,
    budgetAfterUsd: session.budgetUsdRemaining,
    usage: {
      totalRequests: session.usage.totalRequests,
      completedRequests: session.usage.completedRequests,
      deniedRequests: session.usage.deniedRequests,
      inputTokens: session.usage.totalInputTokens,
      outputTokens: session.usage.totalOutputTokens,
      totalActualCostUsd: session.usage.totalActualCostUsd,
    },
    summaryRows: [
      { label: "project", value: session.project },
      { label: "requests remaining", value: String(session.requestsRemaining) },
      { label: "mode", value: "simulation only; no live provider calls" },
    ],
    quickActions: [
      { label: "Copy command", command },
      { label: "Reset sandbox", command: "keel sandbox reset" },
    ],
  };
}

function createHelpArtifact(): CommandArtifact {
  return {
    commandName: "help",
    tone: "info",
    headline: "approved commands",
    rows: [
      {
        label: "commands",
        value: COMMAND_REGISTRY.map((definition) => definition.syntax),
      },
      {
        label: "mode",
        value: "deterministic sandbox only; no live provider calls or arbitrary shell access",
      },
    ],
  };
}

function handlePermitCreate(session: SessionState, command: ShellCommand): CommandRunResult {
  const provider = command.flags.provider?.trim() || "openai";
  const model = requireFlag(command, "model");
  const input = requireFlag(command, "input");
  const evaluation = evaluateRequest(session, provider, model, input);
  const permit = createPermitRecord(session, provider, model, input, evaluation);

  session.commandCount += 1;

  return {
    session,
    artifact: {
      commandName: "permits-create",
      tone: permit.decision === "allow" ? "success" : "denied",
      headline: permit.decision === "allow" ? "permit issued" : "permit denied",
      rows: [
        { label: "decision", value: permit.decision },
        { label: "permit_id", value: permit.id },
        { label: "matched_policy", value: permit.matchedPolicy },
        { label: "provider", value: permit.provider },
        { label: "model", value: permit.model },
        { label: "estimated_cost_usd", value: formatUsd(permit.estimatedCostUsd) },
        { label: "why", value: permit.why },
      ],
      inspector: createDecisionInspector(
        "Permit decision",
        "Permit-first governance, before any execution path is opened.",
        null,
        permit,
        command.raw,
      ),
    },
  };
}

function handleExecute(session: SessionState, command: ShellCommand): CommandRunResult {
  const provider = requireFlag(command, "provider");
  const model = requireFlag(command, "model");
  const input = requireFlag(command, "input");
  const evaluation = evaluateRequest(session, provider, model, input);
  const permit = createPermitRecord(session, provider, model, input, evaluation);
  const request = createRequestRecord(session, provider, model, input, permit.id, evaluation);

  session.commandCount += 1;

  return {
    session,
    artifact: {
      commandName: "execute",
      tone: request.decision === "allow" ? "success" : "denied",
      headline:
        request.decision === "allow"
          ? "governed execution completed"
          : "governed execution denied",
      rows: [
        { label: "decision", value: request.decision },
        { label: "request_id", value: request.id },
        { label: "permit_id", value: request.permitId },
        { label: "matched_policy", value: request.matchedPolicy },
        { label: "route", value: request.routing ?? "not dispatched" },
        { label: "estimated_cost_usd", value: formatUsd(request.estimatedCostUsd) },
        { label: "actual_cost_usd", value: formatUsd(request.actualCostUsd) },
        { label: "budget_after_usd", value: formatUsd(request.budgetAfterUsd) },
        { label: "why", value: request.why },
      ],
      inspector: createDecisionInspector(
        "Governed execution",
        "Permit, route, simulate execution, then inspect ledger and audit state.",
        request,
        permit,
        command.raw,
      ),
    },
  };
}

function requireRequest(session: SessionState, requestId: string | undefined): RequestRecord {
  if (!requestId) {
    throw new Error("Usage: keel explain <request_id>");
  }

  const request = session.requests.find((entry) => entry.id === requestId);

  if (!request) {
    throw new Error(`Unknown request id: ${requestId}`);
  }

  return request;
}

function handleExplain(session: SessionState, command: ShellCommand): CommandRunResult {
  const request = requireRequest(session, command.positionals[0]);
  session.commandCount += 1;

  return {
    session,
    artifact: {
      commandName: "explain",
      tone: request.decision === "allow" ? "info" : "denied",
      headline: "decision explanation",
      rows: [
        { label: "request_id", value: request.id },
        { label: "decision", value: request.decision },
        { label: "matched_policy", value: request.matchedPolicy },
        { label: "routing", value: request.routing ?? "not dispatched" },
        { label: "trace_id", value: request.traceId },
        { label: "why", value: request.why },
      ],
      inspector: createExplainInspector(request, command.raw),
    },
  };
}

function handleTimeline(session: SessionState, command: ShellCommand): CommandRunResult {
  const request = requireRequest(session, command.positionals[0]);
  session.commandCount += 1;

  return {
    session,
    artifact: {
      commandName: "timeline",
      tone: "info",
      headline: "timeline replay",
      rows: [
        { label: "request_id", value: request.id },
        { label: "decision", value: request.decision },
        { label: "trace_id", value: request.traceId },
        {
          label: "stages",
          value: request.lifecycle.map((stage) => `${stage.stage}:${stage.status}`),
        },
      ],
      inspector: createTimelineInspector(request, command.raw),
    },
  };
}

function handleUsage(session: SessionState, command: ShellCommand): CommandRunResult {
  session.commandCount += 1;

  return {
    session,
    artifact: {
      commandName: "usage",
      tone: "info",
      headline: "usage summary",
      rows: [
        { label: "total_requests", value: String(session.usage.totalRequests) },
        { label: "completed_requests", value: String(session.usage.completedRequests) },
        { label: "denied_requests", value: String(session.usage.deniedRequests) },
        {
          label: "tokens",
          value: `${session.usage.totalInputTokens} in / ${session.usage.totalOutputTokens} out`,
        },
        { label: "total_actual_cost_usd", value: formatUsd(session.usage.totalActualCostUsd) },
        { label: "budget_remaining_usd", value: formatUsd(session.budgetUsdRemaining) },
      ],
      inspector: createUsageInspector(command.raw, session),
    },
  };
}

function handleSandboxReset(): CommandRunResult {
  const session = createInitialSessionState();
  session.commandCount = 1;

  return {
    session,
    artifact: {
      commandName: "sandbox-reset",
      tone: "success",
      headline: "sandbox reset",
      rows: [
        { label: "project", value: session.project },
        { label: "policy", value: session.policy },
        { label: "budget_remaining_usd", value: formatUsd(session.budgetUsdRemaining) },
        { label: "requests_remaining", value: String(session.requestsRemaining) },
        { label: "mode", value: "deterministic sandbox restored" },
      ],
      inspector: createUsageInspector("keel sandbox reset", session),
    },
  };
}

function handleParsedCommand(
  session: SessionState,
  command: ShellCommand,
): CommandRunResult {
  switch (command.name) {
    case "help":
      session.commandCount += 1;
      return { session, artifact: createHelpArtifact() };
    case "permits-create":
      return handlePermitCreate(session, command);
    case "execute":
      return handleExecute(session, command);
    case "explain":
      return handleExplain(session, command);
    case "timeline":
      return handleTimeline(session, command);
    case "usage":
      return handleUsage(session, command);
    case "sandbox-reset":
      return handleSandboxReset();
  }
}

export function runWorkbenchCommand(
  sessionState: SessionState,
  rawCommand: string,
): CommandRunResult {
  const session = cloneSessionState(sessionState);

  try {
    const command = parseShellCommand(rawCommand);
    return handleParsedCommand(session, command);
  } catch (error) {
    session.commandCount += 1;

    return {
      session,
      artifact: {
        commandName: "help",
        tone: "error",
        headline: "command failed",
        rows: [
          {
            label: "reason",
            value:
              error instanceof Error ? error.message : "Unknown deterministic command failure.",
          },
          {
            label: "approved_commands",
            value: COMMAND_REGISTRY.map((definition) => definition.syntax),
          },
        ],
      },
    };
  }
}
