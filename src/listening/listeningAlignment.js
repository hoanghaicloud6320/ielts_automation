const DOT_BLANK_MIN_MARKS = 8;
const FUZZY_TOKEN_MIN_SIMILARITY = 0.72;
const SHORT_TOKEN_MIN_SIMILARITY = 0.9;
const EXACTISH_TOKEN_MIN_SIMILARITY = 0.98;
const ANCHOR_MIN_COVERAGE = 0.45;
const ANCHOR_ACCEPT_SCORE = 0.55;
const WEAK_ANCHOR_SCORE = 0.68;
const SINGLE_TOKEN_BOUNDARY_MIN_SIMILARITY = 0.82;
const GAP_WITH_BLANK_HINT_CONFIDENCE = 0.98;
const GAP_WITHOUT_BLANK_HINT_CONFIDENCE = 0.86;
const GLOBAL_OCR_SKIP_PENALTY = 0.08;
const GLOBAL_TRANSCRIPT_SKIP_PENALTY = 0.02;
const LOW_INFORMATION_MATCH_WEIGHT = 0.55;
const SHORT_NUMBER_MATCH_WEIGHT = 0.75;
const ANCHOR_COVERAGE_WEIGHT = 0.65;
const ANCHOR_SIMILARITY_WEIGHT = 0.35;
const DEFAULT_MISSING_ANCHOR_SCORE = 0.45;
const EMPTY_ANSWER_SCORE_PENALTY = 0.2;
const LONG_ANSWER_SCORE_PENALTY = 0.2;
const EDIT_DISTANCE_RATIO = 0.35;
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
    const answerStart = leftMatch && leftMatch.score >= ANCHOR_ACCEPT_SCORE ? leftMatch.end : cursor;

    const rightSearchStart = Math.max(answerStart, cursor);
    const rightMatch = rightAnchor.length
      ? findBestAnchorMatch(transcriptTokens, rightAnchor, {
          start: rightSearchStart,
          end: Math.min(transcriptTokens.length, rightSearchStart + 140),
          direction: "right",
        })
      : null;

    let answerEnd = rightMatch && rightMatch.score >= ANCHOR_ACCEPT_SCORE
      ? rightMatch.first_matched_index
      : Math.min(answerStart + 18, transcriptTokens.length);
    answerEnd = tightenRightBoundary({
      transcriptTokens,
      rightAnchor,
      answerStart,
      answerEnd,
    });
    if (answerEnd < answerStart) {
      answerEnd = answerStart;
    }

    const trimmedSpan = trimAnswerSpanEdges({ transcriptTokens, answerStart, answerEnd, rightAnchor });
    answerEnd = trimmedSpan.answerEnd;
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
  const transcriptGaps = buildTranscriptGapAlignment({ transcriptTokens, ocr });
  const answers = buildAnswersFromTranscriptOrder({ transcriptGaps, transcriptTokens, blanks, warnings });
  applyTranscriptGapCandidatesByNearestHint({ blanks, transcriptGaps, transcriptTokens, warnings });
  flagProbableDuplicateBlanks(blanks);

  return {
    audio_name: audioName,
    source: "heuristic_ocr_transcript_alignment",
    transcript_token_count: transcriptTokens.length,
    detected_blank_count: ocr.blanks.length,
    answer_count: answers.length,
    answers,
    blanks,
    transcript_gaps: transcriptGaps.map((gap) => ({
      gap_order: gap.gap_order,
      paired_visual_order: gap.nearest_visual_order ?? gap.paired_visual_order,
      relation: gap.relation,
      answer_candidate: untokenizeTranscript(getTextGapAnswerTokens(gap, transcriptTokens)),
      left_ocr_token: gap.left_ocr_token?.raw ?? "",
      right_ocr_token: gap.right_ocr_token?.raw ?? "",
      confidence: gap.confidence,
      warnings: gap.warnings,
    })),
    warnings,
  };
}

