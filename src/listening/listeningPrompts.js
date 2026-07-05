export function listeningTranscriptPrompt({ audioName = "audio" } = {}) {
  return `You are transcribing one IELTS listening audio file.

Audio metadata:
- audio_name: ${audioName}

Task:
- Transcribe the audio into English.
- Preserve speaker labels when they are clear, such as MAN, WOMAN, Harry, Susan, Tour Guide.
- Preserve IELTS navigation phrases, for example "Now listen carefully and answer questions 1 to 5".
- Preserve numbers, dates, names, addresses, prices, phone numbers, spelling, and units exactly as heard.
- Do not solve the worksheet in this step.
- Do not summarize.
- If a short phrase is unclear, write [unclear] instead of guessing.

Return Markdown:
# Transcript

## Audio
- name: ${audioName}

## Text
...`;
}

export function listeningSkeletonPrompt({ audioName = "audio", transcript = "" } = {}) {
  return `You are reading sorted photos of one IELTS listening transcript-cloze worksheet.

Audio metadata:
- audio_name: ${audioName}

Task:
- Build a blank skeleton only.
- Do not fill answers.
- Use the transcript heavily as alignment context, but do not fill answers in this step.
- The transcript tells you the exact text flow and helps locate every missing span. The worksheet photos tell you where the blanks are and how they are numbered.
- Inspect every visible dotted/blank line in the worksheet photos.
- Inspect every blue handwritten marker number.
- The blue markers are absolute anchors. If a marker says 21, the blank line crossing or nearest that marker is blank 21.
- Do not skip blank lines between one marker and the next.
- After the final blue marker, continue counting every remaining visible blank line until the end of the worksheet/audio.
- Ignore official IELTS navigation ranges like "questions 1 to 6"; this worksheet may contain many more transcript blanks.
- Reconstruct each worksheet line locally. For every blank, create a line_template using [BLANK_N], for example "Everyone who goes into the kitchen must wear one, to protect against [BLANK_4]."
- Place [BLANK_N] exactly where the visible dotted/underline blank is on the worksheet. Do not move the blank to make the sentence grammatical.
- Never create a blank unless a visible blank/underline exists in the worksheet photo.
- Use the transcript to reconstruct line_template around each visible blank, but place [BLANK_N] exactly where the visible blank/underline is on the worksheet.
- If the printed words after a blank are not clearly readable, leave after as "" and keep line_template ending at [BLANK_N]. Do not invent after-context.
- If the visible line says "plastic shower _____", the template must be "plastic shower [BLANK_N]", not "[BLANK_N] dispenser of plastic shower caps".
- Prefer 5-14 nearby printed words in before/after. Avoid single generic words like "and", "that", "case", "things" unless there truly are no other visible words.
- Do not put answer-like text inside before/after. before must be printed words before the blank; after must be printed words after the blank.
- If a marker number is not visible but numbering between visible markers implies a block start, keep marker null but still make a normal 5-blank block.

For each blank, capture local context:
- before: short visible words immediately before the blank.
- after: short visible words immediately after the blank, if any.
- speaker: speaker label near the blank, if visible.
- page_hint: visible page number or image order hint, if available.
- marker: blue marker number only when that blank is the marker anchor.
- line_template: one local worksheet line or sentence with this blank replaced by [BLANK_N].

Return strict JSON only. No Markdown.

Schema:
{
  "audio_name": "${audioName}",
  "visible_markers": [1, 6, 11],
  "expected_blank_count": 0,
  "blocks": [
    {
      "block": 1,
      "start": 1,
      "end": 5,
      "marker": 1,
      "signature": "short context near blank 1",
      "blanks": [
        {
          "number": 1,
          "marker": 1,
          "speaker": "MAN",
          "before": "Well, I've just moved here, and",
          "after": "",
          "line_template": "Well, I've just moved here, and [BLANK_1]. I'll only be here for a year",
          "page_hint": "page 64",
          "visual_note": ""
        }
      ]
    }
  ],
  "warnings": []
}

Rules:
- expected_blank_count must equal the highest blank number you can see.
- Every number from 1 to expected_blank_count must appear exactly once.
- Every number in visible_markers must be the first blank number of a block.
- A block usually has five blanks, except the final block may have fewer.
- If the final visible marker is 31, that marker starts a block; it is not the end. Continue counting every visible blank after marker 31.
- If a blank is visible but context is hard to read, keep the number and write "unclear" in before/after or visual_note.

Transcript for alignment only:
${transcript || "[TRANSCRIPT NOT AVAILABLE]"}`;
}

