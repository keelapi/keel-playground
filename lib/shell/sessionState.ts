import type { SessionState, UsageLedger } from "@/lib/shell/types";

const BASE_TIME_MS = Date.parse("2026-01-14T18:00:00.000Z");
const EVENT_INCREMENT_MS = 37_000;

const defaultUsage: UsageLedger = {
  totalRequests: 0,
  completedRequests: 0,
  deniedRequests: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalActualCostUsd: 0,
};

export function createInitialSessionState(): SessionState {
  return {
    project: "sandbox-demo",
    policy: "demo-default",
    budgetUsdRemaining: 0.02,
    allowedModels: ["gpt-4.1-mini", "claude-3.5-haiku"],
    blockedPremiumModels: ["gpt-4.1"],
    providersAvailable: ["openai", "anthropic"],
    requestsRemaining: 5,
    permitCounter: 0,
    requestCounter: 0,
    eventCounter: 0,
    traceCounter: 0,
    commandCount: 0,
    hasShownAllowedNote: false,
    hasShownDeniedNote: false,
    lastPermitId: null,
    lastRequestId: null,
    permits: [],
    requests: [],
    usage: { ...defaultUsage },
  };
}

export function formatUsd(amount: number): string {
  return amount.toFixed(4);
}

export function createPermitId(counter: number): string {
  return `permit_${createDeterministicHex(counter, 0x8f3a2c)}`;
}

export function createRequestId(counter: number): string {
  return `req_${createDeterministicHex(counter, 0xb71d9e)}`;
}

export function createEventId(counter: number): string {
  return `evt_${createDeterministicHex(counter, 0x21ac44)}`;
}

export function createTraceId(counter: number): string {
  return `trace_${createDeterministicHex(counter, 0x4cd290)}`;
}

export function nextTimestamp(eventCounter: number): string {
  return new Date(BASE_TIME_MS + eventCounter * EVENT_INCREMENT_MS).toISOString();
}

export function cloneSessionState(session: SessionState): SessionState {
  return {
    ...session,
    allowedModels: [...session.allowedModels],
    blockedPremiumModels: [...session.blockedPremiumModels],
    providersAvailable: [...session.providersAvailable],
    permits: session.permits.map((permit) => ({ ...permit })),
    requests: session.requests.map((request) => ({
      ...request,
      timeline: request.timeline.map((event) => ({ ...event })),
      audit: { ...request.audit },
    })),
    usage: { ...session.usage },
  };
}

function createDeterministicHex(counter: number, seed: number): string {
  const mixed = (seed + counter * 0x9e3779b1) >>> 0;
  const folded = ((mixed ^ (mixed >>> 16)) & 0xffffff) >>> 0;

  return folded.toString(16).padStart(6, "0");
}
