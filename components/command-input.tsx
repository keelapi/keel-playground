"use client";

import type { KeyboardEvent, RefObject } from "react";

type CommandInputProps = {
  value: string;
  isRunning: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  inputRef: RefObject<HTMLInputElement | null>;
};

export function CommandInput({
  value,
  isRunning,
  onChange,
  onSubmit,
  onKeyDown,
  inputRef,
}: CommandInputProps) {
  return (
    <div className="border-t border-border px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[13px] text-muted-foreground">›</span>
        <input
          ref={inputRef}
          value={value}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Enter a shell command..."
          className="h-6 w-full border-0 bg-transparent font-mono text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50"
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
    </div>
  );
}