export function listeningOcrDocumentPrompt({ audioName = "audio" } = {}) {
  return `You are doing OCR/document reconstruction for IELTS listening worksheet photos.

Audio metadata:
- audio_name: ${audioName}

Goal:
- Recreate the printed worksheet as a clean Markdown document.
- Do not solve the exercise.
- Do not infer answers.
- Preserve the printed text, speaker labels, page numbers, audio number, handwritten marker locations, and visual blank locations.

Marker rules:
- Handwritten markers are blue ballpoint-pen numbers inside hand-drawn circles.
- They usually appear as 1, 6, 11, 16, 21, 26, 31, etc.
- A circled marker is an absolute anchor for the first blank of a 5-answer block.
- The marker is not printed worksheet text and not an answer.
- First identify all circled blue marker numbers before assigning any marker to a blank.
- Assign a marker to exactly one blank: the real blank line that the circle touches, overlaps, crosses, or is visually closest to.
- Do not move a marker to an earlier/later blank just because the numbering pattern would seem nicer.
- If several blanks are nearby, prefer the blank whose dotted line is horizontally aligned with the center of the circled number.
- If the marker is between two dotted lines, use the line it physically touches/crosses; otherwise mark the assignment as uncertain in the note.

Blank rules:
- A real blank is a long printed dotted line or underline where transcript text was removed.
- It may span one line or continue on the next visual line.
- If a dotted line continues onto the next visual line without a new printed lead-in, speaker turn, or marker, treat it as the same blank.
- Tiny ellipses in printed dialogue, such as "...", "Good ...", "Ah ...", "Now...", are not blanks.
- Punctuation dots, show-through text, page shadows, and circled marker outlines are not blanks.

Output format:
- Markdown only.
- Process images in the provided order.
- Split visible left/right pages if an image contains a book spread.
- Use headings like "## Image 1 / left page 68".
- Recreate the printed text line by line.
- Represent every real blank as exactly one token:
  [[BLANK marker=6 confidence=0.95 lines=1]]
- Do not reproduce the dotted/underline characters themselves. Replace the entire dotted/underline blank with the single [[BLANK ...]] token.
- Never output long runs of "." or "_" for blank lines.
- Use marker=null unless a circled blue marker touches, crosses, or is the nearest visual anchor to that exact blank.
- If a blank continues across two visual lines, write one token with lines=2, not two blank tokens.
- Preserve nearby punctuation around blank tokens.
- Add a short "Blank inventory" table after each page with columns: visual_order, marker, nearby_before, nearby_after, lines, confidence, note.
- Add a short "Marker inventory" table after each page with columns: marker, attached_visual_order, nearby_printed_text, assignment_reason, confidence.

Important checks:
- If the photo says "plastic shower caps. _____ ; everyone who", write "plastic shower caps. [[BLANK ...]]; everyone who". The word "caps." is printed before the blank.
- If the photo says "hot _____ as you go through, just in case. _____", write two separate blank tokens.
- Check circled marker 31 carefully if visible: the marker belongs to the blank it physically touches, not a later blank or an earlier blank inferred from transcript flow.
- For every non-null marker in a [[BLANK]] token, the same marker must appear in the Marker inventory and attached_visual_order must match that blank's visual_order.`;
}