export function extractListeningAnswersFromTranscriptOcr({ audioName = "audio", transcript = "", ocrDocument = "" } = {}) {
  const transcriptTokens = tokenizeTranscript(transcript);
  const ocrTokens = tokenizeWorksheetOcrText(ocrDocument);
  const warnings = [];

  if (!transcriptTokens.length) {
    warnings.push("Transcript has no usable tokens.");
  }
  if (!ocrTokens.length) {
    warnings.push("Worksheet OCR has no usable text tokens.");
  }

  const tokenMatches = alignTokenSequences({ ocrTokens, transcriptTokens });
  const ocrCompactText = ocrTokens.map((token) => token.norm).join("");
  const answers = [];

  for (let index = 0; index < tokenMatches.length - 1; index += 1) {
    const left = tokenMatches[index];
    const right = tokenMatches[index + 1];
    const gapLength = right.transcript_index - left.transcript_index - 1;
    if (gapLength <= 0 || gapLength > 32) {
      continue;
    }

    const answerTokens = getTextOnlyGapAnswerTokens({
      transcriptTokens,
      start: left.transcript_index + 1,
      end: right.transcript_index,
    });
    if (!isUsableTextOnlyAnswer(answerTokens, { ocrCompactText })) {
      continue;
    }

    answers.push({
      source: "text_gap_ocr_transcript_matching",
      answer_order: answers.length + 1,
      answer_candidate: untokenizeTranscript(answerTokens),
      transcript_span: {
        start_token: left.transcript_index + 1,
        end_token: right.transcript_index,
        token_count: answerTokens.length,
      },
      left_ocr_token: left.ocr_token?.raw ?? "",
      right_ocr_token: right.ocr_token?.raw ?? "",
      signature: buildTextGapSignature({ ocrTokens, leftStreamIndex: left.stream_index, rightStreamIndex: right.stream_index }),
      confidence: Number(Math.min(left.score, right.score).toFixed(3)),
      warnings: [],
    });
  }

  if (!answers.length && transcriptTokens.length && ocrTokens.length) {
    warnings.push("No transcript gaps were detected between matched OCR text anchors.");
  }

  return {
    audio_name: audioName,
    source: "text_gap_ocr_transcript_matching",
    transcript_token_count: transcriptTokens.length,
    ocr_token_count: ocrTokens.length,
    answer_count: answers.length,
    answers,
    warnings,
  };
}

function tokenizeWorksheetOcrText(ocrDocument) {
  const cleaned = String(ocrDocument ?? "")
    .replace(/^#{1,4}\s+.*$/gm, " ")
    .replace(BLANK_PATTERN, " ")
    .replace(/(?:[._-]\s*){4,}/g, " ")
    .replace(/\[(?:blank line|unreadable|TRANSCRIPT NOT AVAILABLE|OCR DOCUMENT NOT AVAILABLE)[^\]]*\]/gi, " ");
  return tokenizeText(cleaned)
    .map((token, streamIndex) => ({
      type: "token",
      stream_index: streamIndex,
      ...token,
    }))
    .filter((token) => !shouldSkipWorksheetOcrToken(token));
}

function getTextOnlyGapAnswerTokens({ transcriptTokens, start, end }) {
  let tokens = getTextGapAnswerTokens({ start_token: start, end_token: end, warnings: [] }, transcriptTokens);
  while (
    tokens.length > 3 &&
    TEXT_ONLY_TRAILING_TRIM_TOKENS.has(tokens[tokens.length - 1]?.norm) &&
    tokens[tokens.length - 1]?.norm !== "i"
  ) {
    tokens = tokens.slice(0, -1);
  }
  return tokens;
}

function isUsableTextOnlyAnswer(tokens, { ocrCompactText }) {
  if (tokens.length < 3 || tokens.length > 32) {
    return false;
  }
  const usefulTokens = tokens.filter((token) => !LOW_INFORMATION_TOKENS.has(token.norm));
  if (usefulTokens.length < 2) {
    return false;
  }
  if (tokens.every((token) => /^\d+$/.test(token.norm))) {
    return false;
  }
  const usefulLength = usefulTokens.map((token) => token.norm).join("").length;
  if (usefulLength < TEXT_ONLY_MIN_USEFUL_CHARS) {
    return false;
  }
  const usefulCompact = usefulTokens.map((token) => token.norm).join("");
  const fullCompact = tokens.map((token) => token.norm).join("");
  if (usefulCompact.length >= 5 && compactAppearsInOcr(usefulCompact, ocrCompactText)) {
    return false;
  }
  if (fullCompact.length >= 5 && compactAppearsInOcr(fullCompact, ocrCompactText)) {
    return false;
  }
  if (usefulTokens.every((token) => /^\d+$/.test(token.norm))) {
    const digitCount = usefulTokens.map((token) => token.norm).join("").length;
    return digitCount >= 7;
  }
  return true;
}

