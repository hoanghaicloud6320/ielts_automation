import fs from "node:fs/promises";
import path from "node:path";
import { generateContentWithRetry } from "../ai/generateWithRetry.js";
import { answerPromptForSkill, answerPromptForUnit } from "./answerPrompts.js";

export async function extractAnswersForUnit({ gemini, skill, unit, imagePaths, log = null }) {
  if (!imagePaths.length) {
    return {
      skill,
      unit_id: unit?.unit_id ?? "unknown",
      title: unit?.title ?? "",
      skipped: true,
      reason: "No images for unit.",
      text: "",
    };
  }

  const parts = [{ text: answerPromptForUnit({ skill, unit }) }];
  const fileScope = new Map(
    (Array.isArray(unit?.source_files) ? unit.source_files : []).map((file) => [file.filename, file]),
  );

  for (const imagePath of imagePaths) {
    const bytes = await fs.readFile(imagePath);
    const filename = path.basename(imagePath).replace(/^\d+-/, "");
    const scope = fileScope.get(filename);
    const region = scope?.page_region || "whole image";
    const pages =
      Array.isArray(scope?.visible_pages) && scope.visible_pages.length
        ? ` Visible pages for this unit: ${scope.visible_pages.join(", ")}.`
        : "";
    parts.push({
      text: `\nImage file: ${path.basename(imagePath)}\nAllowed scope for current unit: ${region}.${pages} Ignore every other visible page/region in this image.`,
    });
    parts.push({
      inlineData: {
        mimeType: mimeTypeForImage(imagePath),
        data: bytes.toString("base64"),
      },
    });
  }

  const response = await generateContentWithRetry({
    ai: gemini.ai,
    log,
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
      },
    },
  });

  return {
    skill,
    unit_id: unit?.unit_id ?? "unknown",
    title: unit?.title ?? "",
    skipped: false,
    text: response.text ?? "",
  };
}

export async function extractAnswersForSkill({ gemini, skill, imagePaths }) {
  if (!imagePaths.length) {
    return {
      skill,
      skipped: true,
      reason: "No images for skill.",
      text: "",
    };
  }

  const parts = [{ text: answerPromptForSkill(skill) }];
  for (const imagePath of imagePaths) {
    const bytes = await fs.readFile(imagePath);
    parts.push({
      text: `\nImage file: ${path.basename(imagePath)}`,
    });
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
      },
    },
  });

  return {
    skill,
    skipped: false,
    text: response.text ?? "",
  };
}

function mimeTypeForImage(imagePath) {
  const lower = imagePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
