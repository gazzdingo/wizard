import { PromptTemplate } from "@langchain/core/prompts";

export const filterFilesPromptTemplate = new PromptTemplate({
  inputVariables: ['documentation', 'file_list'],
  template: `You are a code analysis assistant.
Given the following list of Next.js file paths from a project, determine which files are likely to require modifications 
to integrate PostHog. Use the installation documentation as a reference for what files might need modifications, do not include files that are unlikely to require modification based on the documentation.

- If you would like to create a new file, you can include the file path in your response.
- If you would like to modify an existing file, you can include the file path in your response.

You should return all files that you think will be required to look at or modify to integrate PostHog. You should return them in the order you would like to see them processed, with new files first, followed by the files that you want to update to integrate PostHog.

Rules:
- Only return files that you think will be required to look at or modify to integrate PostHog.
- Do not return files that are unlikely to require modification based on the documentation.
- If you are unsure, return the file.
- If you create a new file, it should not conflict with any existing files.
- If the user is using TypeScript, you should return .ts and .tsx files.
- You should implement both posthog-js and posthog-node.

Installation documentation:
{documentation}

All current files in the repository:

{file_list}`
})

export const generateFileChangesPromptTemplate = new PromptTemplate({
  inputVariables: ['file_content', 'documentation', 'file_path', 'changes'],
  template: `You are GitHog, a master AI programming assistant that implements PostHog for Next.js projects.

Your task is to update the file to integrate PostHog according to the documentation.
Do not return a diff—return the complete updated file content.
Follow these rules:
- Preserve the existing code formatting and style.
- Only make the changes required by the documentation.
- If no changes are needed, return the file as-is.
- Line numbers in the provided file content are for reference only and should not appear in the output.
- If the current file is empty, and you think it should be created, you can add the contents of the new file.


CONTEXT
---

Documentation for integrating PostHog with Next.js:
{documentation}

The file you are updating is:
{file_path}

You have already made changes to the following files:
{changes}

Below is the current file contents:
{file_content}`
})
