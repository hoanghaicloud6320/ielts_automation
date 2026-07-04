import fs from "node:fs/promises";
import path from "node:path";
import { generateContentWithRetry } from "../ai/generateWithRetry.js";
import { CLASSIFICATION_PROMPT } from "./classificationPrompt.js";

export function parseClassifierJson(text) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(trimmed);
}

export async function classifyImage({ gemini, imagePath }) {
  const bytes = await fs.readFile(imagePath);
  const response = await generateContentWithRetry({
    ai: gemini.ai,
    params: {
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
    },
  });

  return normalizeClassification(parseClassifierJson(response.text ?? "{}"));
}

export async function classifyImagesBatch({ gemini, imagePaths }) {
  if (!imagePaths?.length) {
    return {
      results: [],
      warnings: ["No images provided for batch classification."],
    };
  }

  const parts = [{ text: batchClassificationPrompt() }];
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
      contents: [{ role: "user", parts }],
      config: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    },
  });

  return normalizeBatchClassification(parseClassifierJson(response.text ?? "{}"), imagePaths);
}

function batchClassificationPrompt() {
  return `${CLASSIFICATION_PROMPT}

Batch mode:
- You will receive multiple images, each preceded by "Input filename: ...".
- Classify every provided filename exactly once.
- Use the other images only as context for the same worksheet batch; still classify each image by its own visible content.
- Return the same classification schema per image.

Batch JSON schema:
{
  "results": [
    {
      "filename": "exact input filename",
      "primary_label": "reading | listening | speaking | writing_or_notes | unknown_or_needs_review",
      "confidence": 0.0,
      "orientation": "upright | rotate_90_clockwise | rotate_180 | rotate_90_counterclockwise | unknown",
      "is_completed_by_student": false,
      "is_answer_key_or_checked": false,
      "evidence": ["short reasons"],
      "warnings": ["ambiguity or contamination notes"],
      "should_route_to_review": false
    }
  ],
  "warnings": []
}`;
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

function normalizeBatchClassification(raw, imagePaths) {
  const expected = new Set(imagePaths.map((imagePath) => path.basename(imagePath)));
  const seen = new Set();
  const results = [];

  for (const item of Array.isArray(raw.results) ? raw.results : []) {
    const filename = String(item.filename ?? "");
    if (!expected.has(filename) || seen.has(filename)) {
      continue;
    }
    seen.add(filename);
    results.push({
      filename,
      classification: normalizeClassification(item),
    });
  }

  for (const filename of expected) {
    if (!seen.has(filename)) {
      results.push({
        filename,
        classification: normalizeClassification({
          primary_label: "unknown_or_needs_review",
          confidence: 0,
          warnings: ["Missing from batch classifier output; routed to review."],
          should_route_to_review: true,
        }),
      });
    }
  }

  return {
    results,
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
  };
}
