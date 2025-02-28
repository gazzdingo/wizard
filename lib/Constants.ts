import path from 'path';
import 'dotenv/config';

export enum Integration {
  nextjs = 'nextjs',
}

/** Key value should be the same here */
export enum Platform {
  ios = 'ios',
  android = 'android',
}

export function getPlatformChoices(): any[] {
  return Object.keys(Platform).map((platform: string) => ({
    checked: true,
    name: getPlatformDescription(platform),
    value: platform,
  }));
}

export function getPlatformDescription(type: string): string {
  switch (type) {
    case Platform.ios:
      return 'iOS';
    default:
      return 'Android';
  }
}

export function getIntegrationDescription(type: string): string {
  switch (type) {
    case Integration.nextjs:
      return 'Next.js';
    default:
      throw new Error(`Unknown integration ${type}`);
  }
}

export function mapIntegrationToPlatform(type: string): string | undefined {
  switch (type) {
    case Integration.nextjs:
      return 'javascript-nextjs';
    default:
      return undefined;
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
  url: string;
  debug: boolean;
  uninstall: boolean;
  integration: Integration;
  platform: Platform[];
  skipConnect: boolean;
  quiet: boolean;
  signup: boolean;
  disableTelemetry?: boolean;
}

export const DEFAULT_URL = 'https://app.posthog.com';
export const ISSUES_URL = 'ISSUES_URL';
export const INSTALL_DIR = path.join(
  process.cwd(),
  process.env.POSTHOG_WIZARD_INSTALL_DIR ?? '',
);
export const CLOUD_URL = 'http://localhost:8010';
export const DEFAULT_HOST_URL = 'https://us.i.posthog.com';
export const DUMMY_PROJECT_API_KEY = '_YOUR_POSTHOG_PROJECT_API_KEY_';
