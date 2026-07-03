import fs from "node:fs/promises";
import path from "node:path";
import { buildReorderPrompt } from "./reorderPrompt.js";

export async function reorderPages({ gemini, imagePaths, skill = "unknown" }) {
  if (!imagePaths?.length) {
    throw new Error("No images provided for page reorder.");
  }

  const parts = [{ text: buildReorderPrompt({ skill }) }];
  for (const imagePath of imagePaths) {
    const filename = path.basename(imagePath);
    const bytes = await fs.readFile(imagePath);
    parts.push({ text: `\nInput filename: ${filename}` });
    parts.push({
      inlineData: {
        mimeType: mimeTypeForImage(imagePath),
        data: bytes.toString("base64"),
      },
    });
  }

  const response = await gemini.ai.models.generateContent({
    model: gemini.model,
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    config: {
      temperature: 0,
      responseMimeType: "application/json",
    },
  });

  return normalizeReorderResult(parseJson(response.text ?? "{}"), imagePaths);
}

function parseJson(text) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(trimmed);
}

function normalizeReorderResult(raw, imagePaths) {
  const expected = new Set(imagePaths.map((imagePath) => path.basename(imagePath)));
  const seen = new Set();
  const ordered = [];

  for (const item of Array.isArray(raw.ordered_files) ? raw.ordered_files : []) {
    const filename = String(item.filename ?? "");
    if (!expected.has(filename) || seen.has(filename)) {
      continue;
    }
    seen.add(filename);
    ordered.push({
      filename,
      position: Number(item.position ?? ordered.length + 1),
      confidence: Number(item.confidence ?? 0),
      evidence: Array.isArray(item.evidence) ? item.evidence : [],
    });
  }

  for (const filename of expected) {
    if (!seen.has(filename)) {
      ordered.push({
        filename,
        position: ordered.length + 1,
        confidence: 0,
        evidence: ["Missing from model output; appended by fallback."],
      });
    }
  }

  ordered.sort((a, b) => a.position - b.position);

  return {
    ordered_files: ordered.map((item, index) => ({ ...item, position: index + 1 })),
    overall_confidence: Number(raw.overall_confidence ?? 0),
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
  };
}

function mimeTypeForImage(imagePath) {
  const lower = imagePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
