import { baseFilterFilesPromptTemplate, baseGenerateFileChangesPromptTemplate } from "../lib/prompts";

export const getFilterFilesPromptTemplate = () => baseFilterFilesPromptTemplate.partial({
  integration_name: 'Next.js',
  integration_rules: `
  - You should implement both posthog-js and posthog-node.
  `,
});

export const getGenerateFileChangesPromptTemplate = () => baseGenerateFileChangesPromptTemplate.partial({
  integration_name: 'Next.js',
  integration_rules: `
  - You should implement both posthog-js and posthog-node.
  `,
});
