import fs from "node:fs/promises";
import path from "node:path";
import { generateContentWithRetry } from "../ai/generateWithRetry.js";
import { slugify } from "./unitGrouper.js";

export async function sortAndGroupSkillPages({ gemini, imagePaths, skill = "unknown" }) {
  if (!imagePaths?.length) {
    return {
      global_order: [],
      units: [],
      warnings: ["No images provided for skill sort/group."],
    };
  }

  const parts = [{ text: buildSkillSortGroupPrompt({ skill }) }];
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

  return normalizeSortGroupResult(parseJson(response.text ?? "{}"), imagePaths);
}

function buildSkillSortGroupPrompt({ skill }) {
  return `You sort and group shuffled IELTS worksheet photos for one already-classified skill.

Skill: ${skill}

Task:
1. First infer the best global page/content order across all provided photos for this skill.
2. Then infer units/passages/audio sets from that ordered context.
3. A single photo may contain two neighboring units, usually on left/right pages. Include that filename in both units and set page_region precisely, for example "left page only", "right page only", "whole image", or "top half".

Important rules:
- Use visible page numbers, unit numbers, passage numbers, audio/page markers, headings, exercise sequence, and left/right spread layout.
- Do not trust filenames as order.
- Do not mix different units just because they share one cross-unit photo.
- If a spread shows Unit A on the left and Unit B on the right, assign the same filename to both units with different page_region values.
- If a page is an intro/end page for a neighboring unit, keep it out of the current unit unless its visible heading/topic belongs there.
- For reading, group by Reading Passage/article/source passage, not by every exercise section.
- For speaking, group by Unit number/topic.
- For listening, group by audio number/worksheet set. Prefer audio/page marker numbers if visible.
- Keep enough evidence for later debugging.

Return strict JSON only. No Markdown.

Schema:
{
  "global_order": [
    {
      "filename": "exact input filename",
      "position": 1,
      "visible_pages": ["74", "75"],
      "visible_units": ["Unit 36", "Unit 37"],
      "orientation_note": "upright | needs rotation | uncertain",
      "evidence": ["short reason"]
    }
  ],
  "units": [
    {
      "unit_id": "unit_37",
      "title": "Unit 37 - Football",
      "confidence": 0.0,
      "files": [
        {
          "filename": "exact input filename",
          "position": 1,
          "page_region": "right page only",
          "visible_pages": ["75"],
          "confidence": 0.0,
          "evidence": ["why this part belongs to this unit"]
        }
      ],
      "warnings": []
    }
  ],
  "warnings": []
}`;
}

function parseJson(text) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(trimmed);
}

function normalizeSortGroupResult(raw, imagePaths) {
  const expected = new Set(imagePaths.map((imagePath) => path.basename(imagePath)));
  const globalSeen = new Set();
  const globalOrder = [];

  for (const item of Array.isArray(raw.global_order) ? raw.global_order : []) {
    const filename = String(item.filename ?? "");
    if (!expected.has(filename) || globalSeen.has(filename)) {
      continue;
    }
    globalSeen.add(filename);
    globalOrder.push({
      filename,
      position: numberOrDefault(item.position, globalOrder.length + 1),
      visible_pages: stringArray(item.visible_pages),
      visible_units: stringArray(item.visible_units),
      orientation_note: String(item.orientation_note || "uncertain"),
      evidence: stringArray(item.evidence),
    });
  }

  for (const filename of expected) {
    if (!globalSeen.has(filename)) {
      globalOrder.push({
        filename,
        position: globalOrder.length + 1,
        visible_pages: [],
        visible_units: [],
        orientation_note: "uncertain",
        evidence: ["Missing from model global_order; appended by fallback."],
      });
    }
  }

  globalOrder.sort((a, b) => a.position - b.position);
  const globalPosition = new Map(globalOrder.map((item, index) => [item.filename, index + 1]));
  const assigned = new Set();
  const units = [];

  for (const rawUnit of Array.isArray(raw.units) ? raw.units : []) {
    const files = [];
    const seenInUnit = new Set();
    for (const rawFile of Array.isArray(rawUnit.files) ? rawUnit.files : []) {
      const filename = String(rawFile.filename ?? "");
      const pageRegion = String(rawFile.page_region || "whole image");
      const unitKey = `${filename}\n${pageRegion}`;
      if (!expected.has(filename) || seenInUnit.has(unitKey)) {
        continue;
      }
      seenInUnit.add(unitKey);
      assigned.add(filename);
      files.push({
        filename,
        position: numberOrDefault(rawFile.position, globalPosition.get(filename) ?? files.length + 1),
        page_region: pageRegion,
        visible_pages: stringArray(rawFile.visible_pages),
        confidence: numberOrDefault(rawFile.confidence, 0),
        evidence: stringArray(rawFile.evidence),
      });
    }

    if (!files.length) {
      continue;
    }

    files.sort((a, b) => a.position - b.position);
    units.push({
      unit_id: slugify(rawUnit.unit_id || rawUnit.title || `unit_${units.length + 1}`),
      title: String(rawUnit.title || rawUnit.unit_id || `Unit ${units.length + 1}`),
      confidence: numberOrDefault(rawUnit.confidence, 0),
      files: files.map((file, index) => ({ ...file, position: index + 1 })),
      warnings: stringArray(rawUnit.warnings),
    });
  }

  const unassigned = [...expected].filter((filename) => !assigned.has(filename));
  if (unassigned.length) {
    units.push({
      unit_id: "unknown_unit",
      title: "Unknown unit",
      confidence: 0,
      files: unassigned
        .sort((a, b) => (globalPosition.get(a) ?? 9999) - (globalPosition.get(b) ?? 9999))
        .map((filename, index) => ({
          filename,
          position: index + 1,
          page_region: "whole image",
          visible_pages: [],
          confidence: 0,
          evidence: ["Missing from model units; assigned by fallback."],
        })),
      warnings: ["Fallback unit for files the model did not assign."],
    });
  }

  if (!units.length) {
    units.push({
      unit_id: "all_pages",
      title: "All pages",
      confidence: 0,
      files: globalOrder.map((item, index) => ({
        filename: item.filename,
        position: index + 1,
        page_region: "whole image",
        visible_pages: item.visible_pages,
        confidence: 0,
        evidence: ["Fallback group because model returned no valid units."],
      })),
      warnings: ["Fallback group because model returned no valid units."],
    });
  }

  return {
    global_order: globalOrder.map((item, index) => ({ ...item, position: index + 1 })),
    units,
    warnings: stringArray(raw.warnings),
  };
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
