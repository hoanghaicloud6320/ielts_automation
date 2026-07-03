import fs from "node:fs/promises";
import path from "node:path";
import { generateContentWithRetry } from "../ai/generateWithRetry.js";
import { buildUnitGroupingPrompt } from "./unitGroupingPrompt.js";

export async function groupPagesByUnit({ gemini, imagePaths, skill = "unknown" }) {
  if (!imagePaths?.length) {
    return {
      units: [],
      warnings: ["No images provided for unit grouping."],
    };
  }

  const parts = [{ text: buildUnitGroupingPrompt({ skill }) }];
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

  const response = await generateContentWithRetry({
    ai: gemini.ai,
    params: {
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
    },
  });

  return normalizeUnitGrouping(parseJson(response.text ?? "{}"), imagePaths);
}

function parseJson(text) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(trimmed);
}

function normalizeUnitGrouping(raw, imagePaths) {
  const expected = new Set(imagePaths.map((imagePath) => path.basename(imagePath)));
  const assigned = new Set();
  const units = [];

  for (const rawUnit of Array.isArray(raw.units) ? raw.units : []) {
    const files = [];
    const seenInUnit = new Set();
    for (const rawFile of Array.isArray(rawUnit.files) ? rawUnit.files : []) {
      const filename = String(rawFile.filename ?? "");
      if (!expected.has(filename) || seenInUnit.has(filename)) {
        continue;
      }
      seenInUnit.add(filename);
      assigned.add(filename);
      files.push({
        filename,
        confidence: numberOrZero(rawFile.confidence),
        evidence: Array.isArray(rawFile.evidence) ? rawFile.evidence : [],
      });
    }

    if (!files.length) {
      continue;
    }

    units.push({
      unit_id: slugify(rawUnit.unit_id || rawUnit.title || `unit_${units.length + 1}`),
      title: String(rawUnit.title || rawUnit.unit_id || `Unit ${units.length + 1}`),
      confidence: numberOrZero(rawUnit.confidence),
      files,
      warnings: Array.isArray(rawUnit.warnings) ? rawUnit.warnings : [],
    });
  }

  const unassigned = [...expected].filter((filename) => !assigned.has(filename));
  if (unassigned.length) {
    units.push({
      unit_id: "unknown_unit",
      title: "Unknown unit",
      confidence: 0,
      files: unassigned.map((filename) => ({
        filename,
        confidence: 0,
        evidence: ["Missing from model output; assigned by fallback."],
      })),
      warnings: ["Fallback unit for files the model did not assign."],
    });
  }

  if (!units.length) {
    units.push({
      unit_id: "all_pages",
      title: "All pages",
      confidence: 0,
      files: [...expected].map((filename) => ({
        filename,
        confidence: 0,
        evidence: ["Fallback group because model returned no valid units."],
      })),
      warnings: ["Fallback group because model returned no valid units."],
    });
  }

  return {
    units,
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
  };
}

export function slugify(value) {
  const slug = String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return slug || "unit";
}

function numberOrZero(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function mimeTypeForImage(imagePath) {
  const lower = imagePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