export function listeningDocumentChunkSkeletonPrompt({
  audioName = "audio",
  transcript = "",
  ocrDocument = "",
  start = 1,
  end = 10,
  anchors = [],
} = {}) {
  const anchorText = anchors.length ? anchors.join(", ") : "none supplied";
  return `You are converting an OCR-scanned IELTS listening worksheet document into a blank skeleton.

Audio metadata:
- audio_name: ${audioName}

Task:
- Build a skeleton only for answer numbers ${start}-${end}.
- Do not fill answers.
- Use the OCR document as the primary source for blank order, printed text, and marker anchors.
- Use the photos only as a visual cross-check if provided.
- Use the transcript only to reconstruct clean local wording around each [[BLANK]] token.

Marker rules:
- Required marker anchors for this chunk: ${anchorText}
- OCR marker values come from blue circled ballpoint-pen numbers on the worksheet.
- Marker numbers are absolute answer indexes. Do not renumber.
- If the OCR document has [[BLANK marker=21 ...]], that blank must be answer 21.
- Non-anchor blanks after marker 21 should be numbered 22, 23, 24, 25 until the next marker.

OCR blank rules:
- Every [[BLANK ...]] token is a candidate worksheet blank.
- Preserve OCR visual order.
- Ignore tiny printed ellipses unless they are represented as [[BLANK]].
- If OCR says one [[BLANK lines=2]], keep it as one answer number, not two.
- If the OCR document has an obvious marker mismatch, prefer the physical order and add a warning.

Return strict JSON only. No Markdown.

Schema:
{
  "audio_name": "${audioName}",
  "source": "ocr_document",
  "chunk_start": ${start},
  "chunk_end": ${end},
  "required_markers": [${anchors.join(", ")}],
  "visible_markers": [${anchors.join(", ")}],
  "expected_blank_count": 0,
  "blocks": [
    {
      "block": 1,
      "start": ${start},
      "end": ${Math.min(start + 4, end)},
      "marker": ${anchors[0] ?? "null"},
      "signature": "short nearby OCR context",
      "blanks": [
        {
          "number": ${start},
          "marker": ${anchors[0] ?? "null"},
          "speaker": "",
          "before": "",
          "after": "",
          "line_template": "OCR line with [BLANK_${start}] replacing the matching [[BLANK]] token",
          "page_hint": "",
          "visual_note": "",
          "blank_confidence": 0.0,
          "blank_evidence": "OCR [[BLANK]] token plus optional visual check"
        }
      ]
    }
  ],
  "warnings": []
}

Validation:
- Output only answer numbers ${start}-${end}.
- Every output answer number must appear exactly once.
- Use the exact number field as the answer number.
- The first blank in a marker block must equal that marker number.
- For non-anchor blanks, marker must be null.
- Do not restart numbering from 1 unless this chunk starts at 1.
- If an OCR [[BLANK]] is visibly in this chunk but hard to align, keep the number and add a warning.

Transcript for wording alignment:
${transcript || "[TRANSCRIPT NOT AVAILABLE]"}

OCR worksheet document:
${ocrDocument || "[OCR DOCUMENT NOT AVAILABLE]"}`;
}

