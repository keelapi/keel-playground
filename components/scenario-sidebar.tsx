"use client";

import type { WorkbenchScenario } from "@/lib/shell/types";

type ScenarioSidebarProps = {
  scenarios: readonly WorkbenchScenario[];
  activeScenarioId: string | null;
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
    <nav className="flex h-full min-h-0 flex-col overflow-y-auto py-3">
      {Object.entries(groupedScenarios).map(([category, categoryScenarios], groupIndex) => (
        <div key={category} className={groupIndex > 0 ? "mt-3" : ""}>
          <div className="mb-0.5 px-4 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            {categoryLabels[category as WorkbenchScenario["category"]]}
          </div>
          {categoryScenarios.map((scenario) => {
            const isActive = scenario.id === activeScenarioId;

            return (
              <button
                key={scenario.id}
                type="button"
                onClick={() => onSelectScenario(scenario.id)}
                className={`block w-full px-4 py-[7px] text-left text-[13px] leading-tight transition ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {scenario.title}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
