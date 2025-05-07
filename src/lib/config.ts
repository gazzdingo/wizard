import { Integration } from './constants';
import { hasPackageInstalled } from '../utils/package-json';
import { readFileSync } from 'fs';
import { join } from 'path';

export type IntegrationConfig = {
  id: string;
  name: string;
  label: string;
  default?: boolean;
  docsUrl: string;
  featuresDescription: string;
  nextSteps: string;
  frameworks?: {
    id: string;
    label: string;
  }[];
  detect: (options: { installDir: string }) => Promise<boolean>;
  filterFilesRules?: string;
  generateFilesRules?: string;
  filterPatterns?: string[];
  ignorePatterns?: string[];
};

export const SUPPORTED_INTEGRATIONS: ReadonlyArray<IntegrationConfig> = [
  {
    id: 'nextjs',
    name: 'Next.js',
    label: 'Next.js',
    default: true,
    docsUrl: 'https://docs.growthbook.io/lib/react',
    featuresDescription:
      '• Installed @growthbook/growthbook-react & @growthbook/growthbook-node packages\n• Initialized GrowthBook client-side in a Provider wrapper\n• Set up basic GrowthBook configuration using environment variables',
    nextSteps:
      '• Set user attributes using gb.setAttributes() when users log in or attributes change\n• Implement feature flags using the useFeature() hook\n• Set up experiments using useExperiment() and <Experiment> components\n• Add tracking for experiment exposures using trackingCallback or an analytics integration\n• Consider server-side rendering/fetching of features for performance optimization (see GrowthBook docs)\n• Upload environment variables to your production environment',
    frameworks: [
      { id: 'nextjs-app', label: 'App Router' },
      { id: 'nextjs-pages', label: 'Pages Router' },
    ],
    detect: ({ installDir }) => {
      const packageJson = JSON.parse(
        readFileSync(join(installDir, 'package.json'), 'utf-8'),
      );
      return Promise.resolve(hasPackageInstalled('next', packageJson));
    },
  },
  {
    id: 'react',
    name: 'React',
    label: 'React',
    docsUrl: 'https://docs.growthbook.io/lib/react',
    featuresDescription:
      '• Installed @growthbook/growthbook-react package\n• Initialized GrowthBook and added GrowthBookProvider to the root of the app',
    nextSteps:
      '• Set user attributes using gb.setAttributes() when users log in or attributes change\n• Implement feature flags using the useFeature() hook\n• Set up experiments using useExperiment() and <Experiment> components\n• Add tracking for experiment exposures using trackingCallback or an analytics integration\n• Upload environment variables to your production environment',
    detect: ({ installDir }) => {
      const packageJson = JSON.parse(
        readFileSync(join(installDir, 'package.json'), 'utf-8'),
      );
      return Promise.resolve(
        hasPackageInstalled('react', packageJson) ||
          hasPackageInstalled('react-dom', packageJson) ||
          hasPackageInstalled('@types/react', packageJson),
      );
    },
  },
  {
    id: 'svelte',
    name: 'Svelte',
    label: 'Svelte',
    docsUrl: 'https://docs.growthbook.io/lib/svelte',
    featuresDescription:
      '• Installed @growthbook/growthbook-svelte package\n• Initialized GrowthBook client-side\n• Added GrowthBook component/context provider',
    nextSteps:
      "• Set user attributes using gb.setAttributes() when users log in or attributes change\n• Implement feature flags using the 'feature' store or useFeature() hook\n• Set up experiments using 'experiment' store or useExperiment() hook\n• Add tracking for experiment exposures using trackingCallback or an analytics integration\n• Upload environment variables to your production environment",
    detect: ({ installDir }) => {
      const packageJson = JSON.parse(
        readFileSync(join(installDir, 'package.json'), 'utf-8'),
      );
      return Promise.resolve(hasPackageInstalled('svelte', packageJson));
    },
  },
  {
    id: 'react-native',
    name: 'React Native',
    label: 'React Native',
    docsUrl: 'https://docs.growthbook.io/lib/react-native',
    featuresDescription:
      '• Installed @growthbook/growthbook-react-native package\n• Added GrowthBookProvider to the root of the app\n• Initialized GrowthBook',
    nextSteps:
      '• Set user attributes using gb.setAttributes() when users log in or attributes change\n• Implement feature flags using the useFeature() hook\n• Set up experiments using useExperiment() and <Experiment> components\n• Add tracking for experiment exposures using trackingCallback or an analytics integration\n• Ensure features are loaded/refreshed appropriately for mobile lifecycle',
    detect: ({ installDir }) => {
      const packageJson = JSON.parse(
        readFileSync(join(installDir, 'package.json'), 'utf-8'),
      );
      return Promise.resolve(hasPackageInstalled('react-native', packageJson));
    },
  },
];

export const INTEGRATION_ORDER = [
  Integration.nextjs,
  Integration.svelte,
  Integration.reactNative,
  Integration.react,
] as const;
