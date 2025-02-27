import readEnv from 'read-env';

// TODO: move to src/utils (+tests)
export function readEnvironment(): Record<string, unknown> {
  const result = readEnv('POSTHOG_WIZARD');

  return result;
}
