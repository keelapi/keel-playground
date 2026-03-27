"use client";

import { formatUsd } from "@/lib/shell/sessionState";
import type { SessionState, WorkbenchScenario } from "@/lib/shell/types";

type ScenarioSidebarProps = {
  scenarios: readonly WorkbenchScenario[];
  activeScenarioId: string | null;
  onSelectScenario: (scenarioId: string) => void;
  session: SessionState;
};

const categoryLabels: Record<WorkbenchScenario["category"], string> = {
  permits: "Permit-first",
  execution: "Execution",
  security: "Security",
  explainability: "Inspect",
  accounting: "Accounting",
  sandbox: "Sandbox",
};

export function ScenarioSidebar({
  scenarios,
  activeScenarioId,
  onSelectScenario,
  session,
}: ScenarioSidebarProps) {
  // Split sandbox scenarios out so we can render them in their own section
  const mainScenarios = scenarios.filter((s) => s.category !== "sandbox");
  const sandboxScenarios = scenarios.filter((s) => s.category === "sandbox");

  const grouped = mainScenarios.reduce<Record<string, WorkbenchScenario[]>>(
    (groups, scenario) => {
      groups[scenario.category] = [...(groups[scenario.category] ?? []), scenario];
      return groups;
    },
    {},
  );

  const budgetPct = Math.round(
    (1 - session.budgetUsdRemaining / session.budgetUsdTotal) * 100,
  );

  function renderScenarioButton(scenario: WorkbenchScenario) {
    const isActive = scenario.id === activeScenarioId;

    return (
      <button
        key={scenario.id}
        type="button"
        onClick={() => onSelectScenario(scenario.id)}
        className={`block w-full px-4 py-[7px] text-left text-[13px] leading-tight transition ${
          scenario.category === "sandbox"
            ? isActive
              ? "text-destructive"
              : "text-destructive/70 hover:text-destructive"
            : isActive
              ? "text-primary"
              : "text-primary/80 hover:text-primary"
        }`}
      >
        {scenario.title}
      </button>
    );
  }

  return (
    <nav className="flex h-full min-h-0 flex-col overflow-y-auto py-3">
      {/* Main scenario groups */}
      {Object.entries(grouped).map(([category, categoryScenarios], groupIndex) => (
        <div key={category} className={groupIndex > 0 ? "mt-3" : ""}>
          <div className="mb-0.5 px-4 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            {categoryLabels[category as WorkbenchScenario["category"]]}
          </div>
          {categoryScenarios.map(renderScenarioButton)}
        </div>
      ))}

      {/* Session state */}
      <div className="mt-6 border-t border-border/50 px-4 pt-4">
        <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          Session
        </div>
        <dl className="space-y-1.5">
          <div className="flex justify-between">
            <dt className="font-mono text-[11px] text-muted-foreground">budget</dt>
            <dd className="font-mono text-[11px] text-foreground">
              ${formatUsd(session.budgetUsdRemaining)}
              <span className="ml-1 text-muted-foreground/60">{budgetPct}%</span>
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="font-mono text-[11px] text-muted-foreground">requests</dt>
            <dd className="font-mono text-[11px] text-foreground">{session.requestsRemaining} left</dd>
          </div>
          {session.usage.deniedRequests > 0 ? (
            <div className="flex justify-between">
              <dt className="font-mono text-[11px] text-muted-foreground">denied</dt>
              <dd className="font-mono text-[11px] text-destructive">{session.usage.deniedRequests}</dd>
            </div>
          ) : null}
          {session.usage.completedRequests > 0 ? (
            <div className="flex justify-between">
              <dt className="font-mono text-[11px] text-muted-foreground">spend</dt>
              <dd className="font-mono text-[11px] text-foreground">${formatUsd(session.usage.totalActualCostUsd)}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {/* Sandbox */}
      {sandboxScenarios.length > 0 ? (
        <div className="mt-4 border-t border-border/50 pt-4">
          <div className="mb-0.5 px-4 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            Sandbox
          </div>
          {sandboxScenarios.map(renderScenarioButton)}
        </div>
      ) : null}

      {/* Docs */}
      <div className="mt-4 border-t border-border/50 px-4 pt-4">
        <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          Docs
        </div>
        <div className="space-y-1">
          <a
            href="https://docs.keelapi.com/quickstart"
            className="block font-mono text-[11px] text-muted-foreground transition hover:text-foreground"
          >
            Quickstart →
          </a>
          <a
            href="https://docs.keelapi.com/permits"
            className="block font-mono text-[11px] text-muted-foreground transition hover:text-foreground"
          >
            Permits →
          </a>
          <a
            href="https://docs.keelapi.com/security"
            className="block font-mono text-[11px] text-muted-foreground transition hover:text-foreground"
          >
            Security →
          </a>
          <a
            href="https://docs.keelapi.com/api-reference"
            className="block font-mono text-[11px] text-muted-foreground transition hover:text-foreground"
          >
            API Reference →
          </a>
        </div>
      </div>
    </nav>
  );
}