function compactAppearsInOcr(compact, ocrCompactText) {
  if (ocrCompactText.includes(compact)) {
    return true;
  }
  if (compact.length < 8) {
    return false;
  }
  const maxDistance = Math.max(1, Math.floor(compact.length * 0.15));
  const minLength = Math.max(1, compact.length - maxDistance);
  const maxLength = compact.length + maxDistance;
  for (let length = minLength; length <= maxLength; length += 1) {
    for (let index = 0; index + length <= ocrCompactText.length; index += 1) {
      const slice = ocrCompactText.slice(index, index + length);
      if (editDistanceBounded(compact, slice, maxDistance) != null) {
        return true;
      }
    }
  }
  return false;
}

function shouldSkipWorksheetOcrToken(token) {
  if (!token?.norm) {
    return true;
  }
  if (/^\d+$/.test(token.norm) && token.norm.length <= 2) {
    return true;
  }
  return token.norm.length <= 2 && !TEXT_ONLY_SHORT_OCR_TOKENS.has(token.norm);
}

function buildTextGapSignature({ ocrTokens, leftStreamIndex, rightStreamIndex }) {
  const leftContext = ocrTokens
    .filter((token) => token.stream_index <= leftStreamIndex)
    .slice(-7)
    .map((token) => token.raw);
  const rightContext = ocrTokens
    .filter((token) => token.stream_index >= rightStreamIndex)
    .slice(0, 7)
    .map((token) => token.raw);
  return trimWords([...leftContext, "...", ...rightContext].join(" "), 18);
}

function buildTranscriptGapAlignment({ transcriptTokens, ocr }) {
  const tokenMatches = matchOcrTextTokensToTranscript({ transcriptTokens, stream: ocr.stream });
  const gaps = [];

  for (let index = 0; index < tokenMatches.length - 1; index += 1) {
    const left = tokenMatches[index];
    const right = tokenMatches[index + 1];
    if (right.transcript_index <= left.transcript_index + 1) {
      continue;
    }

    const gapLength = right.transcript_index - left.transcript_index - 1;
    if (gapLength > 32) {
      continue;
    }

    if (hasVisibleOcrTextBetween({ stream: ocr.stream, leftStreamIndex: left.stream_index, rightStreamIndex: right.stream_index })) {
      continue;
    }

    const blanksBetween = ocr.blanks.filter(
      (blank) => blank.stream_index > left.stream_index && blank.stream_index < right.stream_index,
    );

    gaps.push({
      gap_order: gaps.length + 1,
      paired_visual_order: null,
      relation: blanksBetween.length ? "missing_text_with_ocr_blank_hint" : "missing_text_from_ocr_only",
      start_token: left.transcript_index + 1,
      end_token: right.transcript_index,
      left_ocr_token: left.ocr_token,
      right_ocr_token: right.ocr_token,
      left_stream_index: left.stream_index,
      right_stream_index: right.stream_index,
      nearest_visual_order: nearestBlankToStreamGap(ocr.blanks, left.stream_index, right.stream_index)?.visual_order ?? null,
      confidence: Number(Math.min(
        left.score,
        right.score,
        blanksBetween.length ? GAP_WITH_BLANK_HINT_CONFIDENCE : GAP_WITHOUT_BLANK_HINT_CONFIDENCE,
      ).toFixed(3)),
      warnings: [
        ...(blanksBetween.length > 1 ? ["multiple_ocr_blanks_between_gap_anchors"] : []),
        ...(!blanksBetween.length ? ["no_ocr_blank_between_text_anchors"] : []),
      ],
    });
  }

  return dedupeOverlappingGaps(gaps);
}

function matchOcrTextTokensToTranscript({ transcriptTokens, stream }) {
  const ocrTokens = stream
    .map((item, streamIndex) => ({ ...item, stream_index: streamIndex }))
    .filter((item) => item?.type === "token" && !shouldSkipGlobalOcrToken(item));
  return alignTokenSequences({ ocrTokens, transcriptTokens });
}

