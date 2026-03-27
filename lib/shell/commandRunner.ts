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

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type FirewallResult = {
  blocked: boolean;
  ruleId: string | null;
  detail: string | null;
};

type Evaluation = {
  decision: PermitDecision;
  reasonCode: PermitReasonCode;
  why: string[];
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  firewallRuleId: string | null;
  firewallDetail: string | null;
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
  firewallRuleId: string | null;
  firewallDetail: string | null;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function requireFlag(command: ShellCommand, flag: string): string {
  const value = command.flags[flag];

  if (!value) {
    throw new Error(`Missing required flag: --${flag}`);
  }

  return value.trim();
}

function toMicros(usd: number): number {
  return Math.round(usd * 1_000_000);
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

/* ------------------------------------------------------------------ */
/*  Firewall                                                           */
/* ------------------------------------------------------------------ */

function evaluateFirewall(input: string): FirewallResult {
  // API key patterns (OpenAI, Anthropic, generic)
  if (/sk-[a-zA-Z0-9_-]{10,}/.test(input)) {
    return {
      blocked: true,
      ruleId: "api_key_detected",
      detail: "API key pattern (sk-...) detected in prompt content.",
    };
  }

  // Prompt injection patterns
  if (
    /ignore\s+(all\s+)?previous\s+instructions/i.test(input) ||
    /disregard\s+(all\s+)?(prior|previous|your)/i.test(input) ||
    /forget\s+(all\s+)?(your|previous)/i.test(input)
  ) {
    return {
      blocked: true,
      ruleId: "prompt_injection_detected",
      detail: "Prompt injection attempt detected — instruction override pattern.",
    };
  }

  // System prompt exfiltration
  if (
    /output\s+(the|your)\s+system\s+prompt/i.test(input) ||
    /reveal\s+(your|the)\s+(system|hidden)/i.test(input) ||
    /print\s+(your|the)\s+system/i.test(input)
  ) {
    return {
      blocked: true,
      ruleId: "system_prompt_exfiltration",
      detail: "System prompt exfiltration attempt detected.",
    };
  }

  // SSN pattern
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(input)) {
    return {
      blocked: true,
      ruleId: "ssn_pattern_detected",
      detail: "Social Security Number pattern detected in prompt content.",
    };
  }

  // Credit card pattern
  if (/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(input)) {
    return {
      blocked: true,
      ruleId: "credit_card_detected",
      detail: "Credit card number pattern detected in prompt content.",
    };
  }

  // Private key block
  if (/-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/.test(input)) {
    return {
      blocked: true,
      ruleId: "private_key_detected",
      detail: "Private key block detected in prompt content.",
    };
  }

  return { blocked: false, ruleId: null, detail: null };
}

/* ------------------------------------------------------------------ */
/*  Evaluation                                                         */
/* ------------------------------------------------------------------ */

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
      reasonCode: "request_limit_reached",
      why: [
        "Sandbox execution allowance exhausted.",
        "Reset the sandbox to restore the request budget.",
      ],
      inputTokens,
      outputTokens,
      estimatedCostUsd,
      firewallRuleId: null,
      firewallDetail: null,
    };
  }

  if (!session.allowedModels.includes(model)) {
    return {
      decision: "deny",
      reasonCode: "model_not_allowed",
      why: [
        `${model} is not in the allowed model set for policy ${session.policy}.`,
        `Keel denied the request before provider dispatch — $0.00 spent.`,
      ],
      inputTokens,
      outputTokens,
      estimatedCostUsd,
      firewallRuleId: null,
      firewallDetail: null,
    };
  }

  if (estimatedCostUsd >= session.budgetUsdRemaining) {
    return {
      decision: "deny",
      reasonCode: "budget_exceeded",
      why: [
        `Estimated cost $${formatUsd(estimatedCostUsd)} exceeds remaining budget of $${formatUsd(session.budgetUsdRemaining)}.`,
        "Keel denied the request before any provider call was made.",
      ],
      inputTokens,
      outputTokens,
      estimatedCostUsd,
      firewallRuleId: null,
      firewallDetail: null,
    };
  }

  if (!session.providersAvailable.includes(provider)) {
    return {
      decision: "deny",
      reasonCode: "provider_not_available",
      why: [
        `${provider} is not enabled for this project.`,
        "Routing could not resolve an eligible upstream provider.",
      ],
      inputTokens,
      outputTokens,
      estimatedCostUsd,
      firewallRuleId: null,
      firewallDetail: null,
    };
  }

  // Firewall — runs after policy/budget pass, before dispatch
  const firewall = evaluateFirewall(input);

  if (firewall.blocked) {
    return {
      decision: "deny",
      reasonCode: "firewall_blocked",
      why: [
        firewall.detail ?? "Firewall rule triggered.",
        "Keel blocked this request before it reached the provider.",
        "The content never left your infrastructure.",
      ],
      inputTokens,
      outputTokens,
      estimatedCostUsd,
      firewallRuleId: firewall.ruleId,
      firewallDetail: firewall.detail,
    };
  }

  return {
    decision: "allow",
    reasonCode: "policy_passed",
    why: [
      `Policy ${session.policy} matched — model ${model} is allowed.`,
      `Estimated cost $${formatUsd(estimatedCostUsd)} fits within remaining budget of $${formatUsd(session.budgetUsdRemaining)}.`,
      `Firewall passed — no sensitive patterns detected.`,
      `Route resolved: ${provider} / ${model}.`,
    ],
    inputTokens,
    outputTokens,
    estimatedCostUsd,
    firewallRuleId: null,
    firewallDetail: null,
  };
}

