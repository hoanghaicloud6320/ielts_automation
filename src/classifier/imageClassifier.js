import fs from "node:fs/promises";
import { CLASSIFICATION_PROMPT } from "./classificationPrompt.js";

export function parseClassifierJson(text) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(trimmed);
}

export async function classifyImage({ gemini, imagePath }) {
  const bytes = await fs.readFile(imagePath);
  const response = await gemini.ai.models.generateContent({
    model: gemini.model,
    contents: [
      {
        role: "user",
        parts: [
          { text: CLASSIFICATION_PROMPT },
          {
            inlineData: {
              mimeType: mimeTypeForImage(imagePath),
              data: bytes.toString("base64"),
            },
          },
        ],
      },
    ],
    config: {
      temperature: 0,
      responseMimeType: "application/json",
    },
  });

  return normalizeClassification(parseClassifierJson(response.text ?? "{}"));
}

function mimeTypeForImage(imagePath) {
  const lower = imagePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function normalizeClassification(raw) {
  const primaryLabel = raw.primary_label ?? "unknown_or_needs_review";
  const confidence = Number(raw.confidence ?? 0);

  return {
    primary_label: primaryLabel,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    orientation: raw.orientation ?? "unknown",
    is_completed_by_student: Boolean(raw.is_completed_by_student),
    is_answer_key_or_checked: Boolean(raw.is_answer_key_or_checked),
    evidence: Array.isArray(raw.evidence) ? raw.evidence : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
    should_route_to_review: Boolean(raw.should_route_to_review),
  };
}
