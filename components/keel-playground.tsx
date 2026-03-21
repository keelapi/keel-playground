"use client";

import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { createInitialSessionState, formatUsd } from "@/lib/shell/sessionState";
import { runShellScenario } from "@/lib/shell/scenarios";
import type { SessionState, ShellOutput, ShellOutputTone } from "@/lib/shell/types";

const SESSION_STORAGE_KEY = "keel-playground-shell-session";
const UI_STATE_VERSION = 2;

const presetScenarios = [
  {
    label: "Create a permit",
    description: "See permit-first evaluation before execution.",
    command:
      'keel permits create --model gpt-4.1-mini --input "Summarize this support ticket"',
  },
  {
    label: "Run governed execution",
    description: "Resolve routing, execute, and post ledger usage.",
    command:
      'keel execute --provider openai --model gpt-4.1-mini --input "Write a calm refund reply"',
  },
  {
    label: "Trigger model denial",
    description: "Show premium model policy enforcement.",
    command:
      'keel execute --provider openai --model gpt-4.1 --input "Use premium model"',
  },
  {
    label: "Trigger budget denial",
    description: "Spend the sandbox down, then deny on budget.",
    command:
      'keel execute --provider openai --model gpt-4.1-mini --input "Draft a detailed onboarding checklist for a multi-step migration with explicit handoff notes and risk controls for each step."',
  },
  {
    label: "Explain a request",
    description: "Inspect why the last request was allowed or denied.",
    command: "keel explain req_b71d9e",
  },
  {
    label: "View timeline replay",
    description: "Replay the last governed request lifecycle.",
    command: "keel timeline req_b71d9e",
  },
  {
    label: "View usage summary",
    description: "Inspect accounting, requests, and remaining budget.",
    command: "keel usage",
  },
  {
    label: "Reset sandbox",
    description: "Restore the default deterministic session.",
    command: "keel sandbox reset",
  },
];

type TerminalEntry = {
  id: string;
  command: string;
  output: ShellOutput;
};

type StoredUiState = {
  version: number;
  session: SessionState;
  terminalEntries: TerminalEntry[];
  history: string[];
};

const initialTerminalEntries: TerminalEntry[] = [];

function getPromptToneClasses(tone: ShellOutputTone): string {
  switch (tone) {
    case "success":
      return "text-keel-success";
    case "denied":
    case "error":
      return "text-destructive";
    case "info":
      return "text-primary";
  }
}

function getEntryBorderClasses(tone: ShellOutputTone): string {
  switch (tone) {
    case "success":
      return "border-keel-success/20";
    case "denied":
    case "error":
      return "border-destructive/20";
    case "info":
      return "border-border";
  }
}

function readStoredUiState(): StoredUiState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(SESSION_STORAGE_KEY);

    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as StoredUiState;

    if (parsed.version !== UI_STATE_VERSION) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function renderValue(value: string | number | string[]) {
  if (Array.isArray(value)) {
    return <span className="text-foreground">{value.join(", ")}</span>;
  }

  return <span className="text-foreground">{String(value)}</span>;
}

