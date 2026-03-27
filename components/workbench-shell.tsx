"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { CommandInput } from "@/components/command-input";
import { GovernanceInspector } from "@/components/governance-inspector";
import { OutputPane } from "@/components/output-pane";
import { ScenarioSidebar } from "@/components/scenario-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { getAutocompleteSuggestions } from "@/lib/shell/commandRegistry";
import { runWorkbenchCommand } from "@/lib/shell/commandRunner";
import { getScenarioById, resolveScenarioCommand, SCENARIO_LIBRARY } from "@/lib/shell/scenarios";
import { createInitialSessionState } from "@/lib/shell/sessionState";
import type { SessionState, WorkbenchEntry } from "@/lib/shell/types";

const SESSION_STORAGE_KEY = "keel-playground-workbench";
const UI_STATE_VERSION = 5;
const COMMAND_DELAY_MS = 220;

type StoredUiState = {
  version: number;
  session: SessionState;
  entries: WorkbenchEntry[];
  history: string[];
  draftCommand: string;
  selectedEntryId: string | null;
  activeScenarioId: string | null;
};

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

function createEntryId() {
  return `entry_${Math.random().toString(16).slice(2, 10)}`;
}

export function WorkbenchShell() {
  const [session, setSession] = useState<SessionState>(createInitialSessionState);
  const [entries, setEntries] = useState<WorkbenchEntry[]>([]);
  const [commandInput, setCommandInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const outputScrollRef = useRef<HTMLDivElement | null>(null);
  const hasLoadedRef = useRef(false);
  const pendingTimerRef = useRef<number | null>(null);
  const sessionRef = useRef(session);

  sessionRef.current = session;

  useEffect(() => {
    const storedUiState = readStoredUiState();
    const storedSession = storedUiState?.session ?? createInitialSessionState();
    const scenarioParam =
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("scenario");
    const linkedScenario = getScenarioById(scenarioParam);
    const recommendedScenario = SCENARIO_LIBRARY.find((scenario) => scenario.recommended);
    const initialScenario = linkedScenario ?? getScenarioById(storedUiState?.activeScenarioId) ?? recommendedScenario;
    const draftCommand =
      linkedScenario && initialScenario
        ? resolveScenarioCommand(initialScenario, storedSession)
        : storedUiState?.draftCommand ??
          (initialScenario ? resolveScenarioCommand(initialScenario, storedSession) : "");

    setSession(storedSession);
    setEntries([]);
    setHistory(storedUiState?.history ?? []);
    setSelectedEntryId(null);
    setActiveScenarioId(initialScenario?.id ?? null);
    setCommandInput(draftCommand);
    hasLoadedRef.current = true;

    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) {
      return;
    }

    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        version: UI_STATE_VERSION,
        session,
        entries,
        history,
        draftCommand: commandInput,
        selectedEntryId,
        activeScenarioId,
      } satisfies StoredUiState),
    );
  }, [activeScenarioId, commandInput, entries, history, selectedEntryId, session]);

  useEffect(() => {
    const viewport = outputScrollRef.current;

    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [entries, pendingCommand]);

  useEffect(() => {
    function onGlobalKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        return;
      }

      if (!isTypingTarget && event.key === "/") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (pendingTimerRef.current !== null) {
        window.clearTimeout(pendingTimerRef.current);
      }
    };
  }, []);

  const suggestions = useMemo(
    () => getAutocompleteSuggestions(commandInput, session),
    [commandInput, session],
  );

  const selectedEntry =
    entries.find((entry) => entry.id === selectedEntryId) ?? entries.at(-1) ?? null;
  const starterCommands = SCENARIO_LIBRARY.slice(0, 3).map((scenario) =>
    resolveScenarioCommand(scenario, session),
  );

  function syncScenarioInUrl(nextScenarioId: string | null) {
    const url = new URL(window.location.href);

    if (nextScenarioId) {
      url.searchParams.set("scenario", nextScenarioId);
    } else {
      url.searchParams.delete("scenario");
    }

    window.history.replaceState({}, "", url.toString());
  }

  function handleSelectScenario(scenarioId: string) {
    const scenario = getScenarioById(scenarioId);

    if (!scenario) {
      return;
    }

    setActiveScenarioId(scenario.id);
    setHistoryIndex(null);
    setCommandInput(resolveScenarioCommand(scenario, sessionRef.current));
    syncScenarioInUrl(scenario.id);
    inputRef.current?.focus();
  }

  function handlePrefillCommand(command: string) {
    setActiveScenarioId(null);
    setHistoryIndex(null);
    setCommandInput(command);
    syncScenarioInUrl(null);
    inputRef.current?.focus();
  }

  async function handleCopyCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommand(command);
      window.setTimeout(() => {
        setCopiedCommand((current) => (current === command ? null : current));
      }, 1600);
    } catch {
      setCopiedCommand(null);
    }
  }

  function finishCommand(rawCommand: string) {
    const result = runWorkbenchCommand(sessionRef.current, rawCommand);
    const nextEntry: WorkbenchEntry = {
      id: createEntryId(),
      command: rawCommand,
      artifact: result.artifact,
      createdAt: new Date().toISOString(),
    };
    const isReset = result.artifact.commandName === "sandbox-reset";

    setSession(result.session);
    setEntries((currentEntries) => (isReset ? [] : [...currentEntries, nextEntry]));
    setSelectedEntryId(isReset ? null : nextEntry.id);
    setHistory((currentHistory) => (isReset ? [rawCommand] : [...currentHistory, rawCommand]));
    setHistoryIndex(null);
    setCommandInput("");
    setPendingCommand(null);
    setIsRunning(false);
    pendingTimerRef.current = null;
  }

  function runCommand(rawCommand: string) {
    const trimmed = rawCommand.trim();

    if (!trimmed || isRunning) {
      return;
    }

    setPendingCommand(trimmed);
    setIsRunning(true);
    setHistoryIndex(null);

    pendingTimerRef.current = window.setTimeout(() => {
      finishCommand(trimmed);
    }, COMMAND_DELAY_MS);
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Tab" && suggestions[0]) {
      event.preventDefault();
      setCommandInput(suggestions[0]);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      runCommand(commandInput);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      if (!history.length) {
        return;
      }

      const nextIndex =
        historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);

      setHistoryIndex(nextIndex);
      setCommandInput(history[nextIndex] ?? "");
      return;
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="site-header">
        <div className="site-header__inner">
          <span className="keel-header-brand">
            <a href="https://keelapi.com" className="keel-header-brand__link">
              <img className="keel-header-brand__icon" src="/keel.svg" alt="" aria-hidden="true" />
              <span className="keel-header-brand__wordmark">Keel</span>
              <span className="keel-header-brand__title">Play</span>
            </a>
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

      <main className="mx-auto max-w-[960px] px-6 pt-10 pb-16">
        <div className="mb-6">
          <h2 className="text-[22px] font-semibold tracking-tight text-foreground">Try it out</h2>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            Explore Keel&apos;s permit-driven governance in a deterministic sandbox.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
          <div className="hidden md:block">
            <ScenarioSidebar
              scenarios={SCENARIO_LIBRARY}
              activeScenarioId={activeScenarioId}
              onSelectScenario={handleSelectScenario}
            />
          </div>

          <div className="flex flex-col gap-4">
            <div
              className="flex flex-col overflow-hidden rounded-2xl"
              style={{
                border: "1px solid hsl(var(--snippet-border))",
                background: "hsl(var(--snippet-chrome))",
                boxShadow: "var(--snippet-shadow)",
              }}
            >
              <div
                className="flex items-center gap-2 px-4 py-3"
                style={{ borderBottom: "1px solid hsl(var(--snippet-border))" }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "hsl(var(--snippet-dot-red))" }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "hsl(var(--snippet-dot-amber))" }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "hsl(var(--snippet-dot-green))" }} />
              </div>

              <div
                className="flex h-[480px] min-h-0 flex-col"
                style={{ background: "hsl(var(--snippet-body))", color: "hsl(var(--snippet-text))" }}
              >
                <OutputPane
                  entries={entries}
                  selectedEntryId={selectedEntry?.id ?? null}
                  pendingCommand={pendingCommand}
                  copiedCommand={copiedCommand}
                  onSelectEntry={setSelectedEntryId}
                  onCopyCommand={(command) => void handleCopyCommand(command)}
                  onPrefillCommand={handlePrefillCommand}
                  starterCommands={starterCommands}
                  scrollRef={outputScrollRef}
                />

                <CommandInput
                  value={commandInput}
                  isRunning={isRunning}
                  onChange={setCommandInput}
                  onSubmit={() => runCommand(commandInput)}
                  onKeyDown={handleInputKeyDown}
                  inputRef={inputRef}
                />
              </div>
            </div>

            {selectedEntry?.artifact.inspector ? (
              <div
                className="overflow-hidden rounded-2xl"
                style={{
                  border: "1px solid hsl(var(--snippet-border))",
                  background: "hsl(var(--snippet-chrome))",
                  boxShadow: "var(--snippet-shadow)",
                }}
              >
                <div className="max-h-[420px] overflow-y-auto" style={{ background: "hsl(var(--snippet-body))", color: "hsl(var(--snippet-text))" }}>
                  <GovernanceInspector
                    inspector={selectedEntry.artifact.inspector}
                    onQuickAction={(command, label) => {
                      if (label === "Copy command") {
                        void handleCopyCommand(command);
                      } else {
                        handlePrefillCommand(command);
                      }
                    }}
                    copiedCommand={copiedCommand}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <a
            href="https://docs.keelapi.com/quickstart"
            target="_blank"
            rel="noreferrer"
            className="text-[13px] text-muted-foreground transition hover:text-foreground"
          >
            Quickstart guide →
          </a>
          <a
            href="https://docs.keelapi.com/api-reference"
            target="_blank"
            rel="noreferrer"
            className="text-[13px] text-muted-foreground transition hover:text-foreground"
          >
            API reference →
          </a>
        </div>
      </main>
    </div>
  );
}
