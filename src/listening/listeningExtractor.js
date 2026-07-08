import fs from "node:fs/promises";
import path from "node:path";
import { generateContentWithRetry } from "../ai/generateWithRetry.js";
import { DEFAULT_GEMINI_MODEL } from "../config/defaults.js";
import {
  listeningChunkSkeletonReviewPrompt,
  listeningChunkSkeletonPrompt,
  listeningDocumentChunkSkeletonPrompt,
  listeningFillSkeletonPrompt,
  listeningMarkerBlockRepairPrompt,
  listeningMarkerBlankInventoryPrompt,
  listeningMarkerBlankInventoryRepairPrompt,
  listeningOcrDocumentPrompt,
  listeningSkeletonPrompt,
  listeningTranscriptPrompt,
} from "./listeningPrompts.js";

const LISTENING_WORKSHEET_OCR_MODEL = DEFAULT_GEMINI_MODEL;

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

export async function scanListeningWorksheetDocument({ gemini, audioName, transcript = "", imagePaths, log = null }) {
  const parts = [{ text: listeningOcrDocumentPrompt({ audioName, transcript }) }];
  await addImages(parts, imagePaths);

  const response = await generateContentWithRetry({
    ai: gemini.ai,
    log,
    params: {
      model: LISTENING_WORKSHEET_OCR_MODEL,
      contents: [{ role: "user", parts }],
      config: {
        temperature: 0,
        thinkingConfig: {
          thinkingLevel: "high",
        },
      },
    },
  });

  return response.text ?? "";
}

