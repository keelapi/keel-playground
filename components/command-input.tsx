"use client";

import type { KeyboardEvent, RefObject } from "react";

type CommandInputProps = {
  value: string;
  isRunning: boolean;
  suggestions: string[];
  helperText: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSuggestionSelect: (suggestion: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
};

export function CommandInput({
  value,
  isRunning,
  suggestions,
  helperText,
  onChange,
  onSubmit,
  onKeyDown,
  onSuggestionSelect,
  inputRef,
}: CommandInputProps) {
  return (
    <div className="border-t border-white/6 bg-[#07111f] px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Prompt
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{helperText}</p>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isRunning}
          className="inline-flex h-8 items-center justify-center rounded-md border border-primary/30 bg-primary/10 px-3 text-xs font-medium text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? "Running" : "Run"}
        </button>
      </div>

      <div className="border border-white/6 bg-black/10 shadow-[0_1px_0_rgba(255,255,255,0.02)_inset]">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <span className="font-mono text-sm text-primary">$</span>
          <input
            ref={inputRef}
            value={value}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder='keel execute --provider openai --model gpt-4.1-mini --input "Write a calm refund reply"'
            className="h-8 w-full border-0 bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-full ${isRunning ? "animate-pulse bg-primary" : "bg-primary/40"}`}
          />
        </div>

        {suggestions.length > 0 ? (
          <div className="border-t border-white/6 px-2 py-2">
            <div className="mb-1.5 px-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Suggestions
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onSuggestionSelect(suggestion)}
                  className="border border-white/6 bg-white/[0.02] px-2 py-1 font-mono text-[11px] text-foreground transition hover:border-primary/35 hover:bg-primary/5"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span>`Tab` accepts top suggestion</span>
        <span>`↑` / `↓` recalls history</span>
        <span>Simulation only, with fixed approved grammar</span>
      </div>
    </div>
  );
}
