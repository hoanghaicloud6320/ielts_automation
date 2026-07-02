import { GoogleGenAI } from "@google/genai";
import { DEFAULT_GEMINI_MODEL } from "../config/defaults.js";

export function createGeminiClient({ apiKey, model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL }) {
  if (!apiKey) {
    throw new Error("Missing Gemini API key.");
  }

  return {
    model,
    ai: new GoogleGenAI({ apiKey }),
  };
}