export function listeningChunkSkeletonPrompt({
  audioName = "audio",
  transcript = "",
  start = 1,
  end = 10,
  anchors = [],
} = {}) {
  const anchorText = anchors.length ? anchors.join(", ") : "none supplied";
  return `You are reading sorted photos of one IELTS listening transcript-cloze worksheet.

Audio metadata:
- audio_name: ${audioName}

Task:
- Build a blank skeleton only for answers ${start}-${end}.
- Do not fill answers.
- Use the transcript as alignment context, but the worksheet photos decide where the blanks physically are.

Absolute anchor rule:
- Blue handwritten markers are absolute anchors.
- The markers are written by ballpoint pen, usually blue ink.
- Each marker is usually a handwritten number inside a hand-drawn circle.
- Typical marker numbers are 1, 6, 11, 16, 21, 26, 31, etc. They mark the first blank of each 5-answer block.
- These circled pen numbers are not printed worksheet text and are not answers.
- Required blue markers for this chunk: ${anchorText}
- A blue marker number is already the user's answer index. Do not renumber it.
- If the marker says 1, the nearest/crossing blank line is answer 1.
- If the marker says 6, the nearest/crossing blank line is answer 6.
- If the marker says 11, the nearest/crossing blank line is answer 11.
- Continue the same rule for 16, 21, 26, 31, etc.
- Treat the marker as a physical pin on the page, not a suggestion. The first blank in that block must sit exactly at that marker location.
- Do not infer a different block start from IELTS instructions, paragraph boundaries, grammar, or transcript flow.

Chunk scope:
- Output only blanks numbered ${start}-${end}.
- Usually this chunk covers two marker blocks: ${start}-${start + 4} and ${start + 5}-${end}.
- If a required marker is visible, its number must appear as the first blank number of its block.
- Do not output blanks outside ${start}-${end}.
- If the final visible blank for this audio ends before ${end}, stop at the final visible blank and add a warning.

Blank placement rules:
- First find the circled pen markers, then scan outward from each marker block.
- Inspect every visible dotted/blank line around the required markers.
- A real blank is usually a long printed dotted line or underline where transcript words were removed.
- Real blanks often run horizontally across much of the remaining line.
- Real blanks may continue on the next visual line. Treat connected/continued dotted lines as the same blank if they belong to one missing phrase.
- If a dotted line continues onto the next visual line without a new printed lead-in word or speaker turn, it is usually the same multi-line blank, not a new answer number.
- A new blank usually has at least one of these: a new circled marker, new printed lead-in words before the dotted line, a new speaker turn, or a clear transcript gap after the previous blank has ended.
- Do not split one long missing transcript span into two answer numbers just because the dotted line wraps to another line.
- A real blank may have printed words before it on the same line, after it on the same line, or both.
- A real blank may begin right after a comma, period, or short printed phrase.
- A real blank may be split by line wrapping: printed words can appear on the line above, while the dotted line starts on the next line.
- Very short ellipses in printed dialogue, such as "...", "Good ...", "Ah ...", "Now...", are not blanks.
- Tiny punctuation dots, sentence ellipses, page shadows, show-through text from the reverse side, and blue marker circles are not blanks.
- Do not count a dotted area as a blank unless it is a deliberate worksheet gap where missing transcript text should be inserted.
- Place [BLANK_N] exactly where the visible dotted/underline blank is on the worksheet.
- Never create a blank unless a visible blank/underline exists in the worksheet photo.
- Do not move a blank to make the sentence grammatical.
- Use the transcript to reconstruct local text around the blank, but do not put answer text into before/after.
- Use text matching as a second signal: compare the printed worksheet words against the transcript and locate the missing span between printed words. The missing transcript span should align with a visible long dotted/underline blank.
- If the photo and transcript disagree, the visible long dotted/underline blank controls placement; the transcript only helps recover nearby printed words.
- For each dotted/blank line, first read the printed words physically touching or immediately before the left edge of that dotted line. Those printed words belong in before, even if they are on the previous visual line because the sentence wrapped.
- Never turn a clearly printed word immediately before a dotted/blank line into an answer.
- Important example: if the worksheet visibly says "plastic shower caps. _____ ; everyone who", the template must be "plastic shower caps. [BLANK_N]; everyone who". The answer is not "caps".
- If the visible line says "plastic shower _____", then and only then the template may be "plastic shower [BLANK_N]".
- If the transcript contains a word after before, check whether that word is actually printed right before the dotted line in the photo. If it is printed, extend before to include it instead of making it the blank answer.
- Never let one blank's after/context swallow the next visible dotted line.
- If printed text appears after one dotted line and then another dotted line appears before the next paragraph, create a new blank for that second dotted line.
- Important example: if the worksheet visibly says "hot _____ as you go through, just in case. _____", output "hot [BLANK_N] as you go through, just in case." and then "just in case. [BLANK_N+1]". Do not put the second blank's printed lead-in only inside after.
- Prefer 5-14 nearby printed words in before/after.

Return strict JSON only. No Markdown.

Schema:
{
  "audio_name": "${audioName}",
  "chunk_start": ${start},
  "chunk_end": ${end},
  "required_markers": [${anchors.join(", ")}],
  "visible_markers": [${anchors.join(", ")}],
  "expected_blank_count": 0,
  "blocks": [
    {
      "block": 1,
      "start": ${start},
      "end": ${Math.min(start + 4, end)},
      "marker": ${anchors[0] ?? "null"},
      "signature": "short context near the marker blank",
      "blanks": [
        {
          "number": ${start},
          "marker": ${anchors[0] ?? "null"},
          "speaker": "",
          "before": "",
          "after": "",
          "line_template": "local worksheet line with [BLANK_${start}] exactly at the physical blank",
          "page_hint": "",
          "visual_note": "",
          "blank_confidence": 0.0,
          "blank_evidence": "long dotted line / underlined worksheet gap / transcript words missing between printed before and after"
        }
      ]
    }
  ],
  "warnings": []
}

Validation rules:
- Every number from ${start} through the last visible blank in this chunk must appear exactly once.
- Every required marker that is visible must be the first blank number of a block.
- The first blank of each marker block must be the blank nearest/crossing that blue marker.
- The marker field must be the circled marker number only for the anchor blank itself. For the other blanks in the same block, marker must be null.
- A normal marker block has five blanks, except the final block of an audio may have fewer.
- If any required marker cannot be seen in the photos, add a warning and continue only if the blank sequence is visually clear.
- Before returning JSON, run an internal blank-candidate scan:
  1. List the real long dotted/underline gaps in visual order.
  2. Reject tiny ellipses and punctuation dots.
  3. For each gap, match surrounding printed words to the transcript.
  4. Confirm that each accepted gap has a missing transcript span or a clear worksheet gap.
  5. Assign blank_confidence from 0 to 1 and explain the visual evidence in blank_evidence.

Transcript for alignment only:
${transcript || "[TRANSCRIPT NOT AVAILABLE]"}`;
}

