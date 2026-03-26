import type {
  CommandDefinition,
  SessionState,
  ShellCommand,
  ShellCommandName,
} from "@/lib/shell/types";

export const COMMAND_REGISTRY: readonly CommandDefinition[] = [
  {
    name: "help",
    category: "sandbox",
    tokens: ["keel", "help"],
    syntax: "keel help",
    description: "Show the approved deterministic command surface.",
    examples: ["keel help"],
    helperText: "Lists the fixed grammar available in the workbench sandbox.",
  },
  {
    name: "permits-create",
    category: "permits",
    tokens: ["keel", "permits", "create"],
    syntax: 'keel permits create --provider <provider> --model <model> --input "<text>"',
    description: "Create a deterministic permit decision without dispatching execution.",
    examples: [
      'keel permits create --provider openai --model gpt-4.1-mini --input "Summarize this support ticket"',
    ],
    helperText: "Teaches permit-first governance before any provider dispatch is considered.",
    requiredFlags: ["model", "input"],
    optionalFlags: ["provider"],
  },
  {
    name: "execute",
    category: "execution",
    tokens: ["keel", "execute"],
    syntax: 'keel execute --provider <provider> --model <model> --input "<text>"',
    description: "Run a governed execution through the simulated Keel control plane.",
    examples: [
      'keel execute --provider openai --model gpt-4.1-mini --input "Write a calm refund reply"',
    ],
    helperText: "Runs permit checks, simulated routing, execution, accounting, and audit.",
    requiredFlags: ["provider", "model", "input"],
  },
  {
    name: "explain",
    category: "explainability",
    tokens: ["keel", "explain"],
    syntax: "keel explain <request_id>",
    description: "Explain why a governed request was allowed or denied.",
    examples: ["keel explain req_b71d9e"],
    helperText: "Use the latest request id from the output pane or inspector.",
    positionals: ["request_id"],
  },
  {
    name: "timeline",
    category: "explainability",
    tokens: ["keel", "timeline"],
    syntax: "keel timeline <request_id>",
    description: "Replay the deterministic governance timeline for a request.",
    examples: ["keel timeline req_b71d9e"],
    helperText: "Shows the full governance spine from auth through audit.",
    positionals: ["request_id"],
  },
  {
    name: "usage",
    category: "accounting",
    tokens: ["keel", "usage"],
    syntax: "keel usage",
    description: "Inspect request counts, token totals, and sandbox cost accounting.",
    examples: ["keel usage"],
    helperText: "Summarizes total usage across the local deterministic session.",
  },
  {
    name: "sandbox-reset",
    category: "sandbox",
    tokens: ["keel", "sandbox", "reset"],
    syntax: "keel sandbox reset",
    description: "Reset the local deterministic session to its initial budget and history.",
    examples: ["keel sandbox reset"],
    helperText: "Restores the fixed demo state without any network activity.",
  },
] as const;

export const COMMAND_DEFINITION_MAP = new Map<ShellCommandName, CommandDefinition>(
  COMMAND_REGISTRY.map((definition) => [definition.name, definition]),
);

const COMMAND_EXAMPLES: Record<ShellCommandName, (session: SessionState) => string> = {
  help: () => "keel help",
  "permits-create": () =>
    'keel permits create --provider openai --model gpt-4.1-mini --input "Summarize this support ticket"',
  execute: () =>
    'keel execute --provider openai --model gpt-4.1-mini --input "Write a calm refund reply"',
  explain: (session) => `keel explain ${session.lastRequestId ?? "req_b71d9e"}`,
  timeline: (session) => `keel timeline ${session.lastRequestId ?? "req_b71d9e"}`,
  usage: () => "keel usage",
  "sandbox-reset": () => "keel sandbox reset",
};

function tokenizeCommand(input: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;

  for (const match of input.matchAll(pattern)) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
  }

  return tokens;
}

function matchesDefinition(tokens: string[], definition: CommandDefinition): boolean {
  return definition.tokens.every((token, index) => tokens[index] === token);
}

function definitionRank(definition: CommandDefinition): number {
  return definition.tokens.length;
}

export function parseShellCommand(input: string): ShellCommand {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("Enter an approved Keel command.");
  }

  const tokens = tokenizeCommand(trimmed);
  const definition = [...COMMAND_REGISTRY]
    .filter((candidate) => matchesDefinition(tokens, candidate))
    .sort((left, right) => definitionRank(right) - definitionRank(left))[0];

  if (!definition) {
    throw new Error("Unknown command. Use `keel help` to inspect the approved grammar.");
  }

  const flags: Record<string, string> = {};
  const positionals: string[] = [];

  for (let index = definition.tokens.length; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = tokens[index + 1];

      if (!key || !value || value.startsWith("--")) {
        throw new Error(`Flag ${token} requires a value.`);
      }

      const allowedFlags = new Set([
        ...(definition.requiredFlags ?? []),
        ...(definition.optionalFlags ?? []),
      ]);

      if (!allowedFlags.has(key)) {
        throw new Error(`Flag --${key} is not supported for \`${definition.syntax}\`.`);
      }

      flags[key] = value;
      index += 1;
      continue;
    }

    positionals.push(token);
  }

  for (const flag of definition.requiredFlags ?? []) {
    if (!flags[flag]) {
      throw new Error(`Missing required flag: --${flag}`);
    }
  }

  const positionalCount = definition.positionals?.length ?? 0;

  if (positionals.length !== positionalCount) {
    throw new Error(`Usage: ${definition.syntax}`);
  }

  return {
    raw: trimmed,
    name: definition.name,
    flags,
    positionals,
    definition,
  };
}

export function getAutocompleteSuggestions(
  input: string,
  session: SessionState,
): string[] {
  const normalized = input.trim().toLowerCase();
  const starterSet = new Set(
    COMMAND_REGISTRY.flatMap((definition) => definition.examples).map((example) =>
      normalizeScenarioCommand(example, session),
    ),
  );

  const suggestions = [...starterSet];

  if (!normalized) {
    return suggestions.slice(0, 6);
  }

  return suggestions
    .filter((suggestion) => suggestion.toLowerCase().startsWith(normalized))
    .slice(0, 6);
}

export function getCommandTemplate(
  commandName: ShellCommandName,
  session: SessionState,
): string {
  return COMMAND_EXAMPLES[commandName](session);
}

function normalizeScenarioCommand(command: string, session: SessionState): string {
  if (command.includes("req_b71d9e")) {
    return command.replaceAll("req_b71d9e", session.lastRequestId ?? "req_b71d9e");
  }

  return command;
}
