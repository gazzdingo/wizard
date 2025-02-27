import path from "path";
import fs from "fs";

export const GLOBAL_IGNORE_PATTERN = [
  "node_modules",
  "dist",
  "build",
  "public",
  "static",
  ".git",
  ".next",

];
export async function getAllFilesInProject(dir: string): Promise<string[]> {
  let results: string[] = [];

  const entries = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (GLOBAL_IGNORE_PATTERN.some((pattern) => fullPath.includes(pattern))) {
      continue;
    }

    if (entry.isDirectory()) {
      // Recursively get files from subdirectories
      const subDirFiles = await getAllFilesInProject(fullPath);
      results = results.concat(subDirFiles);
    } else {
      results.push(fullPath);
    }
  }

  return results;
}