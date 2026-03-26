import type { SessionState, UsageLedger } from "@/lib/shell/types";

const BASE_TIME_MS = Date.parse("2026-01-14T18:00:00.000Z");
const EVENT_INCREMENT_MS = 29_000;

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
    budgetUsdTotal: 0.02,
    budgetUsdRemaining: 0.02,
    requestLimit: 5,
    requestsRemaining: 5,
    allowedModels: ["gpt-4.1-mini", "claude-3.5-haiku"],
    blockedPremiumModels: ["gpt-4.1"],
    providersAvailable: ["openai", "anthropic"],
    permitCounter: 0,
    requestCounter: 0,
    traceCounter: 0,
    eventCounter: 0,
    commandCount: 0,
    lastPermitId: null,
    lastRequestId: null,
    permits: [],
    requests: [],
    usage: { ...defaultUsage },
  };
}

export function cloneSessionState(session: SessionState): SessionState {
  return {
    ...session,
    allowedModels: [...session.allowedModels],
    blockedPremiumModels: [...session.blockedPremiumModels],
    providersAvailable: [...session.providersAvailable],
    permits: session.permits.map((permit) => ({
      ...permit,
      why: [...permit.why],
      lifecycle: permit.lifecycle.map((stage) => ({ ...stage })),
    })),
    requests: session.requests.map((request) => ({
      ...request,
      why: [...request.why],
      lifecycle: request.lifecycle.map((stage) => ({ ...stage })),
    })),
    usage: { ...session.usage },
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

export function createTraceId(counter: number): string {
  return `trace_${createDeterministicHex(counter, 0x4cd290)}`;
}

export function nextTimestamp(eventCounter: number): string {
  return new Date(BASE_TIME_MS + eventCounter * EVENT_INCREMENT_MS).toISOString();
}

function createDeterministicHex(counter: number, seed: number): string {
  const mixed = (seed + counter * 0x9e3779b1) >>> 0;
  const folded = ((mixed ^ (mixed >>> 16)) & 0xffffff) >>> 0;

  return folded.toString(16).padStart(6, "0");
}
