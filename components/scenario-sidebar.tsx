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
  execution: "Execution",
  explainability: "Inspect",
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
    <aside className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border/80 px-3 py-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          preset index
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {Object.entries(groupedScenarios).map(([category, categoryScenarios]) => (
          <section key={category} className="mb-3">
            <div className="mb-1 px-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {categoryLabels[category as WorkbenchScenario["category"]]}
            </div>
            <div>
              {categoryScenarios.map((scenario) => {
                const isActive = scenario.id === activeScenarioId;
                const command = resolveScenarioCommand(scenario, session);

                return (
                  <button
                    key={scenario.id}
                    type="button"
                    onClick={() => onSelectScenario(scenario.id)}
                    className={`block w-full border-l px-2 py-1.5 text-left transition ${
                      isActive
                        ? "border-l-border bg-foreground/[0.03]"
                        : "border-l-transparent hover:border-l-border hover:bg-foreground/[0.02]"
                    }`}
                  >
                    <div className="truncate text-[12px] text-foreground">{scenario.title}</div>
                    <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                      {command}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] leading-4 text-muted-foreground">
                      {scenario.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
