import { promises as fs } from "node:fs";

export async function ensureDirectory(directoryPath) {
  await fs.mkdir(directoryPath, { recursive: true });
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function removePath(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
}