export async function extractListeningMarkerBlankInventory({
  gemini,
  audioName,
  transcript = "",
  ocrDocument = "",
  imagePaths,
  log = null,
}) {
  const parts = [{ text: listeningMarkerBlankInventoryPrompt({ audioName, transcript, ocrDocument }) }];
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

export async function repairListeningMarkerBlankInventory({
  gemini,
  audioName,
  transcript = "",
  ocrDocument = "",
  inventory = "",
  expectedMarkers = [],
  imagePaths,
  log = null,
}) {
  const parts = [
    { text: listeningMarkerBlankInventoryRepairPrompt({ audioName, transcript, ocrDocument, inventory, expectedMarkers }) },
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

export async function repairListeningMarkerBlockInventory({
  gemini,
  audioName,
  transcript = "",
  ocrDocument = "",
  inventory = "",
  start,
  end,
  marker,
  imagePaths,
  log = null,
}) {
  const parts = [
    { text: listeningMarkerBlockRepairPrompt({ audioName, transcript, ocrDocument, inventory, start, end, marker }) },
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

export function extractListeningMarkersFromInventory(markerBlankInventory) {
  const inventory = parseOptionalJsonObject(markerBlankInventory);
  if (!inventory) {
    return [];
  }

  const markers = [
    ...(Array.isArray(inventory.visible_markers) ? inventory.visible_markers : []),
    ...(Array.isArray(inventory.markers) ? inventory.markers.map((marker) => marker.marker) : []),
    ...(Array.isArray(inventory.blanks) ? inventory.blanks.map((blank) => blank.marker) : []),
  ];

  return [...new Set(markers.map(normalizeNullableNumber).filter(Number.isFinite))].sort((a, b) => a - b);
}

export function findMarkerBlocksNeedingGeminiRepair(markerBlankInventory, markers) {
  const inventory = parseOptionalJsonObject(markerBlankInventory);
  if (!inventory || !Array.isArray(inventory.blanks)) {
    return [];
  }

  const blanks = inventory.blanks
    .map((blank, index) => ({
      ...blank,
      marker: normalizeNullableNumber(blank.marker),
      visual_order: normalizeNullableNumber(blank.visual_order) ?? index + 1,
    }))
    .sort((a, b) => a.visual_order - b.visual_order);
  const sortedMarkers = [...new Set(markers.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  const repairs = [];

  for (let index = 0; index < sortedMarkers.length; index += 1) {
    const marker = sortedMarkers[index];
    const nextMarker = sortedMarkers[index + 1] ?? null;
    const anchorIndex = blanks.findIndex((blank) => blank.marker === marker);
    if (anchorIndex === -1) {
      repairs.push({
        marker,
        start: marker,
        end: nextMarker ? nextMarker - 1 : marker + 4,
        detectedCount: 0,
        expectedCount: nextMarker ? nextMarker - marker : 5,
        reason: "missing marker anchor in inventory",
      });
      continue;
    }

    const nextAnchorIndex = nextMarker ? blanks.findIndex((blank) => blank.marker === nextMarker) : -1;
    const segmentEnd = nextAnchorIndex === -1 ? blanks.length : nextAnchorIndex;
    const detectedCount = segmentEnd - anchorIndex;
    const expectedCount = nextMarker ? nextMarker - marker : 5;
    const isFinalMarker = !nextMarker;
    const shouldRepair = isFinalMarker
      ? detectedCount < Math.min(4, expectedCount)
      : detectedCount !== expectedCount;

    if (shouldRepair) {
      repairs.push({
        marker,
        start: marker,
        end: marker + expectedCount - 1,
        detectedCount,
        expectedCount,
        reason: `detected ${detectedCount}, expected ${expectedCount}`,
      });
    }
  }

  return repairs;
}

export function applyGeminiMarkerBlockRepairsToInventory(markerBlankInventory, blockRepairTexts) {
  const inventory = parseOptionalJsonObject(markerBlankInventory);
  if (!inventory || !Array.isArray(inventory.blanks) || !blockRepairTexts.length) {
    return markerBlankInventory;
  }

  let blanks = inventory.blanks.map((blank, index) => ({
    ...blank,
    marker: normalizeNullableNumber(blank.marker),
    visual_order: normalizeNullableNumber(blank.visual_order) ?? index + 1,
  }));

  for (const repairText of blockRepairTexts) {
    const repair = parseOptionalJsonObject(repairText);
    if (!repair || !Array.isArray(repair.blanks)) {
      continue;
    }

    const marker = normalizeNullableNumber(repair.marker ?? repair.start);
    const start = normalizeNullableNumber(repair.start ?? marker);
    const end = normalizeNullableNumber(repair.end);
    if (!Number.isFinite(marker) || !Number.isFinite(start) || !Number.isFinite(end)) {
      continue;
    }

    const repairedBlanks = normalizeRepairedBlockBlanks(repair.blanks, { start, end, marker });
    if (repairedBlanks.length !== end - start + 1) {
      continue;
    }

    const anchorIndex = blanks.findIndex((blank) => blank.marker === marker);
    if (anchorIndex === -1) {
      continue;
    }

    const laterMarkerIndex = blanks.findIndex(
      (blank, index) => index > anchorIndex && Number.isFinite(normalizeNullableNumber(blank.marker)),
    );
    const deleteCount = (laterMarkerIndex === -1 ? blanks.length : laterMarkerIndex) - anchorIndex;
    blanks.splice(anchorIndex, deleteCount, ...repairedBlanks);
  }

  blanks = blanks.map((blank, index) => ({
    ...blank,
    visual_order: index + 1,
  }));

  const repairedInventory = {
    ...inventory,
    source: `${inventory.source ?? "marker_blank_inventory"}_with_block_repairs`,
    blanks,
    visible_markers: [
      ...new Set([
        ...(Array.isArray(inventory.visible_markers) ? inventory.visible_markers : []),
        ...blanks.map((blank) => blank.marker),
      ].map(normalizeNullableNumber).filter(Number.isFinite)),
    ].sort((a, b) => a - b),
    markers: blanks
      .filter((blank) => Number.isFinite(normalizeNullableNumber(blank.marker)))
      .map((blank) => ({
        marker: blank.marker,
        attached_visual_order: blank.visual_order,
        nearby_printed_text: [blank.before, blank.after].filter(Boolean).join(" | "),
        confidence: blank.marker_confidence ?? null,
        assignment_reason: blank.marker_evidence ?? "marker block repair",
      })),
    warnings: [
      ...(Array.isArray(inventory.warnings) ? inventory.warnings : []),
      ...blockRepairTexts.map((text) => parseOptionalJsonObject(text)?.warnings ?? []).flat().filter(Boolean),
    ],
  };

  return JSON.stringify(repairedInventory, null, 2);
}

export function buildListeningSkeletonLocallyFromOcrDocument({
  audioName = "audio",
  ocrDocument = "",
  markerBlankInventory = null,
  chunks,
}) {
  const inventoryBlanks = extractInventoryBlankTokens(markerBlankInventory);
  const source = inventoryBlanks.length ? "local_marker_inventory_parser" : "local_ocr_parser";
  const blanks = inventoryBlanks.length ? inventoryBlanks : extractOcrBlankTokens(ocrDocument);
  const warnings = [];
  if (inventoryBlanks.length) {
    warnings.push(...extractInventoryWarnings(markerBlankInventory));
  }
  applyChunkAnchorFallbacks(blanks, chunks, warnings);
  const markerBlanks = blanks
    .filter((blank) => Number.isFinite(blank.marker))
    .sort((a, b) => a.visual_order - b.visual_order);

  if (!markerBlanks.length) {
    warnings.push("No marker anchors found; locally assigning numbers from the first requested chunk.");
    const firstChunkStart = chunks?.[0]?.start;
    if (Number.isFinite(firstChunkStart) && blanks.length) {
      blanks[0].marker = firstChunkStart;
      markerBlanks.push(blanks[0]);
    }
  }

  for (let index = 0; index < markerBlanks.length; index += 1) {
    const anchor = markerBlanks[index];
    const nextAnchor = markerBlanks[index + 1];
    const expectedEnd = nextAnchor ? nextAnchor.marker - 1 : anchor.marker + 4;
    const expectedCount = expectedEnd - anchor.marker + 1;
    const segment = blanks.filter(
      (blank) =>
        blank.visual_order >= anchor.visual_order &&
        (!nextAnchor || blank.visual_order < nextAnchor.visual_order),
    );

    if (segment.length < expectedCount) {
      warnings.push(
        `Marker ${anchor.marker} segment has ${segment.length} detected blanks; expected ${expectedCount}. Missing blanks added as inferred placeholders.`,
      );
    } else if (segment.length > expectedCount) {
      warnings.push(
        `Marker ${anchor.marker} segment has ${segment.length} detected blanks; expected ${expectedCount}. Extra blanks after ${expectedEnd} ignored.`,
      );
    }

    for (let offset = 0; offset < Math.min(segment.length, expectedCount); offset += 1) {
      segment[offset].number = anchor.marker + offset;
      segment[offset].block_marker = anchor.marker;
    }

    if (segment.length < expectedCount) {
      appendMissingPlaceholderBlanks({
        blanks,
        anchor,
        nextAnchor,
        segmentLength: segment.length,
        expectedCount,
      });
    }
  }

  const numberedBlanks = blanks.filter((blank) => Number.isFinite(blank.number)).sort((a, b) => a.number - b.number);
  const blocks = buildLocalSkeletonBlocks({ numberedBlanks, audioName });
  const chunkSkeletons = chunks.map((chunk) => {
    const chunkBlocks = blocks
      .map((block) => ({
        ...block,
        blanks: block.blanks.filter((blank) => blank.number >= chunk.start && blank.number <= chunk.end),
      }))
      .filter((block) => block.blanks.length)
      .map((block) => ({
        ...block,
        start: block.blanks[0].number,
        end: block.blanks.at(-1).number,
      }));
    const chunkNumbers = chunkBlocks.flatMap((block) => block.blanks.map((blank) => blank.number));
    const lastDetectedNumber = chunkNumbers.length ? Math.max(...chunkNumbers) : chunk.end;
    const expectedNumbers = range(chunk.start, Math.min(chunk.end, lastDetectedNumber));
    const missingNumbers = expectedNumbers.filter((number) => !chunkNumbers.includes(number));
    const chunkWarnings = [
      ...warnings,
      ...missingNumbers.map((number) => `Missing OCR skeleton blank ${number} in local parser output.`),
    ];
    const json = {
      audio_name: audioName,
      source,
      chunk_start: chunk.start,
      chunk_end: chunk.end,
      required_markers: chunk.anchors ?? [],
      visible_markers: chunkBlocks.map((block) => block.marker).filter((marker) => marker != null),
      expected_blank_count: chunkNumbers.length,
      blocks: chunkBlocks,
      warnings: chunkWarnings,
    };

    return {
      ...chunk,
      text: JSON.stringify(json, null, 2),
      json,
    };
  });

  return {
    chunks: chunkSkeletons,
    combined: combineListeningSkeletonChunks({ audioName, chunks: chunkSkeletons }),
  };
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
  const warnings = [...new Set(chunks.flatMap((chunk) => chunk.json?.warnings ?? []))];
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

function extractOcrBlankTokens(ocrDocument) {
  const blanks = [];
  const lines = String(ocrDocument ?? "").split(/\r?\n/);
  let visualOrder = 0;

  lines.forEach((line, lineIndex) => {
    const tokenPattern = /\[\[BLANK\b([^\]]*)\]\]/gi;
    let lineTokenIndex = 0;
    for (const match of line.matchAll(tokenPattern)) {
      visualOrder += 1;
      lineTokenIndex += 1;
      blanks.push({
        visual_order: visualOrder,
        line_index: lineIndex,
        line_token_index: lineTokenIndex,
        raw_token: match[0],
        raw_attrs: match[1] ?? "",
        marker: parseMarkerAttr(match[1]),
        confidence: parseNumberAttr(match[1], "confidence"),
        lines: parseNumberAttr(match[1], "lines"),
        line_text: line,
      });
    }
  });

  for (const blank of blanks) {
    blank.before = nearbyWords(blank.line_text.slice(0, tokenStartIndex(blank)), "before");
    blank.after = nearbyWords(blank.line_text.slice(tokenEndIndex(blank)), "after");
  }

  return blanks;
}

function extractInventoryBlankTokens(markerBlankInventory) {
  const inventory = parseOptionalJsonObject(markerBlankInventory);
  if (!inventory || !Array.isArray(inventory.blanks)) {
    return [];
  }

  const markerByVisualOrder = new Map();
  for (const marker of Array.isArray(inventory.markers) ? inventory.markers : []) {
    const visualOrder = Number(marker.attached_visual_order);
    const markerNumber = normalizeNullableNumber(marker.marker);
    if (Number.isFinite(visualOrder) && Number.isFinite(markerNumber)) {
      markerByVisualOrder.set(visualOrder, markerNumber);
    }
  }

  return inventory.blanks
    .map((blank, index) => {
      const visualOrder = Number(blank.visual_order);
      const normalizedVisualOrder = Number.isFinite(visualOrder) ? visualOrder : index + 1;
      const marker = normalizeNullableNumber(blank.marker) ?? markerByVisualOrder.get(normalizedVisualOrder) ?? null;
      const lineTemplate = normalizeLineTemplate(blank.line_template, blank.before, blank.after);
      return {
        visual_order: normalizedVisualOrder,
        line_index: index,
        line_token_index: 1,
        raw_token: "[[BLANK]]",
        raw_attrs: "",
        marker,
        confidence: normalizeNullableNumber(blank.blank_confidence ?? blank.confidence),
        marker_confidence: normalizeNullableNumber(blank.marker_confidence),
        lines: normalizeNullableNumber(blank.lines),
        line_text: lineTemplate,
        before: cleanInventoryText(blank.before),
        after: cleanInventoryText(blank.after),
        speaker: cleanInventoryText(blank.speaker).toUpperCase(),
        page_hint: cleanInventoryText(blank.page_hint),
        blank_evidence: cleanInventoryText(blank.blank_evidence),
        marker_evidence: cleanInventoryText(blank.marker_evidence),
        note: cleanInventoryText(blank.note),
        source: "gemini_marker_blank_inventory",
      };
    })
    .filter((blank) => blank.line_text.includes("[[BLANK]]"))
    .sort((a, b) => a.visual_order - b.visual_order);
}

function extractInventoryWarnings(markerBlankInventory) {
  const inventory = parseOptionalJsonObject(markerBlankInventory);
  if (!inventory || !Array.isArray(inventory.warnings)) {
    return [];
  }
  return inventory.warnings.map((warning) => String(warning)).filter(Boolean);
}

function normalizeRepairedBlockBlanks(repairBlanks, { start, end, marker }) {
  const byNumber = new Map();
  for (const blank of repairBlanks) {
    const number = normalizeNullableNumber(blank.number);
    if (Number.isFinite(number)) {
      byNumber.set(number, blank);
    }
  }

  const normalized = [];
  for (let number = start; number <= end; number += 1) {
    const blank = byNumber.get(number);
    if (!blank) {
      return [];
    }

    normalized.push({
      ...blank,
      visual_order: normalized.length + 1,
      marker: number === start ? marker : null,
      before: cleanInventoryText(blank.before),
      after: cleanInventoryText(blank.after),
      line_template: normalizeLineTemplate(blank.line_template, blank.before, blank.after),
      page_hint: cleanInventoryText(blank.page_hint),
      speaker: cleanInventoryText(blank.speaker).toUpperCase(),
      lines: normalizeNullableNumber(blank.lines),
      blank_confidence: normalizeNullableNumber(blank.blank_confidence ?? blank.confidence) ?? 0.5,
      marker_confidence: number === start ? normalizeNullableNumber(blank.marker_confidence) : null,
      blank_evidence: cleanInventoryText(blank.blank_evidence) || "Gemini marker block repair",
      marker_evidence: number === start ? cleanInventoryText(blank.marker_evidence) : "",
      note: cleanInventoryText(blank.note),
    });
  }

  return normalized;
}

function applyChunkAnchorFallbacks(blanks, chunks, warnings) {
  if (!blanks.length) {
    return;
  }

  const anchors = [
    ...new Set(
      (chunks ?? [])
        .flatMap((chunk) => (Array.isArray(chunk.anchors) && chunk.anchors.length ? chunk.anchors : [chunk.start]))
        .map(Number)
        .filter(Number.isFinite),
    ),
  ].sort((a, b) => a - b);
  if (!anchors.length) {
    return;
  }

  const existingMarkerBlanks = blanks.filter((blank) => Number.isFinite(blank.marker));
  const existingMarkers = new Set(existingMarkerBlanks.map((blank) => blank.marker));

  if (!existingMarkerBlanks.length) {
    const firstAnchor = anchors[0];
    let inferred = 0;
    for (const anchor of anchors) {
      const blankIndex = anchor - firstAnchor;
      if (blankIndex >= 0 && blankIndex < blanks.length && !Number.isFinite(blanks[blankIndex].marker)) {
        blanks[blankIndex].marker = anchor;
        blanks[blankIndex].marker_evidence ||= "inferred from chunk marker sequence because no attached marker anchors were returned";
        inferred += 1;
      }
    }
    if (inferred) {
      warnings.push(`Inferred ${inferred} marker anchors from chunk sequence because no attached markers were available.`);
    }
    return;
  }

  let inferred = 0;
  for (const anchor of anchors) {
    if (existingMarkers.has(anchor)) {
      continue;
    }

    const nearest = existingMarkerBlanks
      .map((blank) => ({ blank, distance: Math.abs(anchor - blank.marker) }))
      .sort((a, b) => a.distance - b.distance)[0]?.blank;
    const nearestIndex = blanks.indexOf(nearest);
    const blankIndex = nearestIndex + (anchor - nearest.marker);
    if (blankIndex >= 0 && blankIndex < blanks.length && !Number.isFinite(blanks[blankIndex].marker)) {
      blanks[blankIndex].marker = anchor;
      blanks[blankIndex].marker_evidence ||= `inferred from nearby marker ${nearest.marker} and chunk marker sequence`;
      existingMarkerBlanks.push(blanks[blankIndex]);
      existingMarkers.add(anchor);
      inferred += 1;
    }
  }

  if (inferred) {
    warnings.push(`Inferred ${inferred} missing marker anchors from nearby marker positions and chunk sequence.`);
  }
}

function appendMissingPlaceholderBlanks({ blanks, anchor, nextAnchor, segmentLength, expectedCount }) {
  const missingCount = expectedCount - segmentLength;
  for (let offset = 0; offset < missingCount; offset += 1) {
    const number = anchor.marker + segmentLength + offset;
    const visualOrder = nextAnchor
      ? nextAnchor.visual_order - (missingCount - offset) / 1000
      : anchor.visual_order + segmentLength + offset + 0.001;
    blanks.push({
      visual_order: visualOrder,
      line_index: 1_000_000 + number,
      line_token_index: 1,
      raw_token: "[[BLANK]]",
      raw_attrs: "",
      marker: null,
      confidence: 0,
      marker_confidence: null,
      lines: null,
      line_text: "[[BLANK]]",
      before: "",
      after: "",
      speaker: "",
      page_hint: anchor.page_hint ?? "",
      blank_evidence: `inferred placeholder: marker ${anchor.marker} block expected ${expectedCount} blanks but Gemini detected ${segmentLength}`,
      marker_evidence: "",
      note: "inferred missing blank placeholder for continuous marker numbering",
      source: "inferred_marker_block_placeholder",
      number,
      block_marker: anchor.marker,
    });
  }
}

function buildLocalSkeletonBlocks({ numberedBlanks }) {
  const blocksByMarker = new Map();
  const byLine = new Map();
  for (const blank of numberedBlanks) {
    const key = blank.line_index;
    if (!byLine.has(key)) byLine.set(key, []);
    byLine.get(key).push(blank);
  }

  for (const blank of numberedBlanks) {
    const marker = blank.block_marker ?? Math.floor((blank.number - 1) / 5) * 5 + 1;
    const lineTemplate = buildLocalLineTemplate(blank.line_text, byLine.get(blank.line_index) ?? []);
    if (!blocksByMarker.has(marker)) {
      blocksByMarker.set(marker, {
        block: blocksByMarker.size + 1,
        start: blank.number,
        end: blank.number,
        marker,
        signature: lineTemplate,
        blanks: [],
      });
    }

    const block = blocksByMarker.get(marker);
    block.end = blank.number;
    block.blanks.push({
      number: blank.number,
      marker: blank.number === marker ? marker : null,
      speaker: blank.speaker || speakerNearLine(blank.line_text),
      before: blank.before,
      after: blank.after,
      line_template: lineTemplate,
      page_hint: blank.page_hint ?? "",
      visual_note: buildVisualNote(blank),
      blank_confidence: blank.confidence ?? 0,
      blank_evidence: blank.blank_evidence || `local parser from ${blank.source ?? "OCR"} [[BLANK]] token`,
      marker_confidence: blank.marker_confidence ?? null,
      marker_evidence: blank.marker_evidence ?? "",
    });
  }

  return [...blocksByMarker.values()];
}

function buildLocalLineTemplate(line, lineBlanks) {
  let tokenIndex = 0;
  return line
    .replace(/\[\[BLANK\b[^\]]*\]\]/gi, () => {
      tokenIndex += 1;
      const blank = lineBlanks.find((candidate) => candidate.line_token_index === tokenIndex);
      return Number.isFinite(blank?.number) ? `[BLANK_${blank.number}]` : "[BLANK]";
    })
    .replace(/\[{2,}BLANK_(\d+)\]{2,}/gi, "[BLANK_$1]")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenStartIndex(blank) {
  return nthIndexOf(blank.line_text, blank.raw_token, blank.line_token_index);
}

function tokenEndIndex(blank) {
  const start = tokenStartIndex(blank);
  return start >= 0 ? start + blank.raw_token.length : blank.line_text.length;
}

function nthIndexOf(text, search, count) {
  let index = -1;
  for (let seen = 0; seen < count; seen += 1) {
    index = text.indexOf(search, index + 1);
    if (index === -1) return -1;
  }
  return index;
}

function nearbyWords(text, direction) {
  const words = cleanOcrText(text).split(/\s+/).filter(Boolean);
  const selected = direction === "before" ? words.slice(-10) : words.slice(0, 10);
  return selected.join(" ");
}

function cleanOcrText(text) {
  return String(text ?? "")
    .replace(/\[\[BLANK\b[^\]]*\]\]/gi, " ")
    .replace(/[#*_`|:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLineTemplate(lineTemplate, before, after) {
  const template = String(lineTemplate ?? "").trim();
  const withBlank = template || [before, "[BLANK]", after].filter((part) => String(part ?? "").trim()).join(" ");
  return withBlank
    .replace(/\[\[BLANK\b[^\]]*\]\]/gi, "[[BLANK]]")
    .replace(/\[BLANK_\d+\]/gi, "[[BLANK]]")
    .replace(/\[BLANK\]/gi, "[[BLANK]]")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanInventoryText(text) {
  return String(text ?? "")
    .replace(/\[BLANK_\d+\]|\[BLANK\]|\[\[BLANK\b[^\]]*\]\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNullableNumber(value) {
  if (value == null || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildVisualNote(blank) {
  const parts = [`${blank.source === "gemini_marker_blank_inventory" ? "inventory" : "OCR"} visual_order ${blank.visual_order}`];
  if (blank.note) parts.push(blank.note);
  return parts.join("; ");
}

function speakerNearLine(line) {
  const match = String(line ?? "").match(/\b(MAN|WOMAN|TUTOR|STUDENT|GUIDE|CUSTOMER|ASSISTANT)\b\s*:/i);
  return match ? match[1].toUpperCase() : "";
}

function parseMarkerAttr(attrs) {
  const match = String(attrs ?? "").match(/\bmarker=(\d+|null)\b/i);
  if (!match || match[1].toLowerCase() === "null") return null;
  const number = Number(match[1]);
  return Number.isFinite(number) ? number : null;
}

function parseNumberAttr(attrs, name) {
  const match = String(attrs ?? "").match(new RegExp(`\\b${name}=([0-9.]+)\\b`, "i"));
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) ? number : null;
}

function range(start, end) {
  const values = [];
  for (let number = start; number <= end; number += 1) values.push(number);
  return values;
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

function parseOptionalJsonObject(text) {
  if (!text) {
    return null;
  }
  if (typeof text === "object") {
    return text;
  }
  try {
    return parseJsonObject(text);
  } catch {
    return null;
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