export function listeningFillSkeletonPrompt({ audioName = "audio", transcript = "", skeleton = "" } = {}) {
  return `You are filling an IELTS listening transcript-cloze skeleton.

Audio metadata:
- audio_name: ${audioName}

Inputs:
1. A clean transcript.
2. A prebuilt worksheet skeleton made from the photos.
3. The worksheet photos may also be provided for visual confirmation.

Core rule:
- Do not change the skeleton numbering.
- Do not add, remove, renumber, or merge blanks.
- Fill exactly the blanks listed in the skeleton.
- Use each skeleton blank's exact "number" field as the answer label.
- If a skeleton chunk contains blank numbers 21-30, output answers 21-30. Never restart at 1.
- If a skeleton chunk starts at marker 31, the first answer line must be **31.**, not **1.**.
- Use the transcript as the primary source for answer text.
- Use each blank's before/after/speaker/signature context to find the matching local phrase in the transcript.
- If line_template is present, align the entire template against the transcript and fill only the span represented by [BLANK_N].
- The answer is the exact missing transcript span that was removed from the worksheet blank.
- Many blanks are long phrases or clauses. Do not compress a phrase into one keyword.
- Prefer the full contiguous transcript span that naturally fits the physical blank length in the worksheet photo.
- Do not blindly choose the longest possible span. The answer must fit the visible dotted/blank line.
- Choose the nearest transcript span immediately between the before and after context. Do not skip to a later sentence just because it also contains a related word.
- If after is empty or unclear, choose the immediate next transcript words after before that fit the visible blank length; do not jump to a later clause.
- Do not include words that are already printed after the blank in the worksheet photo.
- Do not cross into the next printed sentence unless the same visible blank clearly spans that whole text.
- If the worksheet blank spans a whole clause or sentence, return the whole clause or sentence. If it is a short lexical blank, return only that short phrase.
- Never use a blue marker number, punctuation mark, or isolated formatting artifact as an answer.
- If before/after context is imperfect, use the worksheet photo to confirm the blank length and nearby printed words.
- If a skeleton slot is visually unclear or cannot be matched safely in the transcript, write "unclear - reason".

Output Markdown:
# ${audioName}

Marker check: visible blue markers = copy the actual visible_markers array from the skeleton, for example 1, 6, 11, 16
Skeleton blank count: N
Filled blank count: N
Answer number range: first skeleton blank number through last skeleton blank number

### BLOCK

* **Signature:** \`copy skeleton signature\`
* **N.** answer using the exact skeleton blank number N
* **N+1.** answer using the exact skeleton blank number N+1

Validation rules:
- Filled blank count must equal Skeleton blank count.
- Every skeleton blank number must appear exactly once.
- No answer number may appear unless that number exists in the skeleton.
- Do not restart numbering from 1 unless the skeleton itself starts at 1.
- Preserve exact missing wording from the transcript. Do not summarize or shorten.
- Preserve exact wording for names, numbers, addresses, prices, phone numbers, spelling, and units.
- Do not include explanations for normal answers.

Transcript:
${transcript || "[TRANSCRIPT WILL BE INSERTED HERE]"}

Skeleton:
${skeleton || "[SKELETON JSON WILL BE INSERTED HERE]"}`;
}