function alignTokenSequences({ ocrTokens, transcriptTokens }) {
  const rows = ocrTokens.length + 1;
  const cols = transcriptTokens.length + 1;
  const scores = Array.from({ length: rows }, () => Array(cols).fill(0));
  const moves = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const matchScore = sequenceTokenMatchScore(ocrTokens[i - 1], transcriptTokens[j - 1]);
      const diagonal = matchScore ? scores[i - 1][j - 1] + matchScore : -Infinity;
      const up = scores[i - 1][j] - GLOBAL_OCR_SKIP_PENALTY;
      const left = scores[i][j - 1] - GLOBAL_TRANSCRIPT_SKIP_PENALTY;
      if (diagonal >= up && diagonal >= left) {
        scores[i][j] = diagonal;
        moves[i][j] = 1;
      } else if (up >= left) {
        scores[i][j] = up;
        moves[i][j] = 2;
      } else {
        scores[i][j] = left;
        moves[i][j] = 3;
      }
    }
  }

  const matches = [];
  let i = ocrTokens.length;
  let j = transcriptTokens.length;
  while (i > 0 && j > 0) {
    const move = moves[i][j];
    if (move === 1) {
      const score = tokenSimilarity(ocrTokens[i - 1].norm, transcriptTokens[j - 1].norm);
      matches.push({
        stream_index: ocrTokens[i - 1].stream_index,
        transcript_index: j - 1,
        score,
        ocr_token: ocrTokens[i - 1],
      });
      i -= 1;
      j -= 1;
    } else if (move === 2) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  return matches.reverse();
}

function sequenceTokenMatchScore(ocrToken, transcriptToken) {
  const similarity = tokenSimilarity(ocrToken.norm, transcriptToken.norm);
  const requiredSimilarity = tokenRequiredSimilarity(ocrToken.norm);
  if (similarity < requiredSimilarity) {
    return 0;
  }
  if (LOW_INFORMATION_TOKENS.has(ocrToken.norm)) {
    return similarity >= EXACTISH_TOKEN_MIN_SIMILARITY ? LOW_INFORMATION_MATCH_WEIGHT : 0;
  }
  if (/^\d+$/.test(ocrToken.norm) && ocrToken.norm.length <= 3) {
    return similarity >= EXACTISH_TOKEN_MIN_SIMILARITY ? SHORT_NUMBER_MATCH_WEIGHT : 0;
  }
  return 1 + similarity;
}

function shouldSkipGlobalOcrToken(token) {
  if (!token?.norm) {
    return true;
  }
  if (/^\d+$/.test(token.norm) && token.norm.length <= 2) {
    return true;
  }
  return token.norm.length <= 2 && !["ok", "no"].includes(token.norm);
}

function hasVisibleOcrTextBetween({ stream, leftStreamIndex, rightStreamIndex }) {
  for (let index = leftStreamIndex + 1; index < rightStreamIndex; index += 1) {
    const item = stream[index];
    if (item?.type === "token" && !shouldSkipGapInteriorToken(item)) {
      return true;
    }
  }
  return false;
}

function shouldSkipGapInteriorToken(token) {
  if (!token?.norm) {
    return true;
  }
  if (/^\d+$/.test(token.norm) && token.norm.length <= 3) {
    return true;
  }
  return false;
}

function nearestBlankToStreamGap(blanks, leftStreamIndex, rightStreamIndex) {
  const midpoint = (leftStreamIndex + rightStreamIndex) / 2;
  const maxDistance = Math.max(6, Math.min(14, rightStreamIndex - leftStreamIndex + 4));
  return blanks
    .map((blank) => ({
      blank,
      distance: Math.abs(blank.stream_index - midpoint),
    }))
    .filter((item) => item.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)[0]?.blank ?? null;
}

function dedupeOverlappingGaps(gaps) {
  const bySpan = new Map();
  for (const gap of gaps) {
    const key = `${gap.start_token}:${gap.end_token}`;
    const existing = bySpan.get(key);
    if (!existing || isBetterGap(gap, existing)) {
      bySpan.set(key, gap);
    }
  }
  return [...bySpan.values()].sort((a, b) => a.start_token - b.start_token);
}

function isBetterGap(candidate, existing) {
  if (candidate.relation !== existing.relation) {
    return candidate.relation === "missing_text_with_ocr_blank_hint";
  }
  const candidateLength = candidate.end_token - candidate.start_token;
  const existingLength = existing.end_token - existing.start_token;
  if (candidate.confidence !== existing.confidence) {
    return candidate.confidence > existing.confidence;
  }
  return Math.abs(candidateLength - 5) < Math.abs(existingLength - 5);
}

