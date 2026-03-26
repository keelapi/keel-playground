"use client";

import { resolveScenarioCommand } from "@/lib/shell/scenarios";
import type { SessionState, WorkbenchScenario } from "@/lib/shell/types";

type ScenarioSidebarProps = {
  scenarios: readonly WorkbenchScenario[];
  activeScenarioId: string | null;
  session: SessionState;
  onSelectScenario: (scenarioId: string) => void;
};

const categoryLabels: Record<WorkbenchScenario["category"], string> = {
  permits: "Permit-first",
  execution: "Governed execution",
  explainability: "Explainability",
  accounting: "Accounting",
  sandbox: "Sandbox",
};

export function ScenarioSidebar({
  scenarios,
  activeScenarioId,
  session,
  onSelectScenario,
}: ScenarioSidebarProps) {
  const groupedScenarios = scenarios.reduce<Record<string, WorkbenchScenario[]>>(
    (groups, scenario) => {
      groups[scenario.category] = [...(groups[scenario.category] ?? []), scenario];
      return groups;
    },
    {},
  );

  return (
    <aside className="overflow-hidden rounded-lg border border-border/70 bg-card/35">
      <div className="border-b border-border/70 px-3 py-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          Scenario presets
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Prefill approved commands, then run from the console.
        </p>
      </div>

      <div className="max-h-[calc(100vh-11rem)] space-y-4 overflow-y-auto px-2 py-3">
        {Object.entries(groupedScenarios).map(([category, categoryScenarios]) => (
          <div key={category}>
            <div className="mb-1.5 px-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              {categoryLabels[category as WorkbenchScenario["category"]]}
            </div>
            <div className="space-y-1">
              {categoryScenarios.map((scenario) => {
                const isActive = scenario.id === activeScenarioId;

                return (
                  <button
                    key={scenario.id}
                    type="button"
                    onClick={() => onSelectScenario(scenario.id)}
                    className={`w-full rounded-md border-l px-2.5 py-2 text-left transition ${
                      isActive
                        ? "border-primary bg-primary/8 text-foreground"
                        : "border-transparent text-foreground hover:border-border hover:bg-background/40"
                    }`}
                  >
                    <div className="text-sm font-medium leading-5">{scenario.title}</div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {scenario.description}
                    </p>
                    <div className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
                      {resolveScenarioCommand(scenario, session)}
                    </div>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      {scenario.helperText}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
