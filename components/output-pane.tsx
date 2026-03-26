"use client";

import type { KeyboardEvent, RefObject } from "react";

import type { WorkbenchEntry } from "@/lib/shell/types";

const KEEL_ASCII = ` ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
  +++++++++++++++++++++++++++
    +++++++++++++++++++++++++
    +++++++++++++++++++++++++
     ++++++++++++++++++++++++
      ++++++++++++++++++++++
      ++++++++++++++++++++++
      xxxxxxxxxxxxxxxxxxxxxx
       xxxxxxxxxxxxxxxxxxxxx
       xxxxxxxxxxxxxxxxxxxx
       xxxxxxxxxxxxxxxxxxxx
       xxxxxxxxxxxxxxxxxxxx
        xxxxxxxxxxxxxxxxxxx
        xxxxxxxxxxxxxxxxxx
        XXXXXXXXXXXXXXXXXX
        XXXXXXXXXXXXXXXXXX`;

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
    case "error":
      return "text-destructive";
    case "info":
      return "text-foreground";
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
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
      {entries.length === 0 ? (
        <div className="px-4 py-5 font-mono">
          <pre
            className="mx-auto w-fit text-[9px] leading-[1.3] text-muted-foreground/25 select-none"
            aria-hidden="true"
          >
            {KEEL_ASCII}
          </pre>
          <p className="mt-4 text-[12px] text-foreground">Welcome to Keel Shell!</p>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            Keel Shell is a browser-based shell for permit-driven AI governance.
            You can use it to explore execution control in sandbox mode:
          </p>
          <div className="mt-3 space-y-1">
            {starterCommands.map((command) => (
              <button
                key={command}
                type="button"
                onClick={() => onPrefillCommand(command)}
                className="flex w-full items-baseline gap-2 py-0.5 text-left text-[12px] text-primary transition hover:text-foreground"
              >
                <span className="shrink-0 text-muted-foreground">—</span>
                <span className="min-w-0 break-all">{command}</span>
                <span className="shrink-0 text-muted-foreground">▸</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div>
          {entries.map((entry) => {
            const isSelected = entry.id === selectedEntryId;

            return (
              <article
                key={entry.id}
                onClick={() => onSelectEntry(entry.id)}
                onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectEntry(entry.id);
                  }
                }}
                role="button"
                tabIndex={0}
                className={`border-b border-border/70 px-4 py-1.5 text-left outline-none transition ${
                  isSelected ? "bg-foreground/[0.03]" : "hover:bg-foreground/[0.015]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 font-mono text-[13px] text-foreground">
                    <span className="mr-2 text-muted-foreground">›</span>
                    <span className="break-all">{entry.command}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="hidden font-mono text-[10px] text-muted-foreground sm:block">
                      {new Date(entry.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCopyCommand(entry.command);
                      }}
                      className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition hover:text-foreground"
                    >
                      {copiedCommand === entry.command ? "copied" : "copy"}
                    </button>
                  </div>
                </div>

                <div className={`mt-1 font-mono text-[12px] ${toneClasses(entry.artifact.tone)}`}>
                  {entry.artifact.headline}
                </div>

                <div className="mt-1 grid gap-y-0.5 font-mono text-[12px] leading-[1.15rem] text-muted-foreground">
                  {entry.artifact.rows.map((row) => (
                    <div
                      key={`${entry.id}-${row.label}`}
                      className="grid gap-1.5 sm:grid-cols-[124px_minmax(0,1fr)]"
                    >
                      <div className="text-[11px]">{row.label}</div>
                      <pre className="whitespace-pre-wrap break-words text-foreground">
                        {renderValue(row.value)}
                      </pre>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}

          {pendingCommand ? (
            <div className="border-b border-border/70 px-4 py-1.5">
              <div className="font-mono text-[13px] text-foreground">
                <span className="mr-2 text-muted-foreground">›</span>
                <span className="break-all">{pendingCommand}</span>
              </div>
              <div className="mt-1 font-mono text-[10px] text-primary">
                evaluating governance path...
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
