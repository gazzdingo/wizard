import { getPackageDotJson } from '../utils/clack-utils';
import { hasPackageInstalled } from '../utils/package-json';
import type { WizardOptions } from '../utils/types';
import { Integration } from './constants';

type IntegrationConfig = {
  name: string;
  filterPatterns: string[];
  ignorePatterns: string[];
  detect: (options: Pick<WizardOptions, 'installDir'>) => Promise<boolean>;
  generateFilesRules: string;
  filterFilesRules: string;
  docsUrl: string;
  changes: string;
  nextSteps: string;
};

export const INTEGRATION_CONFIG = {
  [Integration.nextjs]: {
    name: 'Next.js',
    filterPatterns: ['**/*.{tsx,ts,jsx,js,mjs,cjs}'],
    ignorePatterns: [
      'node_modules',
      'dist',
      'build',
      'public',
      'static',
      'next-env.d.*',
    ],
    detect: async (options) => {
      const packageJson = await getPackageDotJson(options);
      return hasPackageInstalled('next', packageJson);
    },
    generateFilesRules: '',
    filterFilesRules: '',
    docsUrl: 'https://posthog.com/docs/libraries/next-js',
    changes:
      '• Installed posthog-js & posthog-node packages\n• Initialized PostHog, and added pageview tracking\n• Created a PostHogClient to use PostHog server-side\n• Setup a reverse proxy to avoid ad blockers blocking analytics requests\n• Added your Project API key to your .env/.env.local file',
    nextSteps:
      '• Call posthog.identify() when a user signs into your app\n• Call posthog.capture() to capture custom events in your app\n• Upload environment variables to your production environment',
  },
  [Integration.react]: {
    name: 'React',
    filterPatterns: ['**/*.{tsx,ts,jsx,js}'],
    ignorePatterns: [
      'node_modules',
      'dist',
      'build',
      'public',
      'static',
      'assets',
    ],
    detect: async (options) => {
      const packageJson = await getPackageDotJson(options);
      return hasPackageInstalled('react', packageJson);
    },
    generateFilesRules: '',
    filterFilesRules: '',
    docsUrl: 'https://posthog.com/docs/libraries/react',
    changes:
      '• Installed posthog-js package\n• Added PostHogProvider to the root of the app, to initialize PostHog and enable autocapture\n• Added your Project API key to your .env/.env.local file',
    nextSteps:
      '• Call posthog.identify() when a user signs into your app\n• Call posthog.capture() to capture custom events in your app\n• Upload environment variables to your production environment',
  },
  [Integration.svelte]: {
    name: 'Svelte',
    filterPatterns: ['**/*.{svelte,ts,js,jsx,tsx}'],
    ignorePatterns: ['node_modules', 'dist', 'build', 'public', 'static'],
    detect: async (options) => {
      const packageJson = await getPackageDotJson(options);
      return hasPackageInstalled('@sveltejs/kit', packageJson);
    },
    generateFilesRules: '',
    filterFilesRules: '',
    docsUrl: 'https://posthog.com/docs/libraries/svelte',
    changes:
      '• Installed posthog-js & posthog-node packages\n• Added PostHog initialization to your Svelte app\n• Setup pageview & pageleave tracking\n• Setup event auto - capture to capture events as users interact with your app\n• Added a getPostHogClient() function to use PostHog server-side\n• Added your Project API key to your .env/.env.local file',
    nextSteps:
      '• Call posthog.identify() when a user signs into your app\n• Use getPostHogClient() to start capturing events server - side\n• Upload environment variables to your production environment',
  },
  [Integration.reactNative]: {
    name: 'React Native',
    filterPatterns: ['**/*.{ts,js,jsx,tsx}'],
    ignorePatterns: ['node_modules', 'dist', 'build', 'public', 'static'],
    detect: async (options) => {
      const packageJson = await getPackageDotJson(options);
      return hasPackageInstalled('react-native', packageJson);
    },
    generateFilesRules: '',
    filterFilesRules: '',
    docsUrl: 'https://posthog.com/docs/libraries/react-native',
    changes:
      '• Installed required packages\n• Added PostHogProvider to the root of the app\n• Enabled autocapture and session replay',
    nextSteps:
      '• Call posthog.identify() when a user signs into your app\n• Call posthog.capture() to capture custom events in your app',
  },
} as const satisfies Record<Integration, IntegrationConfig>;

export const INTEGRATION_ORDER = [
  Integration.nextjs,
  Integration.svelte,
  Integration.reactNative,
  Integration.react,
] as const;
