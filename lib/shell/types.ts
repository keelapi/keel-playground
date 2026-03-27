export const GOVERNANCE_STAGE_ORDER = [
  "auth",
  "normalize",
  "permit",
  "firewall",
  "routing",
  "dispatch",
  "reconcile",
  "emit",
] as const;

export type GovernanceStageId = (typeof GOVERNANCE_STAGE_ORDER)[number];
export type GovernanceStageStatus = "completed" | "blocked" | "skipped" | "pending";
export type ShellOutputTone = "success" | "denied" | "info" | "error";
export type PermitDecision = "allow" | "deny" | "challenge";
export type RequestStatus = "completed" | "denied";

export type CommandCategory =
  | "permits"
  | "execution"
  | "security"
  | "explainability"
  | "accounting"
  | "sandbox";

export type ShellCommandName =
  | "help"
  | "permits-create"
  | "execute"
  | "explain"
  | "timeline"
  | "usage"
  | "sandbox-reset";

export type CommandDefinition = {
  name: ShellCommandName;
  category: CommandCategory;
  tokens: readonly string[];
  syntax: string;
  description: string;
  examples: readonly string[];
  helperText: string;
  requiredFlags?: readonly string[];
  optionalFlags?: readonly string[];
  positionals?: readonly string[];
};

export type ShellCommand = {
  raw: string;
  name: ShellCommandName;
  flags: Record<string, string>;
  positionals: string[];
  definition: CommandDefinition;
};

export type TerminalValue = string | number | string[];

export type TerminalRow = {
  label: string;
  value: TerminalValue;
};

export type GovernanceStageState = {
  stage: GovernanceStageId;
  status: GovernanceStageStatus;
  timestamp: string;
  detail: string;
};

export type CommandQuickAction = {
  label: string;
  command: string;
};

export type GovernanceUsageSummary = {
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
  totalRequests?: number;
  completedRequests?: number;
  deniedRequests?: number;
  totalActualCostUsd?: number;
};

export type GovernanceInspectorState = {
  title: string;
  subtitle: string;
  decision?: PermitDecision;
  why?: string[];
  matchedPolicy?: string;
  budgetBeforeUsd?: number;
  budgetAfterUsd?: number;
  providerResolved?: string | null;
  modelResolved?: string | null;
  requestId?: string | null;
  permitId?: string | null;
  usage?: GovernanceUsageSummary;
  lifecycle?: GovernanceStageState[];
  traceId?: string;
  summaryRows?: TerminalRow[];
  ungoverned?: string;
  learnMoreUrl?: string;
  quickActions: CommandQuickAction[];
};

export type CommandArtifact = {
  commandName: ShellCommandName;
  tone: ShellOutputTone;
  headline: string;
  rows: TerminalRow[];
  inspector?: GovernanceInspectorState;
};

export type PermitReasonCode =
  | "policy_passed"
  | "model_not_allowed"
  | "budget_exceeded"
  | "provider_not_available"
  | "request_limit_reached"
  | "firewall_blocked";

export type PermitRecord = {
  id: string;
  decision: PermitDecision;
  reasonCode: PermitReasonCode;
  why: string[];
  matchedPolicy: string;
  model: string;
  provider: string;
  input: string;
  estimatedCostUsd: number;
  budgetBeforeUsd: number;
  budgetAfterUsd: number;
  firewallRuleId: string | null;
  firewallDetail: string | null;
  timestamp: string;
  lifecycle: GovernanceStageState[];
};

export type RequestRecord = {
  id: string;
  permitId: string;
  decision: PermitDecision;
  reasonCode: PermitReasonCode;
  why: string[];
  status: RequestStatus;
  provider: string;
  model: string;
  input: string;
  matchedPolicy: string;
  routing: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  budgetBeforeUsd: number;
  budgetAfterUsd: number;
  firewallRuleId: string | null;
  firewallDetail: string | null;
  traceId: string;
  timestamp: string;
  lifecycle: GovernanceStageState[];
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
  budgetUsdTotal: number;
  budgetUsdRemaining: number;
  requestLimit: number;
  requestsRemaining: number;
  allowedModels: string[];
  blockedPremiumModels: string[];
  providersAvailable: string[];
  permitCounter: number;
  requestCounter: number;
  traceCounter: number;
  eventCounter: number;
  commandCount: number;
  lastPermitId: string | null;
  lastRequestId: string | null;
  permits: PermitRecord[];
  requests: RequestRecord[];
  usage: UsageLedger;
};

export type CommandRunResult = {
  session: SessionState;
  artifact: CommandArtifact;
};

export type WorkbenchEntry = {
  id: string;
  command: string;
  artifact: CommandArtifact;
  createdAt: string;
};

export type WorkbenchScenario = {
  id: string;
  title: string;
  category: CommandCategory;
  description: string;
  helperText: string;
  command: string | ((session: SessionState) => string);
  recommended?: boolean;
};