/* ------------------------------------------------------------------ */
/*  Lifecycle (8 real stages)                                          */
/* ------------------------------------------------------------------ */

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

  const isLimitDenied = params.reasonCode === "request_limit_reached";
  const isPolicyDenied = params.reasonCode === "model_not_allowed";
  const isBudgetDenied = params.reasonCode === "budget_exceeded";
  const isFirewallBlocked = params.reasonCode === "firewall_blocked";
  const isRoutingDenied = params.reasonCode === "provider_not_available";
  const permitDenied = isLimitDenied || isPolicyDenied || isBudgetDenied;
  const anyDenied = permitDenied || isFirewallBlocked || isRoutingDenied;

  // 1. auth
  push(
    "auth",
    "completed",
    "API key validated, project sandbox-demo resolved.",
  );

  // 2. normalize
  push(
    "normalize",
    isLimitDenied ? "skipped" : "completed",
    isLimitDenied
      ? "Skipped — request limit reached before evaluation."
      : "Payload parsed, token count estimated, operation resolved.",
  );

  // 3. permit (policy + budget combined)
  push(
    "permit",
    permitDenied ? "blocked" : "completed",
    isLimitDenied
      ? "Request limit reached — permit denied."
      : isPolicyDenied
        ? `${params.model} is not in the allowed model set for policy ${params.matchedPolicy}.`
        : isBudgetDenied
          ? `Estimated cost $${formatUsd(params.estimatedCostUsd)} exceeds remaining budget $${formatUsd(params.budgetBeforeUsd)}.`
          : `Policy ${params.matchedPolicy} matched. Budget reservation of $${formatUsd(params.estimatedCostUsd)} placed.`,
  );

  // 4. firewall
  push(
    "firewall",
    permitDenied
      ? "skipped"
      : isFirewallBlocked
        ? "blocked"
        : "completed",
    permitDenied
      ? "Skipped — request already denied at permit stage."
      : isFirewallBlocked
        ? `${params.firewallDetail ?? "Firewall rule triggered."} Rule: ${params.firewallRuleId ?? "unknown"}.`
        : "Content inspection passed — no sensitive patterns detected.",
  );

  // 5. routing
  push(
    "routing",
    params.mode === "permit"
      ? "skipped"
      : anyDenied
        ? "skipped"
        : isRoutingDenied
          ? "blocked"
          : "completed",
    params.mode === "permit"
      ? "Deferred — permit evaluation does not trigger routing."
      : anyDenied
        ? "Skipped — request denied before dispatch."
        : isRoutingDenied
          ? `No eligible route for provider ${params.provider}.`
          : `Resolved route: ${params.route}.`,
  );

  // 6. dispatch
  push(
    "dispatch",
    params.mode === "permit"
      ? "skipped"
      : params.decision === "allow"
        ? "completed"
        : "skipped",
    params.mode === "permit"
      ? "Deferred — permit does not trigger execution."
      : params.decision === "allow"
        ? "Provider call executed (simulated in sandbox)."
        : "Skipped — request denied before execution.",
  );

  // 7. reconcile
  push(
    "reconcile",
    params.mode === "execution" && params.decision === "allow"
      ? "completed"
      : "skipped",
    params.mode === "execution" && params.decision === "allow"
      ? `Actual cost $${formatUsd(params.actualCostUsd)} reconciled. Budget now $${formatUsd(params.budgetAfterUsd)}.`
      : "Skipped — no execution to reconcile.",
  );

  // 8. emit
  push(
    "emit",
    "completed",
    params.mode === "permit"
      ? `Event: permit.${params.decision === "allow" ? "evaluated" : "denied"}`
      : `Event: execution.${params.decision === "allow" ? "completed" : "denied"}`,
  );

  return timeline;
}

