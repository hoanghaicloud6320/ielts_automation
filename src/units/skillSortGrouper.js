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

export async function sortAndGroupSkillPagesFromInventory({
  gemini,
  imagePaths,
  inventories,
  skill = "unknown",
}) {
  if (!imagePaths?.length) {
    return {
      global_order: [],
      units: [],
      warnings: ["No images provided for skill sort/group."],
    };
  }

  const response = await generateContentWithRetry({
    ai: gemini.ai,
    params: {
      model: gemini.model,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildInventorySortGroupPrompt({
                skill,
                inventories,
              }),
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

  const normalized = normalizeSortGroupResult(parseJson(response.text ?? "{}"), imagePaths);
  if (skill === "speaking") {
    return repairSpeakingSortGroupFromInventory({ result: normalized, inventories, imagePaths });
  }

  return normalized;
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

function buildInventorySortGroupPrompt({ skill, inventories }) {
  return `You sort and group IELTS worksheet pages for one already-classified skill using a text inventory.

Skill: ${skill}

You are not receiving images in this step. Use only the inventory JSON below. Each inventory item was created from exactly one image, so filenames are reliable.

Task:
1. Infer the best global page/content order across all provided filenames for this skill.
2. Infer units/passages/audio sets from the ordered context.
3. If one image contains two neighboring pages/units, include that filename in both units with the precise page_region from the inventory, for example "left page only", "right page only", or "whole image".

Important rules:
- Preserve every filename exactly.
- Do not invent filenames.
- Use visible page numbers and unit/passage/audio headings as the strongest signals.
- For speaking, a unit usually spans the page with its unit heading and following pages until the next unit heading.
- For speaking, a new unit begins at the region where the unit heading is visibly printed, not on the previous page.
- For speaking, if a region has no visible new unit heading, assign it to the previous visible unit in page order until a later region clearly starts the next unit.
- For speaking, exercise numbers are local evidence: if page 73 has Unit 36 exercises 1-5 and page 74 has exercises 6-7 with no Unit 37 heading, page 74 continues Unit 36. If page 77 has Unit 38 exercises 1-3 and page 78 has exercises 4-6 with no Unit 39 heading, page 78 continues Unit 38.
- Do not assign a region to a next unit merely because the next page/region starts that unit.
- For reading, group by Reading Passage/article/source passage.
- For listening, group by audio number/worksheet set.
- If an inventory region says Unit 36 on the left and Unit 37 on the right, assign the filename to both units with different page_region values.
- The page_region in output must match the inventory region: "left page only" for "left page", "right page only" for "right page", and "whole image" for "whole image".
- If a filename has multiple regions, do not use "whole image" for a unit unless the whole image belongs to that same unit.

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
          "evidence": ["why this region belongs to this unit"]
        }
      ],
      "warnings": []
    }
  ],
  "warnings": []
}

Inventory JSON:
${JSON.stringify(inventories, null, 2)}`;
}

function parseJson(text) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return JSON.parse(extractFirstJsonObject(trimmed));
  }
}

function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  if (start === -1) {
    throw new Error("No JSON object found in Gemini response.");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  throw new Error("Unterminated JSON object in Gemini response.");
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

function repairSpeakingSortGroupFromInventory({ result, inventories, imagePaths }) {
  const regions = flattenInventoryRegions(inventories);
  const explicitStarts = regions
    .map((region) => ({ ...region, explicitUnit: explicitSpeakingUnit(region) }))
    .filter((region) => region.explicitUnit && region.pageNumber !== null)
    .sort((a, b) => a.pageNumber - b.pageNumber);

  if (explicitStarts.length < 2) {
    return result;
  }

  const orderedRegions = regions
    .map((region, index) => ({ ...region, inputIndex: index }))
    .sort((a, b) => {
      if (a.pageNumber !== null && b.pageNumber !== null) return a.pageNumber - b.pageNumber;
      if (a.pageNumber !== null) return -1;
      if (b.pageNumber !== null) return 1;
      return a.inputIndex - b.inputIndex;
    });

  const unitsById = new Map();
  let currentUnit = null;

  for (const region of orderedRegions) {
    const start = explicitStarts.find((candidate) => candidate.filename === region.filename && candidate.region === region.region);
    if (start?.explicitUnit) {
      currentUnit = start.explicitUnit;
    } else if (region.pageNumber !== null) {
      const previousStart = [...explicitStarts].reverse().find((candidate) => candidate.pageNumber <= region.pageNumber);
      currentUnit = previousStart?.explicitUnit ?? currentUnit;
    }

    if (!currentUnit) {
      continue;
    }

    if (!unitsById.has(currentUnit.unit_id)) {
      unitsById.set(currentUnit.unit_id, {
        unit_id: currentUnit.unit_id,
        title: currentUnit.title,
        confidence: 0.95,
        files: [],
        warnings: [],
      });
    }

    const unit = unitsById.get(currentUnit.unit_id);
    if (unit.files.some((file) => file.filename === region.filename && file.page_region === pageRegionFor(region.region))) {
      continue;
    }

    unit.files.push({
      filename: region.filename,
      position: unit.files.length + 1,
      page_region: pageRegionFor(region.region),
      visible_pages: region.visible_pages,
      confidence: region.explicitUnit ? 1 : 0.9,
      evidence: region.explicitUnit
        ? [`Explicit unit heading detected for ${currentUnit.title}.`]
        : [`Assigned by speaking page-order repair after ${currentUnit.title} start.`],
    });
  }

  const repairedUnits = [...unitsById.values()].filter((unit) => unit.files.length);
  if (!repairedUnits.length) {
    return result;
  }

  const filenameOrder = new Map(imagePaths.map((imagePath, index) => [path.basename(imagePath), index + 1]));
  const globalOrder = [...new Map(orderedRegions.map((region) => [region.filename, region])).values()]
    .sort((a, b) => {
      if (a.pageNumber !== null && b.pageNumber !== null) return a.pageNumber - b.pageNumber;
      return (filenameOrder.get(a.filename) ?? 9999) - (filenameOrder.get(b.filename) ?? 9999);
    })
    .map((region, index) => ({
      filename: region.filename,
      position: index + 1,
      visible_pages: region.visible_pages,
      visible_units: region.visible_units.map((unit) => unit.title),
      orientation_note: region.orientation,
      evidence: region.evidence,
    }));

  return {
    global_order: globalOrder,
    units: repairedUnits,
    warnings: [
      ...result.warnings,
      "Speaking groups repaired from per-image inventory using explicit unit-heading page starts.",
    ],
  };
}

function flattenInventoryRegions(inventories) {
  const regions = [];
  for (const inventory of inventories ?? []) {
    for (const rawRegion of inventory.visible_regions ?? []) {
      const visiblePages = stringArray(rawRegion.visible_pages);
      regions.push({
        filename: inventory.filename,
        orientation: inventory.orientation || "unknown",
        region: String(rawRegion.region || "whole image"),
        pageNumber: firstNumber(visiblePages),
        visible_pages: visiblePages,
        visible_units: Array.isArray(rawRegion.visible_units) ? rawRegion.visible_units : [],
        section_headings: stringArray(rawRegion.section_headings),
        exercise_numbers: stringArray(rawRegion.exercise_numbers),
        evidence: stringArray(rawRegion.evidence),
      });
    }
  }
  return regions;
}

function explicitSpeakingUnit(region) {
  const evidenceText = region.evidence.join(" ").toLowerCase();
  const hasExplicitHeadingEvidence = /\bheading\b|\bunit title\b|\btitle\b/.test(evidenceText);
  const looksLikeUnitStart = region.exercise_numbers.includes("1");
  if (!hasExplicitHeadingEvidence && !looksLikeUnitStart) {
    return null;
  }

  for (const unit of region.visible_units) {
    const unitText = `${unit.unit_id ?? ""} ${unit.title ?? ""}`;
    const match = unitText.match(/\bunit[_\s-]*(\d+)\b/i);
    if (!match) {
      continue;
    }

    const number = match[1];
    return {
      unit_id: slugify(`unit_${number}`),
      title: unit.title && /unit/i.test(unit.title) ? String(unit.title) : `Unit ${number}`,
    };
  }

  return null;
}

function pageRegionFor(region) {
  const lower = String(region || "").toLowerCase();
  if (lower.includes("left")) return "left page only";
  if (lower.includes("right")) return "right page only";
  return "whole image";
}

function firstNumber(values) {
  for (const value of values) {
    const match = String(value).match(/\d+/);
    if (match) {
      return Number(match[0]);
    }
  }
  return null;
}
