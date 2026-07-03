import fs from "node:fs/promises";
import path from "node:path";
import { generateContentWithRetry } from "../ai/generateWithRetry.js";
import { listeningFillSkeletonPrompt, listeningSkeletonPrompt, listeningTranscriptPrompt } from "./listeningPrompts.js";

export async function transcribeListeningAudio({ gemini, audioName, audioPart, log = null }) {
  const response = await generateContentWithRetry({
    ai: gemini.ai,
    log,
    params: {
      model: gemini.model,
      contents: [
        {
          role: "user",
          parts: [{ text: listeningTranscriptPrompt({ audioName }) }, audioPart],
        },
      ],
      config: {
        temperature: 0,
      },
    },
  });

  return response.text ?? "";
}

export async function buildListeningSkeleton({ gemini, audioName, imagePaths, log = null }) {
  const parts = [{ text: listeningSkeletonPrompt({ audioName }) }];
  await addImages(parts, imagePaths);

  const response = await generateContentWithRetry({
    ai: gemini.ai,
    log,
    params: {
      model: gemini.model,
      contents: [{ role: "user", parts }],
      config: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    },
  });

  return response.text ?? "";
}

export async function fillListeningSkeleton({
  gemini,
  audioName,
  transcript,
  skeleton,
  imagePaths = [],
  log = null,
}) {
  const parts = [{ text: listeningFillSkeletonPrompt({ audioName, transcript, skeleton }) }];
  await addImages(parts, imagePaths);

  const response = await generateContentWithRetry({
    ai: gemini.ai,
    log,
    params: {
      model: gemini.model,
      contents: [{ role: "user", parts }],
      config: {
        temperature: 0,
      },
    },
  });

  return response.text ?? "";
}

async function addImages(parts, imagePaths) {
  for (const imagePath of imagePaths) {
    const bytes = await fs.readFile(imagePath);
    parts.push({ text: `\nWorksheet image: ${path.basename(imagePath)}` });
    parts.push({
      inlineData: {
        mimeType: mimeTypeForImage(imagePath),
        data: bytes.toString("base64"),
      },
    });
  }
}

function mimeTypeForImage(imagePath) {
  const lower = imagePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
