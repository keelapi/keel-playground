"use client";

import type { GovernanceStageState } from "@/lib/shell/types";

const stageLabels: Record<GovernanceStageState["stage"], string> = {
  auth: "Auth",
  authorization: "Authorization",
  freshness: "Freshness",
  policy: "Policy",
  budget: "Budget",
  firewall: "Firewall",
  routing: "Routing",
  execution: "Execution",
  "terminal-accounting": "Accounting",
  audit: "Audit",
};

function getStageClasses(status: GovernanceStageState["status"]) {
  switch (status) {
    case "completed":
      return "border-primary/30 bg-primary/10 text-primary";
    case "blocked":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "skipped":
      return "border-border bg-secondary/70 text-muted-foreground";
    case "pending":
      return "border-border bg-background text-muted-foreground";
  }
}

export function StageTimeline({
  stages,
}: {
  stages: GovernanceStageState[];
}) {
  return (
    <div className="space-y-2">
      {stages.map((stage, index) => (
        <div key={`${stage.stage}-${stage.timestamp}`} className="grid grid-cols-[18px_minmax(0,1fr)] gap-2.5">
          <div className="relative flex justify-center pt-1">
            <span
              className={`h-2.5 w-2.5 rounded-full border ${getStageClasses(stage.status)}`}
              aria-hidden="true"
            />
            {index < stages.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute top-4 h-[calc(100%+0.5rem)] w-px bg-border"
              />
            ) : null}
          </div>
          <div className="space-y-1 pb-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-foreground">
                {stageLabels[stage.stage]}
              </div>
              <div
                className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] ${getStageClasses(stage.status)}`}
              >
                {stage.status}
              </div>
            </div>
            <p className="text-[13px] leading-5 text-muted-foreground">{stage.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
