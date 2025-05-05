import { Integration } from './constants';

export type IntegrationConfig = {
  id: string;
  label: string;
  default?: boolean;
  docsUrl: string;
  featuresDescription: string;
  nextSteps: string;
  frameworks?: {
    id: string;
    label: string;
  }[];
};

export const SUPPORTED_INTEGRATIONS: ReadonlyArray<IntegrationConfig> = [
  {
    id: 'nextjs',
    label: 'Next.js',
    default: true,
    docsUrl: 'https://docs.growthbook.io/lib/react', // Use React docs for Next.js
    featuresDescription:
      '• Installed @growthbook/growthbook-react & @growthbook/growthbook-node packages\n• Initialized GrowthBook client-side in a Provider wrapper\n• Set up basic GrowthBook configuration using environment variables',
    nextSteps:
      '• Set user attributes using gb.setAttributes() when users log in or attributes change\n• Implement feature flags using the useFeature() hook\n• Set up experiments using useExperiment() and <Experiment> components\n• Add tracking for experiment exposures using trackingCallback or an analytics integration\n• Consider server-side rendering/fetching of features for performance optimization (see GrowthBook docs)\n• Upload environment variables to your production environment',
    frameworks: [
      { id: 'nextjs-app', label: 'App Router' },
      { id: 'nextjs-pages', label: 'Pages Router' },
    ],
  },
  {
    id: 'react',
    label: 'React',
    docsUrl: 'https://docs.growthbook.io/lib/react',
    featuresDescription:
      '• Installed @growthbook/growthbook-react package\n• Initialized GrowthBook and added GrowthBookProvider to the root of the app',
    nextSteps:
      '• Set user attributes using gb.setAttributes() when users log in or attributes change\n• Implement feature flags using the useFeature() hook\n• Set up experiments using useExperiment() and <Experiment> components\n• Add tracking for experiment exposures using trackingCallback or an analytics integration\n• Upload environment variables to your production environment',
  },
  {
    id: 'svelte',
    label: 'Svelte',
    docsUrl: 'https://docs.growthbook.io/lib/svelte', // Assuming Svelte docs exist
    featuresDescription:
      '• Installed @growthbook/growthbook-svelte package\n• Initialized GrowthBook client-side\n• Added GrowthBook component/context provider',
    nextSteps:
      "• Set user attributes using gb.setAttributes() when users log in or attributes change\n• Implement feature flags using the 'feature' store or useFeature() hook\n• Set up experiments using 'experiment' store or useExperiment() hook\n• Add tracking for experiment exposures using trackingCallback or an analytics integration\n• Upload environment variables to your production environment",
  },
  {
    id: 'react-native',
    label: 'React Native',
    docsUrl: 'https://docs.growthbook.io/lib/react-native', // Assuming React Native docs exist
    featuresDescription:
      '• Installed @growthbook/growthbook-react-native package\n• Added GrowthBookProvider to the root of the app\n• Initialized GrowthBook',
    nextSteps:
      '• Set user attributes using gb.setAttributes() when users log in or attributes change\n• Implement feature flags using the useFeature() hook\n• Set up experiments using useExperiment() and <Experiment> components\n• Add tracking for experiment exposures using trackingCallback or an analytics integration\n• Ensure features are loaded/refreshed appropriately for mobile lifecycle',
  },
];

export const INTEGRATION_ORDER = [
  Integration.nextjs,
  Integration.svelte,
  Integration.reactNative,
  Integration.react,
] as const;
