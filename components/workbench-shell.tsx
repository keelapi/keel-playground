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
import { createInitialSessionState, formatUsd } from "@/lib/shell/sessionState";
import type { SessionState, WorkbenchEntry } from "@/lib/shell/types";

const SESSION_STORAGE_KEY = "keel-playground-workbench";
const UI_STATE_VERSION = 3;
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
    setEntries(storedUiState?.entries ?? []);
    setHistory(storedUiState?.history ?? []);
    setSelectedEntryId(
      storedUiState?.selectedEntryId ??
        storedUiState?.entries.at(-1)?.id ??
        null,
    );
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
  const selectedScenario = getScenarioById(activeScenarioId);
  const helperText =
    selectedScenario?.helperText ??
    "Approved commands only. Use scenarios, `Tab`, or history recall to move quickly.";
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
    setEntries((currentEntries) => (isReset ? [nextEntry] : [...currentEntries, nextEntry]));
    setSelectedEntryId(nextEntry.id);
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

  function handleQuickAction(command: string, label: string) {
    if (label === "Copy command") {
      void handleCopyCommand(command);
      return;
    }

    setCommandInput(command);
    runCommand(command);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="site-header">
        <div className="site-header__inner">
          <span className="keel-header-brand">
            <a href="https://keelapi.com" className="keel-header-brand__link">
              <img className="keel-header-brand__icon" src="/keel.svg" alt="" aria-hidden="true" />
              <span className="keel-header-brand__wordmark">Keel</span>
            </a>
            <span className="keel-header-brand__copy">
              <span className="keel-header-brand__separator" aria-hidden="true">|</span>
              <span className="keel-header-brand__title">Workbench</span>
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

      <main className="site-main gap-4">
        <section className="flex flex-col gap-3 border-b border-border/70 pb-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <h1 className="text-[1.55rem] font-semibold tracking-[-0.04em] text-foreground">
              Keel Workbench
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Evaluate permit-driven AI execution governance before execution, with deterministic command output, explainability, timeline replay, and accounting.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            <MetaChip label="project" value={session.project} />
            <MetaChip label="budget" value={`$${formatUsd(session.budgetUsdRemaining)}`} />
            <MetaChip label="requests" value={String(session.requestsRemaining)} />
            <MetaChip label="mode" value="sandboxed" />
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_300px]">
          <ScenarioSidebar
            scenarios={SCENARIO_LIBRARY}
            activeScenarioId={activeScenarioId}
            session={session}
            onSelectScenario={handleSelectScenario}
          />

          <div className="overflow-hidden rounded-lg border border-border/70 bg-[#07111f] shadow-[0_24px_80px_-60px_rgba(0,0,0,0.85)]">
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
              suggestions={suggestions}
              helperText={helperText}
              onChange={setCommandInput}
              onSubmit={() => runCommand(commandInput)}
              onKeyDown={handleInputKeyDown}
              onSuggestionSelect={handlePrefillCommand}
              inputRef={inputRef}
            />
          </div>

          <GovernanceInspector
            inspector={selectedEntry?.artifact.inspector ?? null}
            onQuickAction={handleQuickAction}
            copiedCommand={copiedCommand}
          />
        </section>
      </main>
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-background/25 px-2.5 py-1 font-mono normal-case tracking-normal">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </span>
  );
}