function applyTranscriptGapCandidatesByNearestHint({ blanks, transcriptGaps, transcriptTokens, warnings }) {
  const usableGaps = transcriptGaps.filter((gap) => isUsableTextGap(gap, transcriptTokens));
  if (usableGaps.length !== blanks.length) {
    warnings.push(`Text-gap count (${usableGaps.length}) differs from OCR blank count (${blanks.length}); unmatched blanks keep anchor fallback.`);
  }
  const gapByVisualOrder = new Map();
  for (const gap of usableGaps) {
    const visualOrder = gap.nearest_visual_order;
    if (visualOrder == null) {
      continue;
    }
    const existing = gapByVisualOrder.get(visualOrder);
    if (!existing || isBetterGap(gap, existing)) {
      gapByVisualOrder.set(visualOrder, gap);
    }
  }

  for (let index = 0; index < blanks.length; index += 1) {
    const blank = blanks[index];
    const gap = gapByVisualOrder.get(blank.visual_order);
    if (!blank) {
      continue;
    }
    if (!gap) {
      blank.warnings.push("kept_anchor_fallback_no_text_gap");
      continue;
    }

    const gapTokens = getTextGapAnswerTokens(gap, transcriptTokens);
    const gapAnswer = untokenizeTranscript(gapTokens);

    blank.transcript_gap_candidate = {
      relation: gap.relation,
      answer_candidate: gapAnswer,
      transcript_span: {
        start_token: gap.start_token,
        end_token: gap.end_token,
        token_count: gapTokens.length,
      },
      confidence: gap.confidence,
      warnings: gap.warnings,
    };
    blank.answer_candidate = gapAnswer;
    blank.transcript_span = blank.transcript_gap_candidate.transcript_span;
    blank.confidence = Math.max(blank.confidence, gap.confidence);
    blank.warnings = blank.warnings.filter(
      (warning) => !["weak_left_anchor", "weak_right_anchor", "long_candidate_possible_extra_head_or_tail"].includes(warning),
    );
    blank.warnings.push("used_text_gap_alignment");
  }
}

function isUsableTextGap(gap, transcriptTokens) {
  const gapTokens = getTextGapAnswerTokens(gap, transcriptTokens);
  if (!gapTokens.length || gapTokens.length > 32) {
    return false;
  }
  const usefulTokens = gapTokens.filter((token) => !LOW_INFORMATION_TOKENS.has(token.norm));
  if (!usefulTokens.length) {
    return false;
  }
  if (gap.warnings.includes("no_ocr_blank_between_text_anchors") && gapTokens.length <= 2) {
    return false;
  }
  if (gapTokens.every((token) => /^\d+$/.test(token.norm))) {
    return false;
  }
  return true;
}

function buildAnswersFromTranscriptOrder({ transcriptGaps, transcriptTokens, blanks, warnings }) {
  const textGapAnswers = transcriptGaps
    .filter((gap) => isUsableTextGap(gap, transcriptTokens))
    .map((gap) => {
      const answerTokens = getTextGapAnswerTokens(gap, transcriptTokens);
      const nearestBlank = blanks.find((blank) => blank.visual_order === gap.nearest_visual_order) ?? null;
      return {
        source: "text_gap_order",
        answer_candidate: untokenizeTranscript(answerTokens),
        transcript_span: {
          start_token: gap.start_token,
          end_token: gap.end_token,
          token_count: answerTokens.length,
        },
        nearest_ocr_blank: nearestBlank
          ? {
              visual_order: nearestBlank.visual_order,
              page_hint: nearestBlank.page_hint,
              ocr_line: nearestBlank.ocr_line,
              ocr_blank: nearestBlank.ocr_blank,
            }
          : null,
        confidence: gap.confidence,
        warnings: gap.warnings,
      };
    });
  const anchorAnswers = blanks
    .filter((blank) => blank.answer_candidate && blank.transcript_span?.token_count > 0)
    .map((blank) => ({
      source: "anchor_fallback",
      answer_candidate: blank.answer_candidate,
      transcript_span: blank.transcript_span,
      nearest_ocr_blank: {
        visual_order: blank.visual_order,
        page_hint: blank.page_hint,
        ocr_line: blank.ocr_line,
        ocr_blank: blank.ocr_blank,
      },
      confidence: blank.confidence,
      warnings: blank.warnings,
    }));
  const answers = dedupeAnswersByTranscriptSpan([...textGapAnswers, ...anchorAnswers])
    .map((answer, index) => ({
      ...answer,
      answer_order: index + 1,
    }));

  if (answers.length !== blanks.length) {
    warnings.push(`Answer count from transcript order (${answers.length}) differs from OCR blank count (${blanks.length}); numbering follows transcript order.`);
  }

  return answers;
}

