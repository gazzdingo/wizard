import readEnv from "read-env";

export function readEnvironment(): Record<string, unknown> {
  const result = readEnv('POSTHOG_WIZARD');

  return result;
}
