import type { SessionState, WorkbenchScenario } from "@/lib/shell/types";

export const SCENARIO_LIBRARY: readonly WorkbenchScenario[] = [
  {
    id: "permit-first",
    title: "Permit before execution",
    category: "permits",
    description: "Show that governance resolves the permit before any simulated provider dispatch.",
    helperText: "Best first run. It demonstrates Keel's permit-first control plane without execution.",
    command:
      'keel permits create --provider openai --model gpt-4.1-mini --input "Summarize this support ticket"',
    recommended: true,
  },
  {
    id: "governed-execution",
    title: "Governed execution",
    category: "execution",
    description: "Route an allowed request through policy, budget, execution, accounting, and audit.",
    helperText: "This is the closest end-to-end view of Keel's governed execution path.",
    command:
      'keel execute --provider openai --model gpt-4.1-mini --input "Write a calm refund reply"',
  },
  {
    id: "policy-denial",
    title: "Policy denial",
    category: "execution",
    description: "Try a premium model that the sandbox policy explicitly blocks.",
    helperText: "Useful for validating how Keel denies before dispatch and explains why.",
    command:
      'keel execute --provider openai --model gpt-4.1 --input "Use the premium model for this task"',
  },
  {
    id: "budget-denial",
    title: "Budget denial",
    category: "execution",
    description: "Spend enough of the deterministic budget that the next request is denied on cost.",
    helperText: "Run after one or two allowed executions to make the budget check visibly fail.",
    command:
      'keel execute --provider openai --model gpt-4.1-mini --input "Draft a detailed onboarding checklist with risk controls, rollback notes, and explicit handoff steps for each phase"',
  },
  {
    id: "explain-latest",
    title: "Explain latest request",
    category: "explainability",
    description: "Inspect the decision path and matched policy for the latest request id.",
    helperText: "Prefills the latest request id if one exists in this local session.",
    command: (session) => `keel explain ${session.lastRequestId ?? "req_b71d9e"}`,
  },
  {
    id: "timeline-latest",
    title: "Replay timeline",
    category: "explainability",
    description: "Walk the full governance spine for the latest request.",
    helperText: "Maps each lifecycle stage from auth through audit for a single request.",
    command: (session) => `keel timeline ${session.lastRequestId ?? "req_b71d9e"}`,
  },
  {
    id: "usage-summary",
    title: "Usage and accounting",
    category: "accounting",
    description: "Review deterministic token and cost accounting across the sandbox session.",
    helperText: "Helpful after a few commands to understand budget burn and denial counts.",
    command: "keel usage",
  },
  {
    id: "reset-sandbox",
    title: "Reset sandbox",
    category: "sandbox",
    description: "Restore the deterministic session to the initial budget, limits, and ids.",
    helperText: "Use this to restart the demo flow without touching any live state.",
    command: "keel sandbox reset",
  },
] as const;

export function getScenarioById(
  scenarioId: string | null | undefined,
): WorkbenchScenario | undefined {
  if (!scenarioId) {
    return undefined;
  }

  return SCENARIO_LIBRARY.find((scenario) => scenario.id === scenarioId);
}

export function resolveScenarioCommand(
  scenario: WorkbenchScenario,
  session: SessionState,
): string {
  return typeof scenario.command === "function" ? scenario.command(session) : scenario.command;
}
