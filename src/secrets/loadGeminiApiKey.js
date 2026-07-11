import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export async function loadGeminiApiKeys({ cwd = process.cwd() } = {}) {
  if (process.env.GEMINI_API_KEY) {
    const keys = parseApiKeys(process.env.GEMINI_API_KEY);
    if (!keys.length) {
      throw new Error("GEMINI_API_KEY is empty.");
    }
    return keys;
  }

  const keyPath = path.join(cwd, "gemini-api-key.txt");
  const keys = parseApiKeys(await fs.readFile(keyPath, "utf8"));
  if (!keys.length) {
    throw new Error(`Gemini API key file is empty: ${keyPath}`);
  }

  return keys;
}

export async function loadGeminiApiKey(options = {}) {
  return (await loadGeminiApiKeys(options)).at(-1);
}

function parseApiKeys(value) {
  return String(value)
    .split(/[\r\n,;]+/)
    .map((line) => line.trim())
    .filter(Boolean);
}