export function listeningChunkSkeletonReviewPrompt({
  audioName = "audio",
  transcript = "",
  skeleton = "",
} = {}) {
  return `You are auditing a JSON skeleton for one IELTS listening transcript-cloze worksheet chunk.

Audio metadata:
- audio_name: ${audioName}

Task:
- Compare the JSON skeleton against the worksheet photos.
- Return a corrected skeleton JSON only.
- Do not fill answers.

Audit rules:
- Blue handwritten circled ballpoint-pen markers are absolute anchors. Marker numbers are already the user's answer indexes.
- Typical marker numbers are 1, 6, 11, 16, 21, 26, 31, etc.
- The circled pen marker is not printed worksheet text and not an answer.
- Every [BLANK_N] must be exactly where the visible dotted/underline blank is on the photo.
- Check each blank line visually from left to right and top to bottom.
- A real blank is a long printed dotted/underline worksheet gap, often spanning much of a line and sometimes continuing onto the next visual line.
- If a dotted line wraps to the next visual line without a new printed lead-in word, speaker turn, or marker, keep it as the same blank.
- Do not split one multi-line blank into two answer numbers.
- Tiny printed ellipses such as "...", "Good ...", "Ah ...", "Now...", punctuation dots, page shadows, and show-through text are not blanks.
- Use transcript text matching to verify that the printed words around the dotted line are present and that a transcript span is missing at that location.
- If a clearly printed word is physically before the dotted line, include that word in before and line_template.
- Never turn a clearly printed word immediately before a dotted line into an answer.
- Do not let one blank's after/context swallow the next visible dotted line.
- If printed text appears after one dotted line and then another dotted line appears before the next paragraph, create a new blank for that second dotted line.
- Specific visual sanity check: if the worksheet says "plastic shower caps. _____ ; everyone who", the skeleton must say "plastic shower caps. [BLANK_N]; everyone who", not "plastic shower [BLANK_N]".
- Specific visual sanity check: if the worksheet says "hot _____ as you go through, just in case. _____", these are two separate blanks.
- Do not add blanks outside this chunk's chunk_start/chunk_end.
- Preserve the schema and strict JSON format.

Transcript for alignment only:
${transcript || "[TRANSCRIPT NOT AVAILABLE]"}

Skeleton to audit:
${skeleton || "[SKELETON JSON WILL BE INSERTED HERE]"}`;
}