/* ------------------------------------------------------------------ */
/*  Record builders                                                    */
/* ------------------------------------------------------------------ */

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
    firewallRuleId: evaluation.firewallRuleId,
    firewallDetail: evaluation.firewallDetail,
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
    firewallRuleId: evaluation.firewallRuleId,
    firewallDetail: evaluation.firewallDetail,
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
    firewallRuleId: evaluation.firewallRuleId,
    firewallDetail: evaluation.firewallDetail,
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
    firewallRuleId: evaluation.firewallRuleId,
    firewallDetail: evaluation.firewallDetail,
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

/* ------------------------------------------------------------------ */
/*  Without-Keel contrast messages                                     */
/* ------------------------------------------------------------------ */

function withoutKeelMessage(
  evaluation: Evaluation,
  provider: string,
  model: string,
): string {
  switch (evaluation.reasonCode) {
    case "model_not_allowed":
      return `Without Keel this request runs on ${model} unchecked — estimated cost $${formatUsd(evaluation.estimatedCostUsd)} with no policy gate.`;
    case "budget_exceeded":
      return `Without Keel this request executes and overshoots your intended budget.`;
    case "firewall_blocked":
      return `Without Keel this prompt — including the detected ${evaluation.firewallRuleId ?? "pattern"} — is sent directly to ${provider}. The data leaves your infrastructure.`;
    case "request_limit_reached":
      return "Without Keel there is no request cap — runaway loops continue unchecked.";
    case "provider_not_available":
      return `Without Keel this request fails with a provider error and no fallback.`;
    case "policy_passed":
      return "Without Keel there is no cost tracking, no audit trail, and no budget enforcement.";
    default:
      return "";
  }
}

/* ------------------------------------------------------------------ */
/*  Inspector builders                                                 */
/* ------------------------------------------------------------------ */

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

