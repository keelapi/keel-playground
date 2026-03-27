"use client";

import type { ReactNode } from "react";

import { StageTimeline } from "@/components/stage-timeline";
import { formatUsd } from "@/lib/shell/sessionState";
import type { GovernanceInspectorState } from "@/lib/shell/types";

type GovernanceInspectorProps = {
  inspector: GovernanceInspectorState | null;
  onQuickAction: (command: string, label: string) => void;
  copiedCommand: string | null;
};

function renderBudget(value?: number) {
  if (value === undefined) {
    return "n/a";
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
      <aside className="flex h-full min-h-0 flex-col">
        <div className="border-b border-border/80 px-3 py-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            governance inspector
          </div>
        </div>
        <div className="px-3 py-3 font-mono text-[11px] leading-5 text-muted-foreground">
          Select a session row to inspect permit evidence, policy resolution, routing, spend, and lifecycle state.
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border/80 px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              governance inspector
            </div>
            <div className="mt-1 text-[12px] text-foreground">{inspector.title}</div>
            <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {inspector.subtitle}
            </div>
          </div>
          {inspector.decision ? (
            <div
              className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ${
                inspector.decision === "allow"
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              {inspector.decision}
            </div>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Actions">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {inspector.quickActions.map((action) => (
              <button
                key={`${action.label}-${action.command}`}
                type="button"
                onClick={() => onQuickAction(action.command, action.label)}
                className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition hover:text-foreground"
              >
                {action.label === "Copy command" && copiedCommand === action.command
                  ? "Copied"
                  : action.label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Evidence">
          <DefinitionList
            rows={[
              ["request id", inspector.requestId ?? "n/a"],
              ["permit id", inspector.permitId ?? "n/a"],
              ["policy", inspector.matchedPolicy ?? "n/a"],
              ["provider", inspector.providerResolved ?? "not resolved"],
              ["model", inspector.modelResolved ?? "not resolved"],
              ["budget before", renderBudget(inspector.budgetBeforeUsd)],
              ["budget after", renderBudget(inspector.budgetAfterUsd)],
              ["trace", inspector.traceId ?? "n/a"],
            ]}
          />
        </Section>

        {inspector.why?.length ? (
          <Section title="Reasoning">
            <ul className="space-y-1">
              {inspector.why.map((item) => (
                <li key={item} className="text-[11px] leading-5 text-foreground">
                  {item}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {inspector.usage ? (
          <Section title="Usage">
            <DefinitionList
              rows={[
                ["input tokens", valueOrNA(inspector.usage.inputTokens)],
                ["output tokens", valueOrNA(inspector.usage.outputTokens)],
                [
                  "estimated cost",
                  inspector.usage.estimatedCostUsd !== undefined
                    ? `$${formatUsd(inspector.usage.estimatedCostUsd)}`
                    : "n/a",
                ],
                [
                  "actual cost",
                  inspector.usage.actualCostUsd !== undefined
                    ? `$${formatUsd(inspector.usage.actualCostUsd)}`
                    : "n/a",
                ],
                ["total requests", valueOrNA(inspector.usage.totalRequests)],
                ["completed", valueOrNA(inspector.usage.completedRequests)],
                ["denied", valueOrNA(inspector.usage.deniedRequests)],
                [
                  "ledger total",
                  inspector.usage.totalActualCostUsd !== undefined
                    ? `$${formatUsd(inspector.usage.totalActualCostUsd)}`
                    : "n/a",
                ],
              ]}
            />
          </Section>
        ) : null}

        {inspector.summaryRows?.length ? (
          <Section title="Notes">
            <DefinitionList
              rows={inspector.summaryRows.map((row) => [
                row.label,
                Array.isArray(row.value) ? row.value.join(", ") : String(row.value),
              ])}
            />
          </Section>
        ) : null}

        {inspector.lifecycle?.length ? (
          <Section title="Lifecycle">
            <StageTimeline stages={inspector.lifecycle} />
          </Section>
        ) : null}

        {inspector.ungoverned ? (
          <Section title="Ungoverned behavior">
            <p className="text-[11px] leading-5 text-destructive/80">
              {inspector.ungoverned}
            </p>
          </Section>
        ) : null}

        {inspector.learnMoreUrl ? (
          <Section title="Learn more">
            <a
              href={inspector.learnMoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11px] text-primary underline decoration-primary/40 underline-offset-2 transition hover:decoration-primary"
            >
              {inspector.learnMoreUrl}
            </a>
          </Section>
        ) : null}
      </div>
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border/70 px-3 py-2">
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </div>
      {children}
    </section>
  );
}

function DefinitionList({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="space-y-0.5">
      {rows.map(([label, value]) => (
        <div key={`${label}-${value}`} className="grid grid-cols-[92px_minmax(0,1fr)] gap-1.5">
          <dt className="font-mono text-[11px] text-muted-foreground">{label}</dt>
          <dd className="break-words font-mono text-[11px] text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function valueOrNA(value: number | undefined) {
  return value === undefined ? "n/a" : String(value);
}