function dedupeAnswersByTranscriptSpan(candidates) {
  const sorted = candidates
    .filter((candidate) => candidate.answer_candidate && candidate.transcript_span?.start_token != null)
    .sort((a, b) => {
      const startDiff = a.transcript_span.start_token - b.transcript_span.start_token;
      if (startDiff) return startDiff;
      return answerSourceRank(a.source) - answerSourceRank(b.source);
    });
  const answers = [];
  for (const candidate of sorted) {
    const existingIndex = answers.findIndex((answer) => answerSpansOverlap(answer.transcript_span, candidate.transcript_span));
    if (existingIndex === -1) {
      answers.push(candidate);
      continue;
    }
    if (isBetterAnswerCandidate(candidate, answers[existingIndex])) {
      answers[existingIndex] = candidate;
    }
  }
  return answers.sort((a, b) => a.transcript_span.start_token - b.transcript_span.start_token);
}

function answerSpansOverlap(a, b) {
  const start = Math.max(a.start_token, b.start_token);
  const end = Math.min(a.end_token, b.end_token);
  if (end <= start) {
    return false;
  }
  const overlap = end - start;
  const shorter = Math.min(a.token_count, b.token_count);
  return overlap >= Math.max(1, Math.ceil(shorter * 0.6));
}

function isBetterAnswerCandidate(candidate, existing) {
  if (answerSourceRank(candidate.source) !== answerSourceRank(existing.source)) {
    return answerSourceRank(candidate.source) < answerSourceRank(existing.source);
  }
  if (candidate.confidence !== existing.confidence) {
    return candidate.confidence > existing.confidence;
  }
  return candidate.transcript_span.token_count < existing.transcript_span.token_count;
}

function answerSourceRank(source) {
  return source === "text_gap_order" ? 0 : 1;
}