export function listeningBlockAnswerPrompt({ audioName = "audio", transcript = "" } = {}) {
  return `You are solving one IELTS listening worksheet using a transcript and sorted worksheet photos.

Audio metadata:
- audio_name: ${audioName}

Core rule:
- The transcript is the main source for the answers.
- The worksheet photos are used to locate blanks, confirm the wording around each blank, and align answers to the user's blue markers.
- The user may have marked every 5 blanks with blue ink. Treat those blue markers as absolute anchors for block boundaries.
- This is a transcript cloze worksheet, not the official IELTS answer sheet. Ignore IELTS navigation ranges such as "answer questions 1 to 6" or "questions 7 to 10" when deciding how many blanks to output.
- Output every visible blank line in the worksheet photos, from the first blank to the last blank, even if there are more blanks than the IELTS navigation phrase suggests.
- Blue marker numbers are the user's blank indexes. If a blue marker says 21, the blank line beside that marker is answer 21. The next visible blank is 22, then 23, 24, and 25 until the next blue marker.
- Never assign answer 21 to a later page/location if a visible blue 21 marker exists earlier. Marker numbers override your own blank counting.
- The marker may be written on top of, beside, or slightly below the blank line. Use the nearest blank line crossing that marker as the answer for that marker.
- Do not skip blank lines between one blue marker and the next blue marker. Every visible dotted/blank line in that span should receive the next answer number.
- Do not invent text that is not supported by the transcript and worksheet.
- If the photo is too unclear to confirm a blank or its position, write unclear and explain briefly.

Workflow:
1. Read the transcript.
2. Read the worksheet photos in sorted order.
3. Identify every visible blue marker number first. They should usually be 1, 6, 11, 16, 21, 26, 31, etc.
4. Match worksheet text against the transcript.
5. Identify all visible blank lines by missing text in the worksheet and by the user's blue markers.
6. Output answers in blocks anchored by visible blue marker numbers:
   - A blue marker 1 starts answers 1-5.
   - A blue marker 6 starts answers 6-10.
   - A blue marker 11 starts answers 11-15.
   - A blue marker 16 starts answers 16-20, exactly at that visible marker location.
   - A blue marker 21 starts answers 21-25, exactly at that visible marker location.
   - A blue marker 26 starts answers 26-30, exactly at that visible marker location.
   - A blue marker 31 starts answers 31-35, exactly at that visible marker location.
   - Continue this pattern for every visible marker.
   - The final block may contain fewer than five answers.
   - The final marker is not the final answer by itself. After the final marker, continue assigning numbers to every remaining visible blank line until the end of the worksheet/audio.
   - Do not stop at the official IELTS question range; stop only when the worksheet has no more visible blanks for this audio.
   - Every number listed in "Marker check" must have a corresponding block whose first answer number is that marker number.
   - If "Marker check" includes 31, you must output a block starting with answer 31.
7. For each block, include a short signature: a phrase immediately before the first blank in that block, or a stable nearby context phrase that lets the user verify the location.
8. After each block, internally check that:
   - numbering is continuous,
   - if the block starts from a visible blue marker, the first answer number matches that marker exactly,
   - the first answer in the block corresponds to the blank line nearest/crossing that blue marker,
   - the signature matches the worksheet/transcript location,
   - answers are aligned to the correct blanks,
   - no answer from a neighboring audio/unit leaked in.
9. Before finalizing, compare the marker numbers in "Marker check" against the block starts. If any marker is missing a block, add that missing block.

Output format:
# ${audioName}

Marker check: visible blue markers = 1, 6, 11, ...

### BLOCK 1

* **Signature:** \`short context before blank 1\`
* **1.** answer
* **2.** answer
* **3.** answer
* **4.** answer
* **5.** answer

### BLOCK 2

* **Signature:** \`short context before blank 6\`
* **6.** answer
* **7.** answer
* **8.** answer
* **9.** answer
* **10.** answer

Rules for answers:
- Keep answers concise.
- Preserve exact wording when the blank expects a phrase.
- Preserve capitalization only when meaningful, for example names, addresses, or titles.
- Preserve numbers and symbols exactly, for example 25th, $1,350, 084 398 7695.
- Do not include confidence scores unless something is unclear.
- Do not add explanations after normal answers.
- If a blank cannot be matched safely, write: unclear - reason.

Transcript:
${transcript || "[TRANSCRIPT WILL BE INSERTED HERE]"}`;
}
