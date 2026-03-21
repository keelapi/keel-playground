import type { ShellCommand, ShellCommandName } from "@/lib/shell/types";

function tokenizeCommand(input: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;

  for (const match of input.matchAll(pattern)) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
  }

  return tokens;
}

function getCommandName(tokens: string[]): ShellCommandName | null {
  if (tokens[0] !== "keel") {
    return null;
  }

  if (tokens.length === 2 && tokens[1] === "help") {
    return "help";
  }

  if (tokens[1] === "sandbox" && tokens[2] === "status") {
    return "sandbox-status";
  }

  if (tokens[1] === "sandbox" && tokens[2] === "reset") {
    return "sandbox-reset";
  }

  if (tokens[1] === "permits" && tokens[2] === "create") {
    return "permits-create";
  }

  if (tokens.length >= 2 && tokens[1] === "execute") {
    return "execute";
  }

  if (tokens.length >= 2 && tokens[1] === "explain") {
    return "explain";
  }

  if (tokens.length >= 2 && tokens[1] === "timeline") {
    return "timeline";
  }

  if (tokens.length >= 2 && tokens[1] === "usage") {
    return "usage";
  }

  if (tokens[1] === "policy" && tokens[2] === "show") {
    return "policy-show";
  }

  if (tokens[1] === "budget" && tokens[2] === "show") {
    return "budget-show";
  }

  if (tokens[1] === "routing" && tokens[2] === "preview") {
    return "routing-preview";
  }

  return null;
}

function getConsumedTokenCount(commandName: ShellCommandName): number {
  switch (commandName) {
    case "help":
    case "execute":
    case "explain":
    case "timeline":
    case "usage":
      return 2;
    case "sandbox-status":
    case "sandbox-reset":
    case "permits-create":
    case "policy-show":
    case "budget-show":
    case "routing-preview":
      return 3;
  }
}

export function parseShellCommand(input: string): ShellCommand {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("Enter a Keel command.");
  }

  const tokens = tokenizeCommand(trimmed);
  const commandName = getCommandName(tokens);

  if (!commandName) {
    throw new Error(`Unknown command: ${trimmed}`);
  }

  const flags: Record<string, string> = {};
  const positionals: string[] = [];

  for (let index = getConsumedTokenCount(commandName); index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = tokens[index + 1];

      if (!key || !value || value.startsWith("--")) {
        throw new Error(`Flag ${token} requires a value.`);
      }

      flags[key] = value;
      index += 1;
      continue;
    }

    positionals.push(token);
  }

  return {
    raw: trimmed,
    name: commandName,
    flags,
    positionals,
  };
}
