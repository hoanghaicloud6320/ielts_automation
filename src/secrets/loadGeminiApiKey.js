import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export async function loadGeminiApiKey({ cwd = process.cwd() } = {}) {
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY.trim();
  }

  const keyPath = path.join(cwd, "gemini-api-key.txt");
  const key = (await fs.readFile(keyPath, "utf8")).trim();
  if (!key) {
    throw new Error(`Gemini API key file is empty: ${keyPath}`);
  }

  return key;
}
