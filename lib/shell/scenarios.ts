import {
  cloneSessionState,
  createEventId,
  createInitialSessionState,
  createPermitId,
  createRequestId,
  createTraceId,
  formatUsd,
  nextTimestamp,
} from "@/lib/shell/sessionState";
import { parseShellCommand } from "@/lib/shell/commandParser";
import type {
  PermitDecision,
  RequestRecord,
  ScenarioResult,
  SessionState,
  ShellCommand,
  ShellOutput,
  TimelineEvent,
  TimelineStage,
} from "@/lib/shell/types";

type Evaluation = {
  decision: PermitDecision;
  reason: string;
  estimatedCostUsd: number;
  inputTokens: number;
  outputTokens: number;
};

function normalizeModel(value: string | undefined): string {
  return value?.trim() ?? "";
}

function normalizeProvider(value: string | undefined): string {
  return value?.trim() ?? "";
}

function requireFlag(command: ShellCommand, flag: string): string {
  const value = command.flags[flag];

  if (!value) {
    throw new Error(`Missing required flag: --${flag}`);
  }

  return value;
}

function computeInputTokens(input: string): number {
  return Math.max(24, Math.ceil(input.trim().length * 0.85) + 18);
}

function computeOutputTokens(input: string, model: string): number {
  const modelBonus = model.includes("claude") ? 36 : 22;
  const normalizedInput = input.toLowerCase();
  let complexityBoost = 0;

  if (normalizedInput.includes("detailed")) {
    complexityBoost += 320;
  }

  if (normalizedInput.includes("checklist")) {
    complexityBoost += 640;
  }

  if (normalizedInput.includes("for each step")) {
    complexityBoost += 2800;
  }

  if (normalizedInput.includes("risk controls")) {
    complexityBoost += 1300;
  }

  return Math.max(
    48,
    Math.ceil(input.trim().length * 0.72) + modelBonus + complexityBoost,
  );
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

function getProviderModelMatch(provider: string, model: string): string {
  return `${provider} / ${model}`;
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

  if (!session.providersAvailable.includes(provider)) {
    return {
      decision: "denied",
      reason: "provider_not_available",
      estimatedCostUsd,
      inputTokens,
      outputTokens,
    };
  }

  if (!session.allowedModels.includes(model)) {
    return {
      decision: "denied",
      reason: "model_not_allowed",
      estimatedCostUsd,
      inputTokens,
      outputTokens,
    };
  }

  if (session.requestsRemaining <= 0) {
    return {
      decision: "denied",
      reason: "sandbox_request_limit_reached",
      estimatedCostUsd,
      inputTokens,
      outputTokens,
    };
  }

  if (estimatedCostUsd >= session.budgetUsdRemaining) {
    return {
      decision: "denied",
      reason: "sandbox_budget_exceeded",
      estimatedCostUsd,
      inputTokens,
      outputTokens,
    };
  }

  return {
    decision: "allowed",
    reason: "policy_passed",
    estimatedCostUsd,
    inputTokens,
    outputTokens,
  };
}

function createTimelineEvent(
  session: SessionState,
  stage: TimelineStage,
  status: "completed" | "skipped",
  detail: string,
): TimelineEvent {
  session.eventCounter += 1;

  return {
    id: createEventId(session.eventCounter),
    stage,
    status,
    timestamp: nextTimestamp(session.eventCounter),
    detail,
  };
}

function createPermitRecord(
  session: SessionState,
  provider: string | null,
  model: string,
  input: string,
  evaluation: Evaluation,
) {
  session.permitCounter += 1;
  session.eventCounter += 1;

  const permit = {
    id: createPermitId(session.permitCounter),
    decision: evaluation.decision,
    reason: evaluation.reason,
    project: session.project,
    policy: session.policy,
    model,
    provider,
    input,
    estimatedCostUsd: evaluation.estimatedCostUsd,
    timestamp: nextTimestamp(session.eventCounter),
  };

  session.lastPermitId = permit.id;
  session.permits = [permit, ...session.permits].slice(0, 12);

  return {
    permit,
    output: {
      tone: evaluation.decision === "allowed" ? "success" : "denied",
      summary:
        evaluation.decision === "allowed" ? "permit allowed" : "permit denied",
      details: [
        { label: "decision", value: permit.decision },
        { label: "permit_id", value: permit.id },
        { label: "reason", value: permit.reason },
        { label: "model", value: permit.model },
        { label: "policy", value: permit.policy },
        { label: "estimated_cost_usd", value: formatUsd(permit.estimatedCostUsd) },
      ],
    } satisfies ShellOutput,
  };
}

function createRequestRecord(
  session: SessionState,
  provider: string,
  model: string,
  input: string,
  evaluation: Evaluation,
): RequestRecord {
  session.requestCounter += 1;
  session.traceCounter += 1;

  const requestId = createRequestId(session.requestCounter);
  const permitId = session.lastPermitId ?? createPermitId(session.permitCounter);
  const routing = getProviderModelMatch(provider, model);

  const baseStages: Array<{ stage: TimelineStage; detail: string }> = [
    { stage: "auth", detail: "sandbox session accepted" },
    { stage: "normalize", detail: "request normalized into governed execution contract" },
    {
      stage: "permit",
      detail:
        evaluation.decision === "allowed"
          ? "permit issued"
          : `permit denied: ${evaluation.reason}`,
    },
  ];

  const successStages: Array<{ stage: TimelineStage; detail: string }> = [
    { stage: "firewall", detail: "guardrails passed" },
    { stage: "routing", detail: `routing resolved to ${routing}` },
    { stage: "dispatch", detail: "sandbox provider execution simulated" },
    { stage: "reconcile", detail: "usage normalized" },
    { stage: "ledger", detail: "cost posted to sandbox ledger" },
    { stage: "emit", detail: "audit event emitted" },
  ];

  const denialStages: Array<{ stage: TimelineStage; detail: string }> = [
    { stage: "firewall", detail: "blocked before provider dispatch" },
    { stage: "emit", detail: "denial event emitted" },
  ];

  const timeline = [...baseStages, ...(evaluation.decision === "allowed" ? successStages : denialStages)].map(
    ({ stage, detail }) =>
      createTimelineEvent(
        session,
        stage,
        stage === "firewall" && evaluation.decision === "denied" ? "completed" : "completed",
        detail,
      ),
  );

  const actualCostUsd =
    evaluation.decision === "allowed"
      ? Number(
          (
            evaluation.estimatedCostUsd +
            (provider === "anthropic" ? 0.0001 : 0.0002)
          ).toFixed(4),
        )
      : 0;

  const request: RequestRecord = {
    id: requestId,
    permitId,
    provider,
    model,
    input,
    decision: evaluation.decision,
    reason: evaluation.reason,
    status: evaluation.decision === "allowed" ? "completed" : "denied",
    routing,
    inputTokens: evaluation.inputTokens,
    outputTokens: evaluation.decision === "allowed" ? evaluation.outputTokens : 0,
    estimatedCostUsd: evaluation.estimatedCostUsd,
    actualCostUsd,
    timestamp: timeline[0]?.timestamp ?? nextTimestamp(session.eventCounter),
    timeline,
    audit: {
      policy: session.policy,
      project: session.project,
      traceId: createTraceId(session.traceCounter),
      actor: "playground.visitor",
    },
  };

  session.lastRequestId = request.id;
  session.requests = [request, ...session.requests].slice(0, 12);
  session.usage.totalRequests += 1;

  if (request.status === "completed") {
    session.requestsRemaining -= 1;
    session.budgetUsdRemaining = Number(
      Math.max(0, session.budgetUsdRemaining - request.actualCostUsd).toFixed(4),
    );
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

function renderAllowedExecutionOutput(request: RequestRecord): ShellOutput {
  return {
    tone: "success",
    summary: "execution allowed",
    details: [
      { label: "id", value: request.id },
      { label: "decision", value: request.decision },
      { label: "routing", value: request.routing },
      { label: "cost_usd", value: formatUsd(request.actualCostUsd) },
      { label: "status", value: request.status },
      { label: "permit_id", value: request.permitId },
      { label: "tokens", value: `${request.inputTokens} in / ${request.outputTokens} out` },
    ],
  };
}

function renderDeniedExecutionOutput(
  request: RequestRecord,
  session: SessionState,
): ShellOutput {
  const details: ShellOutput["details"] = [
    { label: "id", value: request.id },
    { label: "decision", value: request.decision },
    { label: "reason", value: request.reason },
    { label: "status", value: request.status },
    { label: "dispatch", value: "blocked before provider dispatch" },
    { label: "upstream_call", value: "none" },
  ];

  if (request.reason === "model_not_allowed") {
    details.push({ label: "allowed", value: session.allowedModels.join(", ") });
  }

  if (request.reason === "sandbox_budget_exceeded") {
    details.push({
      label: "budget_remaining_usd",
      value: formatUsd(session.budgetUsdRemaining),
    });
    details.push({ label: "budget_effect", value: "preserved beyond denied request" });
  }

  if (request.reason === "provider_not_available") {
    details.push({ label: "providers", value: session.providersAvailable.join(", ") });
  }

  if (request.reason === "sandbox_request_limit_reached") {
    details.push({
      label: "requests_remaining",
      value: String(session.requestsRemaining),
    });
  }

  return {
    tone: "denied",
    summary: "execution denied",
    details,
  };
}

function createAllowedSystemNote(): ShellOutput {
  return {
    tone: "info",
    summary: "note: this request was evaluated before execution.",
    isSystemNote: true,
    details: [
      { label: "policy", value: "Keel allowed it because policy and budget checks passed." },
      { label: "routing", value: "Routing was resolved inside the governed boundary." },
      { label: "record", value: "Lifecycle, accounting, and audit state would be recorded." },
    ],
  };
}

function createDeniedSystemNote(): ShellOutput {
  return {
    tone: "info",
    summary: "note: this request was blocked before reaching the provider.",
    isSystemNote: true,
    details: [
      { label: "decision", value: "Denial happened inside the governed boundary." },
      { label: "dispatch", value: "No upstream call would be made when execution is denied." },
    ],
  };
}

function maybeCreateSystemNote(
  session: SessionState,
  decision: PermitDecision,
): ShellOutput[] | undefined {
  if (decision === "allowed" && !session.hasShownAllowedNote) {
    session.hasShownAllowedNote = true;
    return [createAllowedSystemNote()];
  }

  if (decision === "denied" && !session.hasShownDeniedNote) {
    session.hasShownDeniedNote = true;
    return [createDeniedSystemNote()];
  }

  return undefined;
}

function handleHelp(session: SessionState): ScenarioResult {
  session.commandCount += 1;

  return {
    session,
    output: {
      tone: "info",
      summary: "→ Keel Shell commands",
      details: [
        {
          label: "commands",
          value: [
            "keel help",
            "keel sandbox status",
            "keel permits create --model <model> --input \"<text>\"",
            "keel execute --provider <provider> --model <model> --input \"<text>\"",
            "keel explain <request_id>",
            "keel timeline <request_id>",
            "keel usage",
            "keel policy show",
            "keel budget show",
            "keel sandbox reset",
            "keel routing preview --provider <provider> --model <model>",
          ],
        },
      ],
    },
  };
}

function handleSandboxStatus(session: SessionState): ScenarioResult {
  session.commandCount += 1;

  return {
    session,
    output: {
      tone: "info",
      summary: "sandbox status",
      details: [
        { label: "project", value: session.project },
        { label: "policy", value: session.policy },
        { label: "budget_remaining_usd", value: formatUsd(session.budgetUsdRemaining) },
        { label: "requests_remaining", value: String(session.requestsRemaining) },
        { label: "policy_profile", value: "permit-first deterministic sandbox" },
        { label: "allowed", value: session.allowedModels.join(", ") },
        { label: "providers", value: session.providersAvailable.join(", ") },
        { label: "mode", value: "simulation only; no live provider calls" },
      ],
    },
  };
}

function handlePermitsCreate(
  session: SessionState,
  command: ShellCommand,
): ScenarioResult {
  const model = normalizeModel(requireFlag(command, "model"));
  const input = requireFlag(command, "input");
  const provider = normalizeProvider(command.flags.provider || "openai");
  const evaluation = evaluateRequest(session, provider, model, input);
  const { output } = createPermitRecord(session, provider, model, input, evaluation);
  session.commandCount += 1;

  return {
    session,
    output,
    auxiliaryOutputs: maybeCreateSystemNote(session, evaluation.decision),
  };
}

function handleExecute(session: SessionState, command: ShellCommand): ScenarioResult {
  const provider = normalizeProvider(requireFlag(command, "provider"));
  const model = normalizeModel(requireFlag(command, "model"));
  const input = requireFlag(command, "input");
  const evaluation = evaluateRequest(session, provider, model, input);

  createPermitRecord(session, provider, model, input, evaluation);

  const request = createRequestRecord(session, provider, model, input, evaluation);
  session.commandCount += 1;

  return {
    session,
    output:
      request.status === "completed"
        ? renderAllowedExecutionOutput(request)
        : renderDeniedExecutionOutput(request, session),
    auxiliaryOutputs: maybeCreateSystemNote(session, evaluation.decision),
  };
}

function handleExplain(session: SessionState, command: ShellCommand): ScenarioResult {
  const requestId = command.positionals[0];

  if (!requestId) {
    throw new Error("Usage: keel explain <request_id>");
  }

  const request = session.requests.find((entry) => entry.id === requestId);

  if (!request) {
    throw new Error(`Unknown request id: ${requestId}`);
  }

  session.commandCount += 1;

  const checks =
    request.decision === "allowed"
      ? [
          "model matched policy",
          "budget check passed",
          "provider was eligible",
          "request proceeded to governed execution",
          "lifecycle was recorded",
        ]
      : request.reason === "sandbox_budget_exceeded"
        ? [
            "budget check failed",
            "request denied before dispatch",
            "no upstream call made",
          ]
        : request.reason === "provider_not_available"
          ? [
              "provider was not eligible",
              "request denied before dispatch",
              "no upstream call made",
            ]
          : [
              "model blocked by policy",
              "request denied before dispatch",
              "no upstream call made",
            ];

  return {
    session,
    output: {
      tone: request.decision === "allowed" ? "info" : "denied",
      summary: "request explainability",
      details: [
        { label: "id", value: request.id },
        { label: "decision", value: request.decision },
        { label: "reason", value: request.reason },
        { label: "routing", value: request.decision === "allowed" ? request.routing : "not dispatched" },
        { label: "checks", value: checks },
        { label: "trace", value: request.audit.traceId },
      ],
    },
  };
}

function handleTimeline(session: SessionState, command: ShellCommand): ScenarioResult {
  const requestId = command.positionals[0];

  if (!requestId) {
    throw new Error("Usage: keel timeline <request_id>");
  }

  const request = session.requests.find((entry) => entry.id === requestId);

  if (!request) {
    throw new Error(`Unknown request id: ${requestId}`);
  }

  session.commandCount += 1;

  return {
    session,
    output: {
      tone: "success",
      summary: "lifecycle replay",
      details: [
        { label: "id", value: request.id },
        { label: "status", value: request.status },
        { label: "stages", value: request.timeline.map((event) => event.stage).join(" -> ") },
        { label: "trace", value: request.audit.traceId },
        { label: "last_event_id", value: request.timeline.at(-1)?.id ?? "none" },
      ],
    },
  };
}

function handleUsage(session: SessionState): ScenarioResult {
  session.commandCount += 1;

  return {
    session,
    output: {
      tone: "info",
      summary: "usage summary",
      details: [
        { label: "completed_requests", value: String(session.usage.completedRequests) },
        { label: "denied_requests", value: String(session.usage.deniedRequests) },
        {
          label: "tokens",
          value: `${session.usage.totalInputTokens} in / ${session.usage.totalOutputTokens} out`,
        },
        { label: "cost_usd", value: formatUsd(session.usage.totalActualCostUsd) },
        { label: "budget_remaining_usd", value: formatUsd(session.budgetUsdRemaining) },
      ],
    },
  };
}

function handlePolicyShow(session: SessionState): ScenarioResult {
  session.commandCount += 1;

  return {
    session,
    output: {
      tone: "info",
      summary: "policy profile",
      details: [
        { label: "policy", value: session.policy },
        { label: "project", value: session.project },
        { label: "decision_mode", value: "permit-first" },
        { label: "allowed", value: session.allowedModels.join(", ") },
        { label: "blocked", value: session.blockedPremiumModels.join(", ") },
        { label: "providers", value: session.providersAvailable.join(", ") },
      ],
    },
  };
}

function handleBudgetShow(session: SessionState): ScenarioResult {
  session.commandCount += 1;

  return {
    session,
    output: {
      tone: "info",
      summary: "budget state",
      details: [
        { label: "project", value: session.project },
        { label: "budget_remaining_usd", value: formatUsd(session.budgetUsdRemaining) },
        { label: "requests_remaining", value: String(session.requestsRemaining) },
        { label: "cost_usd", value: formatUsd(session.usage.totalActualCostUsd) },
        { label: "policy", value: session.policy },
      ],
    },
  };
}

function handleSandboxReset(): ScenarioResult {
  const session = createInitialSessionState();
  session.commandCount = 1;

  return {
    session,
    output: {
      tone: "success",
      summary: "sandbox reset",
      details: [
        { label: "project", value: session.project },
        { label: "policy", value: session.policy },
        { label: "budget_remaining_usd", value: formatUsd(session.budgetUsdRemaining) },
        { label: "requests_remaining", value: String(session.requestsRemaining) },
        { label: "mode", value: "simulation only; no live provider calls" },
      ],
    },
  };
}

function handleRoutingPreview(
  session: SessionState,
  command: ShellCommand,
): ScenarioResult {
  const provider = normalizeProvider(requireFlag(command, "provider"));
  const model = normalizeModel(requireFlag(command, "model"));
  const routingAllowed =
    session.providersAvailable.includes(provider) && session.allowedModels.includes(model);

  session.commandCount += 1;

  return {
    session,
    output: {
      tone: routingAllowed ? "info" : "denied",
      summary: routingAllowed ? "routing preview" : "routing blocked",
      details: [
        { label: "route", value: `${provider} / ${model}` },
        {
          label: "decision",
          value: routingAllowed ? "route_available" : "route_denied",
        },
        {
          label: "reason",
          value: routingAllowed ? "provider_model_available" : "policy_or_provider_blocked",
        },
      ],
    },
  };
}

function handleParsedCommand(
  session: SessionState,
  command: ShellCommand,
): ScenarioResult {
  switch (command.name) {
    case "help":
      return handleHelp(session);
    case "sandbox-status":
      return handleSandboxStatus(session);
    case "permits-create":
      return handlePermitsCreate(session, command);
    case "execute":
      return handleExecute(session, command);
    case "explain":
      return handleExplain(session, command);
    case "timeline":
      return handleTimeline(session, command);
    case "usage":
      return handleUsage(session);
    case "policy-show":
      return handlePolicyShow(session);
    case "budget-show":
      return handleBudgetShow(session);
    case "sandbox-reset":
      return handleSandboxReset();
    case "routing-preview":
      return handleRoutingPreview(session, command);
  }
}

export function runShellScenario(
  sessionState: SessionState,
  rawCommand: string,
): ScenarioResult {
  const session = cloneSessionState(sessionState);

  try {
    const command = parseShellCommand(rawCommand);
    return handleParsedCommand(session, command);
  } catch (error) {
    session.commandCount += 1;

    return {
      session,
      output: {
        tone: "error",
        summary: "✗ command failed",
        details: [
          {
            label: "reason",
            value:
              error instanceof Error ? error.message : "Unknown shell execution failure.",
          },
        ],
      },
    };
  }
}
