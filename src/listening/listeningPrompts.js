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

export function listeningSkeletonPrompt({ audioName = "audio" } = {}) {
  return `You are reading sorted photos of one IELTS listening transcript-cloze worksheet.

Audio metadata:
- audio_name: ${audioName}

Task:
- Build a blank skeleton only.
- Do not fill answers.
- Do not use or infer from audio/transcript.
- Inspect every visible dotted/blank line in the worksheet photos.
- Inspect every blue handwritten marker number.
- The blue markers are absolute anchors. If a marker says 21, the blank line crossing or nearest that marker is blank 21.
- Do not skip blank lines between one marker and the next.
- After the final blue marker, continue counting every remaining visible blank line until the end of the worksheet/audio.
- Ignore official IELTS navigation ranges like "questions 1 to 6"; this worksheet may contain many more transcript blanks.

For each blank, capture local context:
- before: short visible words immediately before the blank.
- after: short visible words immediately after the blank, if any.
- speaker: speaker label near the blank, if visible.
- page_hint: visible page number or image order hint, if available.
- marker: blue marker number only when that blank is the marker anchor.

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
- If a blank is visible but context is hard to read, keep the number and write "unclear" in before/after or visual_note.`;
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
- Use the transcript as the primary source for answer text.
- Use each blank's before/after/speaker/signature context to find the matching local phrase in the transcript.
- The answer is the exact missing transcript span that was removed from the worksheet blank.
- Many blanks are long phrases or clauses. Do not compress a phrase into one keyword.
- Prefer the full contiguous transcript span that naturally fits the physical blank length in the worksheet photo.
- Do not blindly choose the longest possible span. The answer must fit the visible dotted/blank line.
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

### BLOCK 1

* **Signature:** \`copy skeleton signature\`
* **1.** answer
* **2.** answer
* **3.** answer
* **4.** answer
* **5.** answer

Validation rules:
- Filled blank count must equal Skeleton blank count.
- Every skeleton blank number must appear exactly once.
- Preserve exact missing wording from the transcript. Do not summarize or shorten.
- Preserve exact wording for names, numbers, addresses, prices, phone numbers, spelling, and units.
- Do not include explanations for normal answers.

Transcript:
${transcript || "[TRANSCRIPT WILL BE INSERTED HERE]"}

Skeleton:
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
