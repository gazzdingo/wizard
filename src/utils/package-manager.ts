/* eslint-disable @typescript-eslint/typedef */
import * as fs from 'fs';
import * as path from 'path';
import { traceStep } from '../telemetry';
import { getPackageDotJson, updatePackageDotJson } from './clack-utils';
import { Analytics } from './analytics';
import type { WizardOptions } from './types';

export interface PackageManager {
  name: string;
  label: string;
  installCommand: string;
  buildCommand: string;
  /* The command that the package manager uses to run a script from package.json */
  runScriptCommand: string;
  flags: string;
  forceInstallFlag: string;
  detect: ({ installDir }: Pick<WizardOptions, 'installDir'>) => boolean;
  addOverride: (pkgName: string, pkgVersion: string, { installDir }: Pick<WizardOptions, 'installDir'>) => Promise<void>;
}

export const BUN: PackageManager = {
  name: 'bun',
  label: 'Bun',
  installCommand: 'bun add',
  buildCommand: 'bun run build',
  runScriptCommand: 'bun run',
  flags: '',
  forceInstallFlag: '--force',
  detect: ({ installDir }: Pick<WizardOptions, 'installDir'>) =>
    ['bun.lockb', 'bun.lock'].some((lockFile) =>
      fs.existsSync(path.join(installDir ?? process.cwd(), lockFile)),
    ),
  addOverride: async (pkgName, pkgVersion, { installDir }: Pick<WizardOptions, 'installDir'>): Promise<void> => {
    const packageDotJson = await getPackageDotJson({ installDir: installDir ?? process.cwd() });
    const overrides = packageDotJson.overrides || {};

    await updatePackageDotJson({
      ...packageDotJson,
      overrides: {
        ...overrides,
        [pkgName]: pkgVersion,
      },
    }, { installDir: installDir ?? process.cwd() });
  },
};
export const YARN_V1: PackageManager = {
  name: 'yarn',
  label: 'Yarn V1',
  installCommand: 'yarn add',
  buildCommand: 'yarn build',
  runScriptCommand: 'yarn',
  flags: '--ignore-workspace-root-check',
  forceInstallFlag: '--force',
  detect: ({ installDir }: Pick<WizardOptions, 'installDir'>) => {
    try {
      return fs
        .readFileSync(path.join(installDir ?? process.cwd(), 'yarn.lock'), 'utf-8')
        .slice(0, 500)
        .includes('yarn lockfile v1');
    } catch (e) {
      return false;
    }
  },
  addOverride: async (pkgName, pkgVersion, { installDir }: Pick<WizardOptions, 'installDir'>): Promise<void> => {
    const packageDotJson = await getPackageDotJson({ installDir: installDir ?? process.cwd() });
    const resolutions = packageDotJson.resolutions || {};

    await updatePackageDotJson({
      ...packageDotJson,
      resolutions: {
        ...resolutions,
        [pkgName]: pkgVersion,
      },
    }, { installDir: installDir ?? process.cwd() });
  },
};
/** YARN V2/3/4 */
export const YARN_V2: PackageManager = {
  name: 'yarn',
  label: 'Yarn V2/3/4',
  installCommand: 'yarn add',
  buildCommand: 'yarn build',
  runScriptCommand: 'yarn',
  flags: '',
  forceInstallFlag: '--force',
  detect: ({ installDir }: Pick<WizardOptions, 'installDir'>) => {
    try {
      return fs
        .readFileSync(path.join(installDir ?? process.cwd(), 'yarn.lock'), 'utf-8')
        .slice(0, 500)
        .includes('__metadata');
    } catch (e) {
      return false;
    }
  },
  addOverride: async (pkgName, pkgVersion, { installDir }: Pick<WizardOptions, 'installDir'>): Promise<void> => {
    const packageDotJson = await getPackageDotJson({ installDir: installDir ?? process.cwd() });
    const resolutions = packageDotJson.resolutions || {};

    await updatePackageDotJson({
      ...packageDotJson,
      resolutions: {
        ...resolutions,
        [pkgName]: pkgVersion,
      },
    }, { installDir: installDir ?? process.cwd() });
  },
};
export const PNPM: PackageManager = {
  name: 'pnpm',
  label: 'pnpm',
  installCommand: 'pnpm add',
  buildCommand: 'pnpm build',
  runScriptCommand: 'pnpm',
  flags: '--ignore-workspace-root-check',
  forceInstallFlag: '--force',
  detect: ({ installDir }: Pick<WizardOptions, 'installDir'>) =>
    fs.existsSync(path.join(installDir ?? process.cwd(), 'pnpm-lock.yaml')),
  addOverride: async (pkgName, pkgVersion, { installDir }: Pick<WizardOptions, 'installDir'>): Promise<void> => {
    const packageDotJson = await getPackageDotJson({ installDir: installDir ?? process.cwd() });
    const pnpm = packageDotJson.pnpm || {};
    const overrides = pnpm.overrides || {};

    await updatePackageDotJson({
      ...packageDotJson,
      pnpm: {
        ...pnpm,
        overrides: {
          ...overrides,
          [pkgName]: pkgVersion,
        },
      },
    }, { installDir: installDir ?? process.cwd() });
  },
};
export const NPM: PackageManager = {
  name: 'npm',
  label: 'npm',
  installCommand: 'npm add',
  buildCommand: 'npm run build',
  runScriptCommand: 'npm run',
  flags: '',
  forceInstallFlag: '--force',
  detect: ({ installDir }: Pick<WizardOptions, 'installDir'>) =>
    fs.existsSync(path.join(installDir ?? process.cwd(), 'package-lock.json')),
  addOverride: async (pkgName, pkgVersion, { installDir }: Pick<WizardOptions, 'installDir'>): Promise<void> => {
    const packageDotJson = await getPackageDotJson({ installDir: installDir ?? process.cwd() });
    const overrides = packageDotJson.overrides || {};

    await updatePackageDotJson({
      ...packageDotJson,
      overrides: {
        ...overrides,
        [pkgName]: pkgVersion,
      },
    }, { installDir: installDir ?? process.cwd() });
  },
};

export const packageManagers = [BUN, YARN_V1, YARN_V2, PNPM, NPM];

export function detectPackageManger({ installDir }: Pick<WizardOptions, 'installDir'>): PackageManager | null {
  return traceStep('detect-package-manager', () => {
    for (const packageManager of packageManagers) {
      if (packageManager.detect({ installDir: installDir ?? process.cwd() })) {
        Analytics.setTag('package-manager', packageManager.name);
        return packageManager;
      }
    }
    Analytics.setTag('package-manager', 'not-detected');
    return null;
  });
}
