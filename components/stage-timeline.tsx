"use client";

import type { GovernanceStageState } from "@/lib/shell/types";

const stageLabels: Record<GovernanceStageState["stage"], string> = {
  auth: "auth",
  normalize: "normalize",
  permit: "permit",
  firewall: "firewall",
  routing: "routing",
  dispatch: "dispatch",
  reconcile: "reconcile",
  emit: "emit",
};

function statusClasses(status: GovernanceStageState["status"]) {
  switch (status) {
    case "completed":
      return "text-primary";
    case "blocked":
      return "text-destructive";
    case "skipped":
      return "text-muted-foreground";
    case "pending":
      return "text-muted-foreground";
  }
}

export function StageTimeline({ stages }: { stages: GovernanceStageState[] }) {
  return (
    <div className="space-y-0">
      {stages.map((stage, index) => (
        <div
          key={`${stage.stage}-${stage.timestamp}`}
          className="grid grid-cols-[12px_76px_72px_minmax(0,1fr)] gap-x-3 gap-y-0 border-b border-border/60 py-1"
        >
          <div className="relative">
            <span
              aria-hidden="true"
              className={`absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-current ${statusClasses(stage.status)}`}
            />
            {index < stages.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute left-[6px] top-3 h-[calc(100%+0.25rem)] w-px bg-border/80"
              />
            ) : null}
          </div>
          <div className="font-mono text-[11px] text-foreground">{stageLabels[stage.stage]}</div>
          <div className={`font-mono text-[10px] uppercase tracking-[0.12em] ${statusClasses(stage.status)}`}>
            {stage.status}
          </div>
          <div className="text-[11px] leading-[1.15rem] text-muted-foreground">{stage.detail}</div>
        </div>
      ))}
    </div>
  );
}