export function KeelPlayground() {
  const [session, setSession] = useState<SessionState>(createInitialSessionState);
  const [terminalEntries, setTerminalEntries] =
    useState<TerminalEntry[]>(initialTerminalEntries);
  const [commandInput, setCommandInput] = useState("keel execute --provider openai --model gpt-4.1-mini --input \"Write a calm refund reply\"");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const shellScrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hasLoadedSessionRef = useRef(false);

  useEffect(() => {
    const storedUiState = readStoredUiState();

    if (storedUiState) {
      setSession(storedUiState.session);
      setTerminalEntries(storedUiState.terminalEntries);
      setHistory(storedUiState.history);
    } else {
      const freshSession = createInitialSessionState();
      const result = runShellScenario(freshSession, "keel sandbox status");

      setSession(result.session);
      setTerminalEntries([
        {
          id: "entry-1",
          command: "keel sandbox status",
          output: result.output,
        },
      ]);
      setHistory(["keel sandbox status"]);
    }

    hasLoadedSessionRef.current = true;
  }, []);

  useEffect(() => {
    if (!hasLoadedSessionRef.current) {
      return;
    }

    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        version: UI_STATE_VERSION,
        session,
        terminalEntries,
        history,
      } satisfies StoredUiState),
    );
  }, [history, session, terminalEntries]);

  useEffect(() => {
    const viewport = shellScrollRef.current;

    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [terminalEntries]);

  function pushTerminalEntry(command: string, output: ShellOutput) {
    setTerminalEntries((currentEntries) => [
      ...currentEntries,
      {
        id: `entry-${currentEntries.length + 1}`,
        command,
        output,
      },
    ]);
  }

  function handleRunCommand(rawCommand: string) {
    const trimmedCommand = rawCommand.trim();

    if (!trimmedCommand) {
      return;
    }

    const result = runShellScenario(session, trimmedCommand);
    setSession(result.session);
    pushTerminalEntry(trimmedCommand, result.output);
    result.auxiliaryOutputs?.forEach((output) => {
      pushTerminalEntry(trimmedCommand, output);
    });
    setHistory((currentHistory) => [...currentHistory, trimmedCommand]);
    setHistoryIndex(null);
    setCommandInput("");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    handleRunCommand(commandInput);
  }

  function handlePresetCommand(command: string) {
    const nextCommand =
      command === "keel timeline req_b71d9e"
        ? `keel timeline ${session.lastRequestId ?? "req_b71d9e"}`
        : command === "keel explain req_b71d9e"
          ? `keel explain ${session.lastRequestId ?? "req_b71d9e"}`
        : command;

    setCommandInput(nextCommand);
    setHistoryIndex(null);
    inputRef.current?.focus();
  }

  function handleResetSession() {
    handleRunCommand("keel sandbox reset");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const nextIndex =
        historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);

      setHistoryIndex(nextIndex);
      setCommandInput(history[nextIndex] ?? "");
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      if (historyIndex === null) {
        return;
      }

      const nextIndex = historyIndex + 1;

      if (nextIndex >= history.length) {
        setHistoryIndex(null);
        setCommandInput("");
        return;
      }

      setHistoryIndex(nextIndex);
      setCommandInput(history[nextIndex] ?? "");
    }
  }

  async function handleCopyCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommand(command);
      window.setTimeout(() => {
        setCopiedCommand((current) => (current === command ? null : current));
      }, 1500);
    } catch {
      setCopiedCommand(null);
    }
  }

  const showNextStepCta = session.commandCount >= 3;

  return (
    <div className="min-h-screen bg-background">
      <header className="site-header">
        <div className="site-header__inner">
          <span className="keel-header-brand">
            <a href="https://keelapi.com" className="keel-header-brand__link">
              <img className="keel-header-brand__icon" src="/keel.svg" alt="" aria-hidden="true" />
              <span className="keel-header-brand__wordmark">Keel</span>
            </a>
            <span className="keel-header-brand__copy">
              <span className="keel-header-brand__separator" aria-hidden="true">|</span>
              <span className="keel-header-brand__title">Playground Shell</span>
            </span>
          </span>
          <div className="site-header__actions">
            <a
              href="https://docs.keelapi.com/quickstart"
              target="_blank"
              rel="noreferrer"
              className="header-link"
            >
              Quickstart
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="site-main gap-6">
        <section className="rounded-xl border border-border bg-card text-card-foreground shadow-sm">
          <div className="flex flex-col gap-6 p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="mb-4 inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-primary">
                  Permit-Driven Demo
                </div>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Keel Shell
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Keel Shell is a browser-based demo of how AI execution is governed before a
                  provider call is ever made.
                </p>
              </div>
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <Metric label="Project" value={session.project} />
                <Metric
                  label="Budget Remaining"
                  value={`$${formatUsd(session.budgetUsdRemaining)}`}
                />
                <Metric label="Requests Left" value={String(session.requestsRemaining)} />
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="rounded-full border border-border bg-secondary px-3 py-1.5">
                No API key required
              </span>
              <span className="rounded-full border border-border bg-secondary px-3 py-1.5">
                Simulation only
              </span>
              <span className="rounded-full border border-border bg-secondary px-3 py-1.5">
                No live provider calls
              </span>
              <span className="rounded-full border border-border bg-secondary px-3 py-1.5">
                Modeled on Keel request lifecycle
              </span>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Demo Scenarios
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Load a command, press Enter, and inspect how the control plane decides,
                  routes, and accounts for execution.
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetSession}
                className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:border-primary/30 hover:text-primary"
              >
                Reset session
              </button>
            </div>

            <div className="space-y-3">
              {presetScenarios.map((scenario) => (
                <button
                  key={scenario.label}
                  type="button"
                  onClick={() => handlePresetCommand(scenario.command)}
                  className="w-full rounded-xl border border-border bg-background/60 p-4 text-left transition hover:border-primary/35 hover:bg-primary/5"
                >
                  <div className="text-sm font-medium text-foreground">{scenario.label}</div>
                  <div className="mt-1 text-sm leading-6 text-muted-foreground">
                    {scenario.description}
                  </div>
                  <div className="mt-3 rounded-lg border border-border/70 bg-secondary/70 px-3 py-2 font-mono text-xs leading-5 text-foreground/90">
                    {scenario.command}
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Interactive Terminal
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    See how requests are evaluated before execution, then tracked through
                    routing, audit, and accounting.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <StatusBadge label={`Policy ${session.policy}`} />
                  <StatusBadge label={`Last permit ${session.lastPermitId ?? "none"}`} />
                  <StatusBadge label={`Last request ${session.lastRequestId ?? "none"}`} />
                </div>
              </div>
            </div>

            <div
              ref={shellScrollRef}
              className="h-[560px] overflow-y-auto bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--secondary)/0.5)_100%)] px-5 py-5"
            >
              <div className="space-y-4">
                {terminalEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`rounded-xl border bg-background/80 px-4 py-3 shadow-sm ${getEntryBorderClasses(entry.output.tone)} ${
                      entry.output.isSystemNote ? "bg-secondary/50" : ""
                    }`}
                  >
                    {entry.output.isSystemNote ? (
                      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        System guidance
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-4">
                        <div className="font-mono text-sm text-foreground">
                          <span className="text-muted-foreground">sandbox-demo</span>
                          <span className="mx-2 text-primary">$</span>
                          {entry.command}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyCommand(entry.command)}
                          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-primary/30 hover:text-primary"
                        >
                          {copiedCommand === entry.command ? "Copied" : "Copy"}
                        </button>
                      </div>
                    )}

                    <div
                      className={`font-mono text-sm ${entry.output.isSystemNote ? "" : "mt-4"} ${
                        entry.output.isSystemNote
                          ? "text-muted-foreground"
                          : getPromptToneClasses(entry.output.tone)
                      }`}
                    >
                      {entry.output.summary}
                    </div>

                    <div className="mt-2 space-y-1.5 font-mono text-sm">
                      {entry.output.details.map((detail) => (
                        <div key={`${entry.id}-${detail.label}`} className="grid gap-1 sm:grid-cols-[148px_minmax(0,1fr)]">
                          <div className="text-muted-foreground">{detail.label}:</div>
                          <div>{renderValue(detail.value)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border px-5 py-4">
              <form onSubmit={handleSubmit} className="space-y-3">
                <label
                  htmlFor="keel-shell-command"
                  className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground"
                >
                  Command
                </label>
                <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 shadow-sm focus-within:border-primary/35 focus-within:ring-2 focus-within:ring-primary/10">
                  <span className="font-mono text-sm text-primary">$</span>
                  <input
                    id="keel-shell-command"
                    ref={inputRef}
                    value={commandInput}
                    onChange={(event) => setCommandInput(event.target.value)}
                    onKeyDown={handleKeyDown}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder='keel execute --provider openai --model gpt-4.1-mini --input "Write a calm refund reply"'
                    className="h-8 w-full border-0 bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <span className="inline-flex h-4 w-2 animate-pulse rounded-sm bg-primary/70" aria-hidden="true" />
                </div>

                <div className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    Up/down recalls history. Commands are deterministic and sandboxed.
                  </div>
                  <button
                    type="submit"
                    className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
                  >
                    Run command
                  </button>
                </div>
              </form>

              {showNextStepCta ? (
                <div className="mt-5 rounded-xl border border-border bg-secondary/60 px-4 py-4 text-sm">
                  <div className="font-medium text-foreground">Next step</div>
                  <div className="mt-1 text-muted-foreground">
                    Move from the deterministic sandbox into a real governed project when
                    you want to compare this flow against live routes.
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href="https://keelapi.com"
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:border-primary/30 hover:text-primary"
                    >
                      Create your own project
                    </a>
                    <a
                      href="https://docs.keelapi.com/quickstart"
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:border-primary/30 hover:text-primary"
                    >
                      Use your own provider key
                    </a>
                    <a
                      href="https://docs.keelapi.com/quickstart"
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:border-primary/30 hover:text-primary"
                    >
                      See real API routes
                    </a>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/85 px-4 py-3">
      <div className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 break-all text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function StatusBadge({ label }: { label: string }) {
  return (
    <div className="rounded-full border border-border bg-secondary px-3 py-1.5">
      {label}
    </div>
  );
}
