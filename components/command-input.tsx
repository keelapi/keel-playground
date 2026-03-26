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
    <div className="border-t border-border/80 bg-background">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="font-mono text-[13px] text-muted-foreground">›</span>
        <input
          ref={inputRef}
          value={value}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder='keel execute --provider openai --model gpt-4.1-mini --input "Write a calm refund reply"'
          className="h-6 w-full border-0 bg-transparent font-mono text-[13px] text-foreground outline-none placeholder:text-muted-foreground/85"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={isRunning}
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRunning ? "running" : "run"}
        </button>
      </div>

      {(suggestions.length > 0 || helperText) ? (
        <div className="border-t border-border/70 px-3 py-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {helperText}
          </div>
          {suggestions.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onSuggestionSelect(suggestion)}
                  className="font-mono text-[11px] text-muted-foreground transition hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
