import fs from "node:fs/promises";
import path from "node:path";
import { generateContentWithRetry } from "../ai/generateWithRetry.js";

export async function inventorySkillPages({ gemini, imagePaths, skill = "unknown", log = null }) {
  const inventories = [];

  for (const imagePath of imagePaths) {
    const filename = path.basename(imagePath);
    log?.(`Inventoring ${skill}/${filename}...`);
    inventories.push(await inventoryPage({ gemini, imagePath, skill, log }));
  }

  return inventories;
}

export async function inventoryPage({ gemini, imagePath, skill = "unknown", log = null }) {
  const filename = path.basename(imagePath);
  const bytes = await fs.readFile(imagePath);
  const response = await generateContentWithRetry({
    ai: gemini.ai,
    log,
    params: {
      model: gemini.model,
      contents: [
        {
          role: "user",
          parts: [
            { text: buildPageInventoryPrompt({ filename, skill }) },
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

  return normalizeInventory(parseJson(response.text ?? "{}"), filename);
}

function buildPageInventoryPrompt({ filename, skill }) {
  return `You inspect exactly one IELTS worksheet photo and create a page inventory.

Skill: ${skill}
Filename: ${filename}

Task:
- Mentally rotate the image if needed.
- Identify every visible page or page-like region.
- Preserve the filename exactly as given.
- If this is a two-page spread, create one visible_regions item for the left page and one for the right page.
- If only one page is visible, create one visible_regions item with region "whole image".
- Include visible printed page numbers when available.
- Include visible unit/passage/audio headings and topic titles.
- Include enough local section headings/exercise numbers so a later text-only sort/group step can place the page correctly.

Skill-specific hints:
- reading: identify Reading Passage number/title and whether this region is passage text, questions, or both.
- speaking: identify Unit number/title, page number, and exercise headings/numbers.
- listening: identify audio number/page markers, page number, blue marker numbers, and whether this region belongs to one audio set.

Return strict JSON only. No Markdown.

Schema:
{
  "filename": "${filename}",
  "orientation": "upright | rotate_90_clockwise | rotate_180 | rotate_90_counterclockwise | unknown",
  "visible_regions": [
    {
      "region": "whole image | left page | right page | top half | bottom half",
      "visible_pages": ["74"],
      "visible_units": [
        {
          "unit_id": "unit_37",
          "title": "Unit 37 - Football",
          "type": "unit | reading_passage | audio | unknown",
          "confidence": 0.0
        }
      ],
      "section_headings": ["1 Basic vocabulary", "2 Players' positions"],
      "exercise_numbers": ["1", "2"],
      "blue_markers": ["1", "6"],
      "evidence": ["short visual reason"]
    }
  ],
  "warnings": []
}`;
}

function normalizeInventory(raw, filename) {
  return {
    filename,
    orientation: String(raw.orientation || "unknown"),
    visible_regions: (Array.isArray(raw.visible_regions) ? raw.visible_regions : []).map((region) => ({
      region: String(region.region || "whole image"),
      visible_pages: stringArray(region.visible_pages),
      visible_units: (Array.isArray(region.visible_units) ? region.visible_units : []).map((unit) => ({
        unit_id: String(unit.unit_id || unit.title || "unknown"),
        title: String(unit.title || unit.unit_id || "Unknown"),
        type: String(unit.type || "unknown"),
        confidence: numberOrDefault(unit.confidence, 0),
      })),
      section_headings: stringArray(region.section_headings),
      exercise_numbers: stringArray(region.exercise_numbers),
      blue_markers: stringArray(region.blue_markers),
      evidence: stringArray(region.evidence),
    })),
    warnings: stringArray(raw.warnings),
  };
}

function parseJson(text) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(trimmed);
}

function stringArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function numberOrDefault(value, fallback) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

function mimeTypeForImage(imagePath) {
  const lower = imagePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