function createExplainInspector(
  request: RequestRecord,
  command: string,
  session: SessionState,
): GovernanceInspectorState {
  // Build counterfactual rows
  const counterfactuals: TerminalRow[] = [];

  if (request.decision === "allow") {
    counterfactuals.push({
      label: "would_deny_if",
      value: `budget were below $${formatUsd(request.estimatedCostUsd)}`,
    });
    counterfactuals.push({
      label: "would_deny_if",
      value: `model were ${session.blockedPremiumModels[0] ?? "gpt-4.1"} (blocked by policy)`,
    });
    counterfactuals.push({
      label: "would_deny_if",
      value: "input contained an API key, SSN, or injection pattern",
    });
  } else {
    if (request.reasonCode === "model_not_allowed") {
      counterfactuals.push({
        label: "would_allow_if",
        value: `model changed to ${session.allowedModels[0] ?? "gpt-4.1-mini"}`,
      });
    }
    if (request.reasonCode === "budget_exceeded") {
      const overdraft = Number(
        Math.max(0, request.estimatedCostUsd - request.budgetBeforeUsd).toFixed(4),
      );
      counterfactuals.push({
        label: "would_allow_if",
        value: `budget increased by $${formatUsd(overdraft)}`,
      });
    }
    if (request.reasonCode === "firewall_blocked") {
      counterfactuals.push({
        label: "would_allow_if",
        value: "sensitive content removed from prompt input",
      });
    }
  }

  return {
    title: "Decision explanation",
    subtitle:
      request.decision === "allow"
        ? `Allowed — policy ${request.matchedPolicy} matched, budget had $${formatUsd(request.budgetBeforeUsd)} remaining.`
        : `Denied — ${request.reasonCode}.`,
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
      ...counterfactuals,
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
  const blockedStage = request.lifecycle.find((s) => s.status === "blocked");
  const completedCount = request.lifecycle.filter((s) => s.status === "completed").length;

  return {
    title: "Governance timeline",
    subtitle: blockedStage
      ? `Blocked at ${blockedStage.stage} — ${request.lifecycle.length - completedCount} stages skipped.`
      : `${completedCount} of ${request.lifecycle.length} stages completed.`,
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
      {
        label: "stages",
        value: request.lifecycle.map((stage) => `${stage.stage}:${stage.status}`),
      },
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
    subtitle: "Ledger totals for this sandbox session.",
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

/* ------------------------------------------------------------------ */
/*  Command handlers                                                   */
/* ------------------------------------------------------------------ */

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
        value: "deterministic sandbox — no live provider calls or arbitrary shell access",
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

  const isAllow = permit.decision === "allow";
  const headline = isAllow
    ? `permit issued — $${formatUsd(permit.estimatedCostUsd)} reserved, execution not yet dispatched`
    : permit.reasonCode === "firewall_blocked"
      ? `permit denied — ${permit.firewallRuleId ?? "firewall_blocked"}`
      : `permit denied — ${permit.reasonCode}`;

  const rows: TerminalRow[] = [
    { label: "decision", value: permit.decision },
    { label: "permit_id", value: permit.id },
    { label: "policy_id", value: permit.matchedPolicy },
    { label: "provider", value: permit.provider },
    { label: "model", value: permit.model },
    { label: "cost_usd_micros", value: String(toMicros(permit.estimatedCostUsd)) },
  ];

  if (isAllow) {
    rows.push({
      label: "x-keel-decision",
      value: "allow",
    });
    rows.push({
      label: "x-keel-firewall-result",
      value: "pass",
    });
  }

  if (permit.firewallRuleId) {
    rows.push({
      label: "x-keel-firewall-result",
      value: permit.firewallRuleId,
    });
  }

  rows.push({ label: "why", value: permit.why });
  rows.push({
    label: "without_keel",
    value: withoutKeelMessage(evaluation, provider, model),
  });
  rows.push({
    label: "learn_more",
    value: permit.reasonCode === "firewall_blocked"
      ? "https://docs.keelapi.com/security"
      : "https://docs.keelapi.com/permits",
  });

  return {
    session,
    artifact: {
      commandName: "permits-create",
      tone: permit.decision === "allow" ? "success" : "denied",
      headline,
      rows,
      inspector: createDecisionInspector(
        "Permit decision",
        isAllow
          ? "Budget reserved but not spent — execution requires a separate dispatch."
          : `Denied at ${permit.reasonCode === "firewall_blocked" ? "firewall" : "permit"} stage.`,
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

  const isAllow = request.decision === "allow";

  // Build headline with story
  let headline: string;
  if (isAllow) {
    headline = `allowed — 8 governance stages passed, $${formatUsd(request.actualCostUsd)} billed`;
  } else if (request.reasonCode === "firewall_blocked") {
    headline = `blocked — ${request.firewallRuleId ?? "firewall_blocked"} in prompt content`;
  } else if (request.reasonCode === "model_not_allowed") {
    headline = `denied — ${model} blocked by policy, $0.00 spent`;
  } else if (request.reasonCode === "budget_exceeded") {
    headline = `denied — cost $${formatUsd(request.estimatedCostUsd)} exceeds remaining budget $${formatUsd(request.budgetBeforeUsd)}`;
  } else {
    headline = `denied — ${request.reasonCode}`;
  }

  const rows: TerminalRow[] = [
    { label: "decision", value: request.decision },
    { label: "request_id", value: request.id },
    { label: "permit_id", value: request.permitId },
    { label: "policy_id", value: request.matchedPolicy },
  ];

  if (isAllow) {
    rows.push(
      { label: "route", value: request.routing ?? "not dispatched" },
      { label: "input_tokens", value: String(request.inputTokens) },
      { label: "output_tokens", value: String(request.outputTokens) },
      { label: "cost_usd_micros", value: `${toMicros(request.estimatedCostUsd)} estimated → ${toMicros(request.actualCostUsd)} actual` },
      { label: "budget_remaining", value: `$${formatUsd(request.budgetAfterUsd)}` },
    );
  } else {
    if (request.reasonCode === "model_not_allowed") {
      rows.push({
        label: "cost_avoided",
        value: `$${formatUsd(request.estimatedCostUsd)} — what this request would have cost on ${model}`,
      });
    }
    if (request.reasonCode === "budget_exceeded") {
      const overdraft = Number(
        Math.max(0, request.estimatedCostUsd - request.budgetBeforeUsd).toFixed(4),
      );
      rows.push({
        label: "cost_avoided",
        value: `$${formatUsd(request.estimatedCostUsd)} — would have exceeded budget by $${formatUsd(overdraft)}`,
      });
    }
    if (request.firewallRuleId) {
      rows.push({
        label: "firewall_rule",
        value: request.firewallRuleId,
      });
    }
  }

  // x-keel headers
  rows.push(
    { label: "x-keel-request-id", value: request.id },
    { label: "x-keel-decision", value: request.decision },
    {
      label: "x-keel-firewall-result",
      value: request.firewallRuleId ?? "pass",
    },
    {
      label: "x-keel-cost-usd",
      value: isAllow ? formatUsd(request.actualCostUsd) : "0.0000",
    },
  );

  rows.push({ label: "why", value: request.why });
  rows.push({
    label: "without_keel",
    value: withoutKeelMessage(evaluation, provider, model),
  });

  const executeLearnMore =
    request.reasonCode === "firewall_blocked"
      ? "https://docs.keelapi.com/security"
      : request.reasonCode === "model_not_allowed"
        ? "https://docs.keelapi.com/recipes/guard-model-usage"
        : request.reasonCode === "budget_exceeded"
          ? "https://docs.keelapi.com/recipes/cost-controls"
          : "https://docs.keelapi.com/executions";
  rows.push({ label: "learn_more", value: executeLearnMore });

  return {
    session,
    artifact: {
      commandName: "execute",
      tone: isAllow ? "success" : "denied",
      headline,
      rows,
      inspector: createDecisionInspector(
        "Governed execution",
        isAllow
          ? "Permit, route, dispatch, reconcile — full governance spine."
          : `Stopped at ${request.reasonCode === "firewall_blocked" ? "firewall" : "permit"} stage.`,
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

  const headline =
    request.decision === "allow"
      ? `allowed — policy ${request.matchedPolicy} matched, budget had $${formatUsd(request.budgetBeforeUsd)} remaining`
      : request.reasonCode === "firewall_blocked"
        ? `denied — ${request.firewallRuleId ?? "firewall rule triggered"}`
        : `denied — ${request.reasonCode}`;

  const rows: TerminalRow[] = [
    { label: "request_id", value: request.id },
    { label: "decision", value: request.decision },
    { label: "policy_id", value: request.matchedPolicy },
    { label: "routing", value: request.routing ?? "not dispatched" },
    { label: "trace_id", value: request.traceId },
  ];

  if (request.firewallRuleId) {
    rows.push({ label: "firewall_rule", value: request.firewallRuleId });
  }

  rows.push({ label: "why", value: request.why });

  // Counterfactuals in main output
  if (request.decision === "allow") {
    rows.push({
      label: "would_deny_if",
      value: [
        `budget were below $${formatUsd(request.estimatedCostUsd)}`,
        `model were ${session.blockedPremiumModels[0] ?? "gpt-4.1"}`,
        "input contained an API key, SSN, or injection pattern",
      ],
    });
  } else {
    if (request.reasonCode === "model_not_allowed") {
      rows.push({
        label: "would_allow_if",
        value: `model changed to ${session.allowedModels[0] ?? "gpt-4.1-mini"}`,
      });
    }
    if (request.reasonCode === "budget_exceeded") {
      rows.push({
        label: "would_allow_if",
        value: "budget increased or input shortened to reduce token count",
      });
    }
    if (request.reasonCode === "firewall_blocked") {
      rows.push({
        label: "would_allow_if",
        value: "sensitive content removed from prompt input",
      });
    }
  }

  rows.push({
    label: "learn_more",
    value: "https://docs.keelapi.com/execution-spine",
  });

  return {
    session,
    artifact: {
      commandName: "explain",
      tone: request.decision === "allow" ? "info" : "denied",
      headline,
      rows,
      inspector: createExplainInspector(request, command.raw, session),
    },
  };
}

function handleTimeline(session: SessionState, command: ShellCommand): CommandRunResult {
  const request = requireRequest(session, command.positionals[0]);
  session.commandCount += 1;

  const blockedStage = request.lifecycle.find((s) => s.status === "blocked");
  const completedCount = request.lifecycle.filter((s) => s.status === "completed").length;
  const totalStages = request.lifecycle.length;

  const headline = blockedStage
    ? `blocked at stage ${request.lifecycle.indexOf(blockedStage) + 1} of ${totalStages} — ${blockedStage.stage} denied ${request.model}`
    : `${completedCount} of ${totalStages} stages completed — no blocks`;

  // Only show interesting stages in main output (skip always-completed bookends)
  const interestingStages = request.lifecycle.filter(
    (s) => s.status === "blocked" || ["permit", "firewall", "routing", "dispatch", "reconcile"].includes(s.stage),
  );

  return {
    session,
    artifact: {
      commandName: "timeline",
      tone: "info",
      headline,
      rows: [
        { label: "request_id", value: request.id },
        { label: "decision", value: request.decision },
        { label: "trace_id", value: request.traceId },
        {
          label: "stages",
          value: interestingStages.map(
            (stage) => `${stage.stage}: ${stage.status} — ${stage.detail}`,
          ),
        },
        {
          label: "learn_more",
          value: "https://docs.keelapi.com/execution-spine",
        },
      ],
      inspector: createTimelineInspector(request, command.raw),
    },
  };
}

function handleUsage(session: SessionState, command: ShellCommand): CommandRunResult {
  session.commandCount += 1;

  const denied = session.usage.deniedRequests;
  const total = session.usage.totalRequests;

  // Estimate cost avoided from denied requests (sum of estimated costs for denied)
  const deniedCostAvoided = session.requests
    .filter((r) => r.status === "denied")
    .reduce((sum, r) => sum + r.estimatedCostUsd, 0);

  const headline =
    total === 0
      ? "no requests yet"
      : denied > 0
        ? `${total} requests, ${denied} denied — $${formatUsd(deniedCostAvoided)} saved by governance`
        : `${total} requests, all allowed — $${formatUsd(session.usage.totalActualCostUsd)} total spend`;

  const rows: TerminalRow[] = [
    { label: "total_requests", value: String(total) },
    { label: "completed", value: String(session.usage.completedRequests) },
    { label: "denied", value: String(denied) },
    {
      label: "tokens",
      value: `${session.usage.totalInputTokens} in / ${session.usage.totalOutputTokens} out`,
    },
    {
      label: "cost_usd_micros",
      value: String(toMicros(session.usage.totalActualCostUsd)),
    },
    {
      label: "budget_remaining",
      value: `$${formatUsd(session.budgetUsdRemaining)} of $${formatUsd(session.budgetUsdTotal)} (${Math.round((1 - session.budgetUsdRemaining / session.budgetUsdTotal) * 100)}% used)`,
    },
  ];

  if (deniedCostAvoided > 0) {
    rows.push({
      label: "cost_avoided",
      value: `$${formatUsd(deniedCostAvoided)} across ${denied} denied request${denied === 1 ? "" : "s"}`,
    });
  }

  rows.push({
    label: "without_keel",
    value:
      denied > 0
        ? `Without Keel, those ${denied} denied requests would have executed — adding $${formatUsd(deniedCostAvoided)} with no audit trail.`
        : "Without Keel, you would have no record of spend or usage attribution.",
  });
  rows.push({
    label: "learn_more",
    value: "https://docs.keelapi.com/recipes/cost-controls",
  });

  return {
    session,
    artifact: {
      commandName: "usage",
      tone: "info",
      headline,
      rows,
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
        { label: "budget_remaining", value: `$${formatUsd(session.budgetUsdRemaining)}` },
        { label: "requests_remaining", value: String(session.requestsRemaining) },
        { label: "firewall", value: "active — 6 detection rules loaded" },
        { label: "mode", value: "deterministic sandbox restored" },
      ],
      inspector: createUsageInspector("keel sandbox reset", session),
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Router                                                             */
/* ------------------------------------------------------------------ */

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
