"use client";

import type { KeyboardEvent, RefObject } from "react";

import type { WorkbenchEntry } from "@/lib/shell/types";

type OutputPaneProps = {
  entries: WorkbenchEntry[];
  selectedEntryId: string | null;
  pendingCommand: string | null;
  copiedCommand: string | null;
  onSelectEntry: (entryId: string) => void;
  onCopyCommand: (command: string) => void;
  onPrefillCommand: (command: string) => void;
  starterCommands: string[];
  scrollRef: RefObject<HTMLDivElement | null>;
};

function toneClasses(tone: WorkbenchEntry["artifact"]["tone"]) {
  switch (tone) {
    case "success":
      return "text-primary";
    case "denied":
      return "text-destructive";
    case "error":
      return "text-destructive";
    case "info":
      return "text-[#8cb7ff]";
  }
}

function renderValue(value: WorkbenchEntry["artifact"]["rows"][number]["value"]) {
  if (Array.isArray(value)) {
    return value.join("\n");
  }

  return String(value);
}

export function OutputPane({
  entries,
  selectedEntryId,
  pendingCommand,
  copiedCommand,
  onSelectEntry,
  onCopyCommand,
  onPrefillCommand,
  starterCommands,
  scrollRef,
}: OutputPaneProps) {
  return (
    <section className="overflow-hidden bg-[#07111f]">
      <div className="border-b border-white/6 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Command surface
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Approved grammar only. Deterministic sandbox. No live providers or system access.
            </p>
          </div>
          <div className="hidden font-mono text-[11px] text-muted-foreground xl:block">
            enter run • tab complete • up/down history
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="h-[640px] overflow-y-auto px-4 py-3">
        {entries.length === 0 ? (
          <div className="mx-auto max-w-2xl px-2 py-8 text-left">
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Empty console
            </div>
            <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-foreground">
              Learn governance before execution
            </h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Start with a scenario on the left or run one of the approved commands below.
              Each result produces both terminal output and a structured governance view.
            </p>
            <div className="mt-5 space-y-1.5">
              {starterCommands.map((command) => (
                <button
                  key={command}
                  type="button"
                  onClick={() => onPrefillCommand(command)}
                  className="block w-full border border-white/6 bg-white/[0.02] px-3 py-2 text-left font-mono text-xs text-foreground transition hover:border-primary/35 hover:bg-primary/5"
                >
                  {command}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => {
              const isSelected = entry.id === selectedEntryId;

              return (
                <div
                  key={entry.id}
                  onClick={() => onSelectEntry(entry.id)}
                  onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectEntry(entry.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className={`block w-full border-l-2 border-b border-white/6 px-3 py-3 text-left transition ${
                    isSelected
                      ? "border-l-primary bg-white/[0.035]"
                      : "border-l-transparent hover:border-l-white/15 hover:bg-white/[0.018]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-mono text-sm text-foreground">
                        <span className="text-muted-foreground">sandbox-demo</span>
                        <span className="mx-2 text-primary">$</span>
                        <span className="break-all">{entry.command}</span>
                      </div>
                      <div className={`mt-2 text-sm font-medium ${toneClasses(entry.artifact.tone)}`}>
                        {entry.artifact.headline}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="hidden text-xs text-muted-foreground sm:block">
                        {new Date(entry.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      {isSelected ? (
                        <span className="font-mono text-[11px] text-primary">selected</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5 font-mono text-[12px] leading-6 text-muted-foreground">
                    {entry.artifact.rows.map((row) => (
                      <div key={`${entry.id}-${row.label}`} className="grid gap-2 sm:grid-cols-[138px_minmax(0,1fr)]">
                        <div>{row.label}</div>
                        <pre className="whitespace-pre-wrap break-words text-foreground">
                          {renderValue(row.value)}
                        </pre>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-[11px] text-muted-foreground">
                      Select this result to inspect governance details.
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCopyCommand(entry.command);
                      }}
                      className="px-1.5 py-1 text-[11px] text-muted-foreground transition hover:text-primary"
                    >
                      {copiedCommand === entry.command ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              );
            })}

            {pendingCommand ? (
              <div className="border-l-2 border-l-primary border-b border-white/6 px-3 py-3">
                <div className="font-mono text-sm text-foreground">
                  <span className="text-muted-foreground">sandbox-demo</span>
                  <span className="mx-2 text-primary">$</span>
                  <span className="break-all">{pendingCommand}</span>
                </div>
                <div className="mt-2 flex items-center gap-3 font-mono text-xs text-primary">
                  <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-primary" />
                  evaluating deterministic governance plan...
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
