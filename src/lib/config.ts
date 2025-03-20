import { getPackageDotJson } from "../utils/clack-utils";
import { hasPackageInstalled } from "../utils/package-json";
import type { FileChange, WizardOptions } from "../utils/types";
import { Integration } from "./constants";

type GenerateFileContentContext = {
  filePath: string;
  fileContent: string;
  changedFiles: FileChange[];
  unchangedFiles: string[];
  documentation: string;
}

type IntegrationConfig = {
  filterPatterns: string[];
  ignorePatterns: string[];
  detect: (options: Pick<WizardOptions, 'installDir'>) => Promise<boolean>;
  getGenerateFileContentPrompt: ({ context }: { context: GenerateFileContentContext }) => Promise<FileChange>;
};

export const INTEGRATION_CONFIG: Record<Integration, IntegrationConfig> = {
  [Integration.nextjs]: {
    filterPatterns: ['**/*.{tsx,ts,jsx,js,mjs,cjs}'],
    ignorePatterns: ['node_modules', 'dist', 'build', 'public', 'static', 'next-env.d.*'],
    detect: async (options: WizardOptions) => {
      const packageJson = await getPackageDotJson(options);
      return hasPackageInstalled('next', packageJson);
    },
    getGenerateFileContentPrompt: async ({ context }) => {
      return generateFileContent({ context });
    },
  },
  [Integration.react]: {
    filterPatterns: ['**/*.{tsx,ts,jsx,js}'],
    ignorePatterns: ['node_modules', 'dist', 'build', 'public', 'static', 'assets'],
    detect: async (options: WizardOptions) => {
      const packageJson = await getPackageDotJson(options);
      return hasPackageInstalled('react', packageJson);
    },
    getGenerateFileContentPrompt: async ({ context }) => {
      return generateFileContent({ context });
    },
  },
};
