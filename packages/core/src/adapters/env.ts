/**
 * Subscription mode is the default and the product promise: agents run on the
 * user's existing CLI logins, never on API credits. A stray exported API key
 * silently outranks subscription auth in both CLIs' credential resolution, so
 * in subscription mode we hard-strip those variables from child environments.
 */
const ANTHROPIC_KEY_VARS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"];
const OPENAI_KEY_VARS = ["OPENAI_API_KEY"];

export function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of [...ANTHROPIC_KEY_VARS, ...OPENAI_KEY_VARS]) delete env[key];
  return env;
}

/** The Agent SDK reads process.env directly, so subscription mode scrubs it in place. */
export function applySubscriptionAuthToProcess(): void {
  for (const key of [...ANTHROPIC_KEY_VARS, ...OPENAI_KEY_VARS]) delete process.env[key];
}
