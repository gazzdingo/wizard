export enum Integration {
  nextjs = 'nextjs',
  react = 'react',
  svelte = 'svelte',
  reactNative = 'react-native',
}

export function getIntegrationDescription(type: string): string {
  switch (type) {
    case Integration.nextjs:
      return 'Next.js';
    case Integration.react:
      return 'React';
    case Integration.reactNative:
      return 'React Native';
    case Integration.svelte:
      return 'Svelte';
    default:
      throw new Error(`Unknown integration ${type}`);
  }
}

type IntegrationChoice = {
  name: string;
  value: string;
};

export function getIntegrationChoices(): IntegrationChoice[] {
  return Object.keys(Integration).map((type: string) => ({
    name: getIntegrationDescription(type),
    value: type,
  }));
}

export interface Args {
  debug: boolean;
  integration: Integration;
}

export const IS_DEV = false;

export const DEBUG = false;

export const DEFAULT_URL = IS_DEV
  ? 'http://localhost:8010'
  : 'https://app.growthbook.io';
export const ISSUES_URL = 'https://github.com/growthbook/wizard/issues';
export const DEFAULT_HOST_URL = 'https://cdn.growthbook.io';
export const ANALYTICS_POSTHOG_PUBLIC_PROJECT_WRITE_KEY = 'sTMFPsFhdP1Ssg';
export const ANALYTICS_HOST_URL = 'https://internal-t.posthog.com';
export const DUMMY_PROJECT_API_KEY = '_YOUR_GROWTHBOOK_CLIENT_KEY_';
