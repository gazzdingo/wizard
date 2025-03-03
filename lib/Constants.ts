import path from 'path';
import 'dotenv/config';

export enum Integration {
  nextjs = 'nextjs',
}

export function getIntegrationDescription(type: string): string {
  switch (type) {
    case Integration.nextjs:
      return 'Next.js';
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

export const DEFAULT_URL = 'https://app.posthog.com';
export const ISSUES_URL = 'ISSUES_URL';
export const INSTALL_DIR = path.join(
  process.cwd(),
  process.env.POSTHOG_WIZARD_INSTALL_DIR ?? '',
);
export const CLOUD_URL = 'https://app.posthog.com';
export const DEFAULT_HOST_URL = 'https://us.i.posthog.com';
export const DUMMY_PROJECT_API_KEY = '_YOUR_POSTHOG_PROJECT_API_KEY_';
