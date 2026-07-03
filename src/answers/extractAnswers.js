import fs from "node:fs/promises";
import path from "node:path";
import { answerPromptForSkill } from "./answerPrompts.js";

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
