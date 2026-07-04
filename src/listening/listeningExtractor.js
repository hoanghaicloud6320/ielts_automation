import fs from "node:fs/promises";
import path from "node:path";
import { generateContentWithRetry } from "../ai/generateWithRetry.js";
import {
  listeningChunkSkeletonReviewPrompt,
  listeningChunkSkeletonPrompt,
  listeningDocumentChunkSkeletonPrompt,
  listeningFillSkeletonPrompt,
  listeningOcrDocumentPrompt,
  listeningSkeletonPrompt,
  listeningTranscriptPrompt,
} from "./listeningPrompts.js";

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

export async function buildListeningSkeleton({ gemini, audioName, transcript = "", imagePaths, log = null }) {
  const parts = [{ text: listeningSkeletonPrompt({ audioName, transcript }) }];
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

export async function scanListeningWorksheetDocument({ gemini, audioName, imagePaths, log = null }) {
  const parts = [{ text: listeningOcrDocumentPrompt({ audioName }) }];
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

export async function buildListeningDocumentChunkSkeleton({
  gemini,
  audioName,
  transcript = "",
  ocrDocument = "",
  imagePaths = [],
  start,
  end,
  anchors = [],
  log = null,
}) {
  const parts = [
    { text: listeningDocumentChunkSkeletonPrompt({ audioName, transcript, ocrDocument, start, end, anchors }) },
  ];
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

export async function buildListeningSkeletonFromDocumentInChunks({
  gemini,
  audioName,
  transcript = "",
  ocrDocument = "",
  imagePaths = [],
  chunks,
  log = null,
}) {
  const chunkSkeletons = [];

  for (const chunk of chunks) {
    log?.(`Building listening OCR skeleton chunk ${chunk.start}-${chunk.end} for ${audioName}...`);
    const text = await buildListeningDocumentChunkSkeleton({
      gemini,
      audioName,
      transcript,
      ocrDocument,
      imagePaths,
      start: chunk.start,
      end: chunk.end,
      anchors: chunk.anchors ?? [],
      log,
    });
    chunkSkeletons.push({ ...chunk, text, json: parseJsonObject(text) });
  }

  return {
    chunks: chunkSkeletons,
    combined: combineListeningSkeletonChunks({ audioName, chunks: chunkSkeletons }),
  };
}

export async function buildListeningChunkSkeleton({
  gemini,
  audioName,
  transcript = "",
  imagePaths,
  start,
  end,
  anchors = [],
  log = null,
}) {
  const parts = [{ text: listeningChunkSkeletonPrompt({ audioName, transcript, start, end, anchors }) }];
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

export async function buildListeningSkeletonInChunks({
  gemini,
  audioName,
  transcript = "",
  imagePaths,
  chunks,
  review = false,
  log = null,
}) {
  const chunkSkeletons = [];

  for (const chunk of chunks) {
    log?.(`Building listening skeleton chunk ${chunk.start}-${chunk.end} for ${audioName}...`);
    const text = await buildListeningChunkSkeleton({
      gemini,
      audioName,
      transcript,
      imagePaths,
      start: chunk.start,
      end: chunk.end,
      anchors: chunk.anchors ?? [],
      log,
    });
    let finalText = text;
    if (review) {
      log?.(`Reviewing listening skeleton chunk ${chunk.start}-${chunk.end} for ${audioName}...`);
      finalText = await reviewListeningChunkSkeleton({
        gemini,
        audioName,
        transcript,
        skeleton: text,
        imagePaths,
        log,
      });
    }
    chunkSkeletons.push({ ...chunk, text: finalText, draftText: text, json: parseJsonObject(finalText) });
  }

  return {
    chunks: chunkSkeletons,
    combined: combineListeningSkeletonChunks({ audioName, chunks: chunkSkeletons }),
  };
}

export async function reviewListeningChunkSkeleton({
  gemini,
  audioName,
  transcript = "",
  skeleton,
  imagePaths,
  log = null,
}) {
  const parts = [{ text: listeningChunkSkeletonReviewPrompt({ audioName, transcript, skeleton }) }];
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

export async function fillListeningSkeletonInChunks({
  gemini,
  audioName,
  transcript,
  skeleton,
  blocksPerChunk = 2,
  imagePaths = [],
  log = null,
}) {
  const skeletonJson = typeof skeleton === "string" ? parseJsonObject(skeleton) : skeleton;
  const blockChunks = chunkArray(skeletonJson.blocks ?? [], blocksPerChunk);
  const outputs = [];

  for (const [index, blocks] of blockChunks.entries()) {
    const chunkSkeleton = {
      audio_name: skeletonJson.audio_name ?? audioName,
      visible_markers: blocks.map((block) => block.marker).filter((marker) => marker != null),
      expected_blank_count: blocks.reduce((count, block) => count + (block.blanks?.length ?? 0), 0),
      blocks,
      warnings: skeletonJson.warnings ?? [],
    };
    const start = blocks[0]?.start ?? "?";
    const end = blocks.at(-1)?.end ?? "?";
    log?.(`Filling listening skeleton chunk ${start}-${end} for ${audioName}...`);
    const text = await fillListeningSkeleton({
      gemini,
      audioName,
      transcript,
      skeleton: JSON.stringify(chunkSkeleton, null, 2),
      imagePaths,
      log,
    });
    outputs.push({
      index: index + 1,
      start,
      end,
      text,
      skeleton: chunkSkeleton,
    });
  }

  return {
    chunks: outputs,
    combined: outputs.map((output) => output.text.trim()).filter(Boolean).join("\n\n---\n\n"),
  };
}

export function createTwoBlockSkeletonChunksFromMarkers(markers) {
  const sortedMarkers = [...new Set(markers.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  const chunks = [];

  for (let index = 0; index < sortedMarkers.length; index += 2) {
    const anchors = sortedMarkers.slice(index, index + 2);
    if (!anchors.length) {
      continue;
    }
    const start = anchors[0];
    const nextChunkStart = sortedMarkers[index + 2];
    const end = nextChunkStart ? nextChunkStart - 1 : anchors.at(-1) + 4;
    chunks.push({ start, end, anchors });
  }

  return chunks;
}

export function extractListeningMarkersFromDocument(ocrDocument) {
  const markers = [];
  const markerPattern = /\[\[BLANK\b[^\]]*\bmarker=(\d+)\b[^\]]*\]\]/gi;
  for (const match of String(ocrDocument ?? "").matchAll(markerPattern)) {
    markers.push(Number(match[1]));
  }
  return [...new Set(markers.filter(Number.isFinite))].sort((a, b) => a - b);
}

export function combineListeningSkeletonChunks({ audioName = "audio", chunks }) {
  const blocks = chunks.flatMap((chunk) => chunk.json?.blocks ?? []);
  const visibleMarkers = [
    ...new Set(
      chunks
        .flatMap((chunk) => chunk.json?.visible_markers ?? chunk.anchors ?? [])
        .map(Number)
        .filter(Number.isFinite),
    ),
  ].sort((a, b) => a - b);
  const warnings = chunks.flatMap((chunk) => chunk.json?.warnings ?? []);
  const blankNumbers = blocks.flatMap((block) => block.blanks?.map((blank) => Number(blank.number)) ?? []);
  const expectedBlankCount = blankNumbers.length ? Math.max(...blankNumbers) : 0;

  return {
    audio_name: audioName,
    visible_markers: visibleMarkers,
    expected_blank_count: expectedBlankCount,
    blocks,
    warnings,
  };
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

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const extracted = extractFirstJsonObject(text);
    if (!extracted) {
      throw new Error("Gemini did not return a JSON object.");
    }
    return JSON.parse(extracted);
  }
}

function extractFirstJsonObject(text) {
  const source = String(text ?? "");
  const start = source.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  return null;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function mimeTypeForImage(imagePath) {
  const lower = imagePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
