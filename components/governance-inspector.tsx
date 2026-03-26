"use client";

import { StageTimeline } from "@/components/stage-timeline";
import { formatUsd } from "@/lib/shell/sessionState";
import type { GovernanceInspectorState } from "@/lib/shell/types";

type GovernanceInspectorProps = {
  inspector: GovernanceInspectorState | null;
  onQuickAction: (command: string, label: string) => void;
  copiedCommand: string | null;
};

function DecisionBadge({ decision }: { decision: GovernanceInspectorState["decision"] }) {
  if (!decision) {
    return (
      <span className="rounded-md border border-border bg-secondary px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Structured view
      </span>
    );
  }

  const decisionClasses =
    decision === "allow"
      ? "border-primary/30 bg-primary/10 text-primary"
      : "border-destructive/30 bg-destructive/10 text-destructive";

  return (
    <span className={`rounded-md border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${decisionClasses}`}>
      {decision}
    </span>
  );
}

function renderBudget(value?: number) {
  if (value === undefined) {
    return "Not applicable";
  }

  return `$${formatUsd(value)}`;
}

export function GovernanceInspector({
  inspector,
  onQuickAction,
  copiedCommand,
}: GovernanceInspectorProps) {
  if (!inspector) {
    return (
      <aside className="rounded-lg border border-border/70 bg-card/35 p-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          Governance Inspector
        </div>
        <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">
          Structured decision view
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Select a command result to inspect allow or deny decisions, matched policy,
          budget movement, resolved route, and the full Keel governance spine.
        </p>
        <div className="mt-4 border-l border-border pl-3 text-sm text-muted-foreground">
          The inspector is intentionally separate from raw terminal output so developers can
          move between CLI-like interaction and structured explanation without losing trust in
          what happened.
        </div>
      </aside>
    );
  }

  return (
    <aside className="overflow-hidden rounded-lg border border-border/70 bg-card/35">
      <div className="border-b border-border/70 px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Governance Inspector
            </div>
            <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">
              {inspector.title}
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{inspector.subtitle}</p>
          </div>
          <DecisionBadge decision={inspector.decision} />
        </div>
      </div>

      <div className="max-h-[calc(100vh-11rem)] space-y-5 overflow-y-auto px-4 py-4">
        {inspector.quickActions.length > 0 ? (
          <div>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Quick actions
            </div>
            <div className="flex flex-wrap gap-2">
              {inspector.quickActions.map((action) => (
                <button
                  key={`${action.label}-${action.command}`}
                  type="button"
                  onClick={() => onQuickAction(action.command, action.label)}
                  className="px-0.5 py-0.5 text-[11px] font-medium text-muted-foreground transition hover:text-primary"
                >
                  {action.label === "Copy command" && copiedCommand === action.command
                    ? "Copied"
                    : action.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {(inspector.requestId || inspector.permitId || inspector.traceId) ? (
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            {inspector.requestId ? (
              <InfoBlock label="Request id" value={inspector.requestId} />
            ) : null}
            {inspector.permitId ? (
              <InfoBlock label="Permit id" value={inspector.permitId} />
            ) : null}
            {inspector.traceId ? (
              <InfoBlock label="Trace id" value={inspector.traceId} />
            ) : null}
            {inspector.matchedPolicy ? (
              <InfoBlock label="Matched policy" value={inspector.matchedPolicy} />
            ) : null}
          </div>
        ) : null}

        {inspector.why?.length ? (
          <div>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Why
            </div>
            <div className="space-y-2 border-l border-border pl-3">
              {inspector.why.map((item) => (
                <div key={item} className="text-sm leading-6 text-foreground">
                  {item}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Governance snapshot
          </div>
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            <InfoBlock label="Budget before" value={renderBudget(inspector.budgetBeforeUsd)} />
            <InfoBlock label="Budget after" value={renderBudget(inspector.budgetAfterUsd)} />
            <InfoBlock
              label="Provider resolved"
              value={inspector.providerResolved ?? "Not resolved"}
            />
            <InfoBlock label="Model resolved" value={inspector.modelResolved ?? "Not resolved"} />
          </div>
        </div>

        {inspector.usage ? (
          <div>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Usage and cost
            </div>
            <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {inspector.usage.inputTokens !== undefined ? (
                <InfoBlock label="Input tokens" value={String(inspector.usage.inputTokens)} />
              ) : null}
              {inspector.usage.outputTokens !== undefined ? (
                <InfoBlock label="Output tokens" value={String(inspector.usage.outputTokens)} />
              ) : null}
              {inspector.usage.estimatedCostUsd !== undefined ? (
                <InfoBlock
                  label="Estimated cost"
                  value={`$${formatUsd(inspector.usage.estimatedCostUsd)}`}
                />
              ) : null}
              {inspector.usage.actualCostUsd !== undefined ? (
                <InfoBlock
                  label="Actual cost"
                  value={`$${formatUsd(inspector.usage.actualCostUsd)}`}
                />
              ) : null}
              {inspector.usage.totalRequests !== undefined ? (
                <InfoBlock label="Total requests" value={String(inspector.usage.totalRequests)} />
              ) : null}
              {inspector.usage.completedRequests !== undefined ? (
                <InfoBlock
                  label="Completed requests"
                  value={String(inspector.usage.completedRequests)}
                />
              ) : null}
              {inspector.usage.deniedRequests !== undefined ? (
                <InfoBlock
                  label="Denied requests"
                  value={String(inspector.usage.deniedRequests)}
                />
              ) : null}
              {inspector.usage.totalActualCostUsd !== undefined ? (
                <InfoBlock
                  label="Ledger total"
                  value={`$${formatUsd(inspector.usage.totalActualCostUsd)}`}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {inspector.summaryRows?.length ? (
          <div>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Structured notes
            </div>
            <div className="space-y-1 border-t border-border/70">
              {inspector.summaryRows.map((row) => (
                <div
                  key={`${row.label}-${String(row.value)}`}
                  className="grid gap-2 border-b border-border/70 py-2 text-sm sm:grid-cols-[120px_minmax(0,1fr)]"
                >
                  <div className="text-muted-foreground">{row.label}</div>
                  <div className="break-words text-foreground">
                    {Array.isArray(row.value) ? row.value.join(", ") : String(row.value)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {inspector.lifecycle?.length ? (
          <div>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Lifecycle spine
            </div>
            <StageTimeline stages={inspector.lifecycle} />
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-border/70 py-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-[12px] text-foreground">{value}</div>
    </div>
  );
}
