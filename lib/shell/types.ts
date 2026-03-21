export type ShellCommandName =
  | "help"
  | "sandbox-status"
  | "permits-create"
  | "execute"
  | "explain"
  | "timeline"
  | "usage"
  | "policy-show"
  | "budget-show"
  | "sandbox-reset"
  | "routing-preview";

export type ShellCommand = {
  raw: string;
  name: ShellCommandName;
  flags: Record<string, string>;
  positionals: string[];
};

export type ShellOutputTone = "success" | "denied" | "info" | "error";

export type ShellDetailValue = string | number | string[];

export type ShellOutput = {
  tone: ShellOutputTone;
  summary: string;
  details: Array<{
    label: string;
    value: ShellDetailValue;
  }>;
  isSystemNote?: boolean;
};

export type PermitDecision = "allowed" | "denied";
export type RequestStatus = "completed" | "denied";

export type TimelineStage =
  | "auth"
  | "normalize"
  | "permit"
  | "firewall"
  | "routing"
  | "dispatch"
  | "reconcile"
  | "ledger"
  | "emit";

export type TimelineEvent = {
  id: string;
  stage: TimelineStage;
  status: "completed" | "skipped";
  timestamp: string;
  detail: string;
};

export type PermitRecord = {
  id: string;
  decision: PermitDecision;
  reason: string;
  project: string;
  policy: string;
  model: string;
  provider: string | null;
  input: string;
  estimatedCostUsd: number;
  timestamp: string;
};

export type RequestRecord = {
  id: string;
  permitId: string;
  provider: string;
  model: string;
  input: string;
  decision: PermitDecision;
  reason: string;
  status: RequestStatus;
  routing: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  timestamp: string;
  timeline: TimelineEvent[];
  audit: {
    policy: string;
    project: string;
    traceId: string;
    actor: string;
  };
};

export type UsageLedger = {
  totalRequests: number;
  completedRequests: number;
  deniedRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalActualCostUsd: number;
};

export type SessionState = {
  project: string;
  policy: string;
  budgetUsdRemaining: number;
  allowedModels: string[];
  blockedPremiumModels: string[];
  providersAvailable: string[];
  requestsRemaining: number;
  permitCounter: number;
  requestCounter: number;
  eventCounter: number;
  traceCounter: number;
  commandCount: number;
  hasShownAllowedNote: boolean;
  hasShownDeniedNote: boolean;
  lastPermitId: string | null;
  lastRequestId: string | null;
  permits: PermitRecord[];
  requests: RequestRecord[];
  usage: UsageLedger;
};

export type ScenarioResult = {
  output: ShellOutput;
  auxiliaryOutputs?: ShellOutput[];
  session: SessionState;
};
