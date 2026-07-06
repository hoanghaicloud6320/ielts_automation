const BLANK_PATTERN =
  /(\[\[BLANK\b[^\]]*\]\]|\[blank line\]|(?:[._-]\s*){8,})/gi;

const TOKEN_PATTERN = /[a-z0-9]+(?:['-][a-z0-9]+)*/gi;

export function alignListeningOcrToTranscript({ audioName = "audio", transcript = "", ocrDocument = "" } = {}) {
  const transcriptTokens = tokenizeTranscript(transcript);
  const ocr = parseOcrDocumentBlanks(ocrDocument);
  const warnings = [];

  if (!transcriptTokens.length) {
    warnings.push("Transcript has no usable tokens.");
  }
  if (!ocr.blanks.length) {
    warnings.push("OCR document has no detected blank/dotted-line placeholders.");
  }

  let cursor = 0;
  const blanks = ocr.blanks.map((blank) => {
    const leftTokens = anchorTokenObjects(blank.local_before_tokens, tokenWindowBefore(ocr.stream, blank.stream_index, 8), "before");
    const rightTokens = anchorTokenObjects(blank.local_after_tokens, tokenWindowAfter(ocr.stream, blank.stream_index, 8), "after");
    const leftAnchor = shrinkAnchor(leftTokens, "before");
    const rightAnchor = shrinkAnchor(rightTokens, "after");
    const searchStart = Math.max(0, cursor - 12);

    const leftMatch = leftAnchor.length
      ? findBestAnchorMatch(transcriptTokens, leftAnchor, {
          start: searchStart,
          end: Math.min(transcriptTokens.length, cursor + 220),
          direction: "left",
        })
      : null;
    const answerStart = leftMatch && leftMatch.score >= 0.55 ? leftMatch.end : cursor;

    const rightSearchStart = Math.max(answerStart, cursor);
    const rightMatch = rightAnchor.length
      ? findBestAnchorMatch(transcriptTokens, rightAnchor, {
          start: rightSearchStart,
          end: Math.min(transcriptTokens.length, rightSearchStart + 140),
          direction: "right",
        })
      : null;

    let answerEnd = rightMatch && rightMatch.score >= 0.55
      ? rightMatch.first_matched_index
      : Math.min(answerStart + 18, transcriptTokens.length);
    if (answerEnd < answerStart) {
      answerEnd = answerStart;
    }

    const answerTokens = transcriptTokens.slice(answerStart, answerEnd);
    const confidence = scoreBlank({ leftMatch, rightMatch, answerTokens, leftAnchor, rightAnchor });
    const blankWarnings = buildBlankWarnings({
      blank,
      answerTokens,
      leftAnchor,
      rightAnchor,
      leftMatch,
      rightMatch,
      answerStart,
      answerEnd,
      cursor,
    });

    cursor = Math.max(answerEnd, answerStart);

    return {
      visual_order: blank.visual_order,
      page_hint: blank.page_hint,
      ocr_line: blank.line.trim(),
      ocr_blank: blank.raw_blank,
      ocr_before: leftTokens.map((token) => token.raw).join(" "),
      ocr_after: rightTokens.map((token) => token.raw).join(" "),
      left_anchor: describeAnchor(leftAnchor, leftMatch),
      right_anchor: describeAnchor(rightAnchor, rightMatch),
      transcript_span: {
        start_token: answerStart,
        end_token: answerEnd,
        token_count: answerTokens.length,
      },
      answer_candidate: untokenizeTranscript(answerTokens),
      confidence,
      warnings: blankWarnings,
    };
  });
  flagProbableDuplicateBlanks(blanks);

  return {
    audio_name: audioName,
    source: "heuristic_ocr_transcript_alignment",
    transcript_token_count: transcriptTokens.length,
    detected_blank_count: ocr.blanks.length,
    blanks,
    warnings,
  };
}

function flagProbableDuplicateBlanks(blanks) {
  for (let index = 1; index < blanks.length; index += 1) {
    const previous = blanks[index - 1];
    const current = blanks[index];
    if (!previous.answer_candidate || !current.answer_candidate) {
      continue;
    }
    const sameCandidate = normalizeAnswer(previous.answer_candidate) === normalizeAnswer(current.answer_candidate);
    const overlaps = current.transcript_span.start_token < previous.transcript_span.end_token;
    if (sameCandidate && overlaps) {
      current.warnings.push("probable_duplicate_ocr_blank_or_multiline_continuation");
    }
  }
}

function normalizeAnswer(answer) {
  return String(answer ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function formatListeningAlignmentAnswers(alignment) {
  const lines = [
    `# ${alignment.audio_name}`,
    "",
    `Detected blanks: ${alignment.detected_blank_count}`,
    "",
  ];

  for (const blank of alignment.blanks ?? []) {
    const warningText = blank.warnings?.length ? ` _(${blank.warnings.join("; ")})_` : "";
    lines.push(`* **${blank.visual_order}.** ${blank.answer_candidate || "unclear"}${warningText}`);
  }

  lines.push("");
  return lines.join("\n");
}

function parseOcrDocumentBlanks(ocrDocument) {
  const stream = [];
  const blanks = [];
  let pageHint = "";
  let visualOrder = 0;
  let inInventorySection = false;
  const lines = String(ocrDocument ?? "").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (/^\s*(\*\*)?(blank inventory|marker inventory)\b/i.test(line) || /^\s*\|\s*visual_order\b/i.test(line)) {
      inInventorySection = true;
      continue;
    }
    if (inInventorySection && (line.startsWith("|") || !line.trim())) {
      continue;
    }
    if (/^#{1,4}\s+/.test(line)) {
      inInventorySection = false;
      pageHint = line.replace(/^#{1,4}\s+/, "").trim();
      continue;
    }
    if (inInventorySection) {
      inInventorySection = false;
    }

    let lastIndex = 0;
    let matched = false;
    for (const match of line.matchAll(BLANK_PATTERN)) {
      matched = true;
      const beforeSegment = line.slice(lastIndex, match.index);
      const afterSegment = line.slice(match.index + match[0].length);
      appendTextTokens(stream, beforeSegment, pageHint);
      visualOrder += 1;
      const blank = {
        visual_order: visualOrder,
        page_hint: pageHint,
        line,
        raw_blank: match[0],
        stream_index: stream.length,
        local_before_tokens: tokenizeText(beforeSegment).slice(-8),
        local_after_tokens: tokenizeText(afterSegment).slice(0, 8),
      };
      blanks.push(blank);
      stream.push({ type: "blank", blank });
      lastIndex = match.index + match[0].length;
    }
    appendTextTokens(stream, matched ? line.slice(lastIndex) : line, pageHint);
  }

  return { stream, blanks };
}

function appendTextTokens(stream, text, pageHint) {
  for (const token of tokenizeText(text)) {
    stream.push({
      type: "token",
      page_hint: pageHint,
      ...token,
    });
  }
}

function tokenizeTranscript(text) {
  return tokenizeText(
    String(text ?? "")
      .replace(/^#.*$/gm, " ")
      .replace(/^- name:.*$/gim, " "),
  );
}

function tokenizeText(text) {
  return [...String(text ?? "").matchAll(TOKEN_PATTERN)].map((match) => ({
    raw: match[0],
    norm: normalizeToken(match[0]),
  })).filter((token) => token.norm);
}

function tokenWindowBefore(stream, streamIndex, size) {
  const tokens = [];
  for (let index = streamIndex - 1; index >= 0 && tokens.length < size; index -= 1) {
    if (stream[index]?.type === "token") {
      tokens.unshift(stream[index]);
    }
  }
  return tokens;
}

function tokenWindowAfter(stream, streamIndex, size) {
  const tokens = [];
  for (let index = streamIndex + 1; index < stream.length && tokens.length < size; index += 1) {
    if (stream[index]?.type === "token") {
      tokens.push(stream[index]);
    }
  }
  return tokens;
}

function anchorTokenObjects(localTokens, fallbackTokens, side) {
  const usefulLocal = localTokens.filter((token) => !LOW_INFORMATION_TOKENS.has(token.norm));
  if (usefulLocal.length >= 2 || usefulLocal.some((token) => token.norm.length >= 5)) {
    return side === "before" ? localTokens.slice(-8) : localTokens.slice(0, 8);
  }
  return fallbackTokens;
}

function shrinkAnchor(tokens, side) {
  const normalized = tokens.map((token) => token.norm).filter(Boolean);
  const edgeWindow = side === "before" ? normalized.slice(-6) : normalized.slice(0, 6);
  const useful = edgeWindow.filter((token) => !LOW_INFORMATION_TOKENS.has(token));
  if (useful.length >= 2 || useful.some((token) => token.length >= 5)) {
    return edgeWindow;
  }
  return useful.length ? useful : edgeWindow;
}

function findBestAnchorMatch(transcriptTokens, anchorTokens, { start, end, direction }) {
  if (!anchorTokens.length) {
    return null;
  }

  const minIndex = Math.max(0, start);
  const maxIndex = Math.max(minIndex, Math.min(end, transcriptTokens.length));
  let best = null;

  for (let index = minIndex; index < maxIndex; index += 1) {
    const match = fuzzySequenceMatch(transcriptTokens, anchorTokens, index, direction);
    if (!match) {
      continue;
    }
    if (!best || match.score > best.score || (match.score === best.score && match.start < best.start)) {
      best = match;
    }
  }

  return best;
}

function fuzzySequenceMatch(transcriptTokens, anchorTokens, startIndex, direction) {
  const maxSkips = Math.max(2, Math.ceil(anchorTokens.length / 2));
  let transcriptIndex = startIndex;
  let matched = 0;
  let score = 0;
  let skips = 0;
  const matchedTokens = [];
  let firstMatchedIndex = null;

  for (const anchorToken of anchorTokens) {
    let best = null;
    const searchEnd = Math.min(transcriptTokens.length, transcriptIndex + maxSkips + 1);
    for (let index = transcriptIndex; index < searchEnd; index += 1) {
      const similarity = tokenSimilarity(anchorToken, transcriptTokens[index].norm);
      if (similarity >= 0.72 && (!best || similarity > best.similarity)) {
        best = { index, similarity };
      }
    }
    if (!best) {
      skips += 1;
      if (skips > maxSkips) {
        break;
      }
      continue;
    }

    matched += 1;
    score += best.similarity;
    matchedTokens.push(transcriptTokens[best.index].raw);
    firstMatchedIndex ??= best.index;
    transcriptIndex = best.index + 1;
  }

  if (!matched) {
    return null;
  }

  const coverage = matched / anchorTokens.length;
  const avgSimilarity = score / matched;
  const finalScore = coverage * 0.65 + avgSimilarity * 0.35;
  if (coverage < 0.45) {
    return null;
  }

  return {
    direction,
    start: startIndex,
    first_matched_index: firstMatchedIndex ?? startIndex,
    end: transcriptIndex,
    score: Number(finalScore.toFixed(3)),
    matched_tokens: matchedTokens,
  };
}

function scoreBlank({ leftMatch, rightMatch, answerTokens, leftAnchor, rightAnchor }) {
  const leftScore = leftAnchor.length ? leftMatch?.score ?? 0 : 0.45;
  const rightScore = rightAnchor.length ? rightMatch?.score ?? 0 : 0.45;
  let score = (leftScore + rightScore) / 2;
  if (!answerTokens.length) score -= 0.2;
  if (answerTokens.length > 30) score -= 0.2;
  return Number(Math.max(0, Math.min(1, score)).toFixed(3));
}

function buildBlankWarnings({ answerTokens, leftAnchor, rightAnchor, leftMatch, rightMatch, answerStart, answerEnd, cursor }) {
  const warnings = [];
  if (leftAnchor.length && (!leftMatch || leftMatch.score < 0.68)) {
    warnings.push("weak_left_anchor");
  }
  if (rightAnchor.length && (!rightMatch || rightMatch.score < 0.68)) {
    warnings.push("weak_right_anchor");
  }
  if (!answerTokens.length) {
    warnings.push("empty_candidate");
  }
  if (answerTokens.length > 22) {
    warnings.push("long_candidate_possible_extra_head_or_tail");
  }
  if (answerStart < cursor) {
    warnings.push("overlap_with_previous_span");
  }
  if (answerEnd < answerStart) {
    warnings.push("inverted_span");
  }
  return warnings;
}

function describeAnchor(anchorTokens, match) {
  return {
    ocr_tokens: anchorTokens,
    transcript_tokens: match?.matched_tokens ?? [],
    score: match?.score ?? 0,
    transcript_start: match?.start ?? null,
    transcript_end: match?.end ?? null,
  };
}

function untokenizeTranscript(tokens) {
  return tokens.map((token) => token.raw).join(" ");
}

function normalizeToken(token) {
  return String(token ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function tokenSimilarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  if (a.length <= 2 || b.length <= 2) return a[0] === b[0] ? 0.75 : 0;
  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  }
  const distance = editDistanceBounded(a, b, Math.ceil(Math.max(a.length, b.length) * 0.35));
  if (distance == null) return 0;
  return 1 - distance / Math.max(a.length, b.length);
}

function editDistanceBounded(a, b, maxDistance) {
  if (Math.abs(a.length - b.length) > maxDistance) return null;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      current[j] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > maxDistance) return null;
    previous = current;
  }
  return previous[b.length] <= maxDistance ? previous[b.length] : null;
}

const LOW_INFORMATION_TOKENS = new Set([
  "a",
  "an",
  "and",
  "or",
  "the",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "with",
  "is",
  "are",
  "be",
  "it",
  "this",
  "that",
  "you",
  "we",
  "i",
]);
