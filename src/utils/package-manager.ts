/* eslint-disable @typescript-eslint/typedef */
import * as fs from 'fs';
import * as path from 'path';
import { traceStep } from '../telemetry';
import { getPackageDotJson, updatePackageDotJson } from './clack-utils';
import { INSTALL_DIR } from '../../lib/constants';
import { analytics } from './analytics';

export interface PackageManager {
  name: string;
  label: string;
  installCommand: string;
  buildCommand: string;
  /* The command that the package manager uses to run a script from package.json */
  runScriptCommand: string;
  flags: string;
  forceInstallFlag: string;
  detect: () => boolean;
  addOverride: (pkgName: string, pkgVersion: string) => Promise<void>;
}

export const BUN: PackageManager = {
  name: 'bun',
  label: 'Bun',
  installCommand: 'bun add',
  buildCommand: 'bun run build',
  runScriptCommand: 'bun run',
  flags: '',
  forceInstallFlag: '--force',
  detect: () =>
    ['bun.lockb', 'bun.lock'].some((lockFile) =>
      fs.existsSync(path.join(INSTALL_DIR, lockFile)),
    ),
  addOverride: async (pkgName, pkgVersion): Promise<void> => {
    const packageDotJson = await getPackageDotJson();
    const overrides = packageDotJson.overrides || {};

    await updatePackageDotJson({
      ...packageDotJson,
      overrides: {
        ...overrides,
        [pkgName]: pkgVersion,
      },
    });
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
  detect: () => {
    try {
      return fs
        .readFileSync(path.join(INSTALL_DIR, 'yarn.lock'), 'utf-8')
        .slice(0, 500)
        .includes('yarn lockfile v1');
    } catch (e) {
      return false;
    }
  },
  addOverride: async (pkgName, pkgVersion): Promise<void> => {
    const packageDotJson = await getPackageDotJson();
    const resolutions = packageDotJson.resolutions || {};

    await updatePackageDotJson({
      ...packageDotJson,
      resolutions: {
        ...resolutions,
        [pkgName]: pkgVersion,
      },
    });
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
  detect: () => {
    try {
      return fs
        .readFileSync(path.join(INSTALL_DIR, 'yarn.lock'), 'utf-8')
        .slice(0, 500)
        .includes('__metadata');
    } catch (e) {
      return false;
    }
  },
  addOverride: async (pkgName, pkgVersion): Promise<void> => {
    const packageDotJson = await getPackageDotJson();
    const resolutions = packageDotJson.resolutions || {};

    await updatePackageDotJson({
      ...packageDotJson,
      resolutions: {
        ...resolutions,
        [pkgName]: pkgVersion,
      },
    });
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
  detect: () => fs.existsSync(path.join(INSTALL_DIR, 'pnpm-lock.yaml')),
  addOverride: async (pkgName, pkgVersion): Promise<void> => {
    const packageDotJson = await getPackageDotJson();
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
    });
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
  detect: () => fs.existsSync(path.join(INSTALL_DIR, 'package-lock.json')),
  addOverride: async (pkgName, pkgVersion): Promise<void> => {
    const packageDotJson = await getPackageDotJson();
    const overrides = packageDotJson.overrides || {};

    await updatePackageDotJson({
      ...packageDotJson,
      overrides: {
        ...overrides,
        [pkgName]: pkgVersion,
      },
    });
  },
};

export const packageManagers = [BUN, YARN_V1, YARN_V2, PNPM, NPM];

export function detectPackageManger(): PackageManager | null {
  return traceStep('detect-package-manager', () => {
    for (const packageManager of packageManagers) {
      if (packageManager.detect()) {
        analytics.setTag('package-manager', packageManager.name);
        return packageManager;
      }
    }
    analytics.setTag('package-manager', 'not-detected');
    return null;
  });
}