function getTextGapAnswerTokens(gap, transcriptTokens) {
  let tokens = transcriptTokens.slice(gap.start_token, gap.end_token);
  if (tokens.length > 2 && tokens[0]?.norm === "1" && tokens[1]?.norm === "thats") {
    tokens = tokens.slice(1);
  }
  let numericTailStart = tokens.length;
  while (numericTailStart > 0 && ["10", "20", "30"].includes(tokens[numericTailStart - 1]?.norm)) {
    numericTailStart -= 1;
  }
  if (tokens.length - numericTailStart >= 2 && numericTailStart >= 3) {
    tokens = tokens.slice(0, numericTailStart);
  }
  while (tokens.length > 3 && ["ok", "okay"].includes(tokens[tokens.length - 1]?.norm)) {
    tokens = tokens.slice(0, -1);
  }
  return tokens;
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
  const entries = alignment.answers ?? [];
  const lines = [
    `# ${alignment.audio_name}`,
    "",
  ];

  const blocks = groupTextGapAnswers(entries);
  for (const [index, block] of blocks.entries()) {
    lines.push(`### BLOCK ${index + 1}`);
    lines.push("");
    lines.push(`* **Signature:** \`${block.signature || "unclear"}\``);
    for (const entry of block.entries) {
      lines.push(`* **${entry.number}.** ${entry.answer_candidate || "unclear"}`);
    }
    lines.push("");
  }

  const warnings = [
    ...(alignment.warnings ?? []),
    ...entries.flatMap((entry) => entry.warnings ?? []),
  ].filter(Boolean);
  if (warnings.length) {
    lines.push("### Notes");
    lines.push("");
    for (const warning of [...new Set(warnings)]) {
      lines.push(`* ${warning}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function groupTextGapAnswers(entries) {
  const blocks = [];
  for (let index = 0; index < entries.length; index += 5) {
    const blockEntries = entries.slice(index, index + 5).map((entry, offset) => ({
      ...entry,
      number: entry.answer_order ?? index + offset + 1,
    }));
    blocks.push({
      entries: blockEntries,
      signature: blockEntries[0]?.signature ?? "",
    });
  }
  return blocks;
}

function trimWords(text, maxWords) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(" ");
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
    if (/^\s*\d{1,3}\s*$/.test(line)) {
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
    for (const match of findBlankMatches(line)) {
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

function findBlankMatches(line) {
  return [...String(line ?? "").matchAll(BLANK_PATTERN)].filter((match) => {
    const raw = match[0];
    if (/^\[\[BLANK\b/i.test(raw) || /^\[blank line\]$/i.test(raw)) {
      return true;
    }
    const marks = raw.replace(/[^._-]/g, "");
    return marks.length >= DOT_BLANK_MIN_MARKS;
  });
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
    stripListeningControlPhrases(String(text ?? ""))
      .replace(/^#.*$/gm, " ")
      .replace(/^- name:.*$/gim, " "),
  );
}

function stripListeningControlPhrases(text) {
  return text
    .replace(/\bNow we shall begin\./gi, " ")
    .replace(/\bYou should answer the questions as you listen, because you will not hear the recording a second time\./gi, " ")
    .replace(/\bListen carefully and answer questions\s+\d+\s+to\s+\d+\./gi, " ")
    .replace(/\bNow listen carefully and answer questions\s+\d+\s+to\s+\d+\./gi, " ")
    .replace(/\bNow listen and answer questions\s+\d+\s+to\s+\d+\./gi, " ")
    .replace(/\bBefore you hear the rest of (?:the conversation|the talk), you have some time to look at questions\s+\d+\s+to\s+\d+\./gi, " ")
    .replace(/\bThat is the end of section\s+\d+\./gi, " ")
    .replace(/\bYou now have half a minute to check your answers\./gi, " ");
}

function tokenizeText(text) {
  return [...String(text ?? "").matchAll(TOKEN_PATTERN)].map((match) => ({
    raw: match[0],
    norm: normalizeToken(match[0]),
  })).filter((token) => token.norm && !SPEAKER_TOKENS.has(token.norm));
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
  if (usefulLocal.length >= 2) {
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

  if (direction === "right" && (!best || best.score < FUZZY_TOKEN_MIN_SIMILARITY)) {
    const edge = findSingleTokenBoundary(transcriptTokens, anchorTokens, { start: minIndex, end: maxIndex });
    if (edge && (!best || edge.score > best.score)) {
      best = edge;
    }
  }

  return best;
}

function findSingleTokenBoundary(transcriptTokens, anchorTokens, { start, end }) {
  const useful = anchorTokens.filter((token) => !LOW_INFORMATION_TOKENS.has(token));
  const candidates = useful.length ? useful : anchorTokens;
  for (const anchorToken of candidates.slice(0, 3)) {
    if (!anchorToken || anchorToken.length < 2) {
      continue;
    }
    for (let index = start; index < end; index += 1) {
      const similarity = tokenSimilarity(anchorToken, transcriptTokens[index].norm);
      if (similarity >= Math.max(tokenRequiredSimilarity(anchorToken), SINGLE_TOKEN_BOUNDARY_MIN_SIMILARITY)) {
        return {
          direction: "right",
          start,
          first_matched_index: index,
          end: index + 1,
          score: Number(Math.min(FUZZY_TOKEN_MIN_SIMILARITY + 0.02, similarity).toFixed(3)),
          matched_tokens: [transcriptTokens[index].raw],
          boundary_fallback: "single_token",
        };
      }
    }
  }
  return null;
}

function tightenRightBoundary({ transcriptTokens, rightAnchor, answerStart, answerEnd }) {
  const firstAnchor = rightAnchor.find((token) => BOUNDARY_TRIM_TOKENS.has(token));
  if (!firstAnchor || firstAnchor.length < 2) {
    return answerEnd;
  }
  const maxLookahead = Math.min(answerEnd, answerStart + 14, transcriptTokens.length);
  for (let index = answerStart; index < maxLookahead; index += 1) {
    if (transcriptTokens[index].norm === firstAnchor) {
      return index;
    }
  }
  return answerEnd;
}

function trimAnswerSpanEdges({ transcriptTokens, answerStart, answerEnd, rightAnchor }) {
  let end = answerEnd;
  const rightAnchorSet = new Set(rightAnchor);
  while (
    end > answerStart &&
    TRAILING_CONTEXT_TOKENS.has(transcriptTokens[end - 1]?.norm) &&
    (rightAnchorSet.has(transcriptTokens[end - 1].norm) || ALWAYS_TRIM_TRAILING_TOKENS.has(transcriptTokens[end - 1].norm))
  ) {
    end -= 1;
  }
  return { answerEnd: end };
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
      if (similarity >= tokenRequiredSimilarity(anchorToken) && (!best || similarity > best.similarity)) {
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
  const finalScore = coverage * ANCHOR_COVERAGE_WEIGHT + avgSimilarity * ANCHOR_SIMILARITY_WEIGHT;
  if (coverage < ANCHOR_MIN_COVERAGE) {
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
  const leftScore = leftAnchor.length ? leftMatch?.score ?? 0 : DEFAULT_MISSING_ANCHOR_SCORE;
  const rightScore = rightAnchor.length ? rightMatch?.score ?? 0 : DEFAULT_MISSING_ANCHOR_SCORE;
  let score = (leftScore + rightScore) / 2;
  if (!answerTokens.length) score -= EMPTY_ANSWER_SCORE_PENALTY;
  if (answerTokens.length > 30) score -= LONG_ANSWER_SCORE_PENALTY;
  return Number(Math.max(0, Math.min(1, score)).toFixed(3));
}

function buildBlankWarnings({ answerTokens, leftAnchor, rightAnchor, leftMatch, rightMatch, answerStart, answerEnd, cursor }) {
  const warnings = [];
  if (leftAnchor.length && (!leftMatch || leftMatch.score < WEAK_ANCHOR_SCORE)) {
    warnings.push("weak_left_anchor");
  }
  if (rightAnchor.length && (!rightMatch || rightMatch.score < WEAK_ANCHOR_SCORE)) {
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
  const normalized = String(token ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (normalized === "okay") {
    return "ok";
  }
  return NUMBER_WORDS.get(normalized) ?? normalized;
}

function tokenSimilarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  if (a.length <= 2 || b.length <= 2) return 0;
  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  }
  const distance = editDistanceBounded(a, b, Math.ceil(Math.max(a.length, b.length) * EDIT_DISTANCE_RATIO));
  if (distance == null) return 0;
  return 1 - distance / Math.max(a.length, b.length);
}

function tokenRequiredSimilarity(token) {
  if (!token) {
    return 1;
  }
  if (LOW_INFORMATION_TOKENS.has(token)) {
    return EXACTISH_TOKEN_MIN_SIMILARITY;
  }
  if (/^\d+$/.test(token)) {
    return EXACTISH_TOKEN_MIN_SIMILARITY;
  }
  if (token.length <= 3) {
    return SHORT_TOKEN_MIN_SIMILARITY;
  }
  if (token.length <= 5) {
    return 0.78;
  }
  return FUZZY_TOKEN_MIN_SIMILARITY;
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

const SPEAKER_TOKENS = new Set(["man", "woman", "speaker", "student", "tutor", "guide", "customer", "assistant"]);

const NUMBER_WORDS = new Map([
  ["zero", "0"],
  ["one", "1"],
  ["two", "2"],
  ["three", "3"],
  ["four", "4"],
  ["five", "5"],
  ["six", "6"],
  ["seven", "7"],
  ["eight", "8"],
  ["nine", "9"],
  ["ten", "10"],
  ["twenty", "20"],
  ["thirty", "30"],
  ["forty", "40"],
  ["fifty", "50"],
  ["sixty", "60"],
  ["seventy", "70"],
  ["eighty", "80"],
  ["ninety", "90"],
]);

const BOUNDARY_TRIM_TOKENS = new Set([
  "ah",
  "ok",
  "okay",
  "well",
  "here",
  "please",
  "yes",
  "yep",
  "no",
  "10",
  "20",
  "30",
]);

const TRAILING_CONTEXT_TOKENS = new Set(["ok", "okay"]);
const ALWAYS_TRIM_TRAILING_TOKENS = new Set(["ok", "okay"]);
const TEXT_ONLY_MIN_USEFUL_CHARS = 12;
const TEXT_ONLY_SHORT_OCR_TOKENS = new Set(["ah", "oh", "ok", "no", "so", "go"]);
const TEXT_ONLY_TRAILING_TRIM_TOKENS = new Set(["and", "as", "but", "for", "if", "it", "of", "or", "so", "to", "we", "with"]);
