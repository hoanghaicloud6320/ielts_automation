# IELTS Image Classification Invariants

Source sample: `dulieumau_drive-download-20260702T112939Z-3-001.zip`

Working copy inspected at: `build/tmp/sample_data`

## Dataset Notes

- The sample contains 187 `.jpg` files, plus a few `.docx`, `.txt`, and nested `.zip` files.
- Folder labels are useful but not fully reliable. Some images under `Lis` contain visible `Reading Comprehension` pages, and some root lesson images are handwritten notebook notes rather than clear reading/listening/speaking worksheets.
- Images may be rotated 90 or 180 degrees.
- Many images are already completed by the student, with handwriting, circles, ticks, corrections, and teacher marks.
- The classifier should return a label with confidence and reasons, not only a hard category.

## Primary Labels

Use these labels for the first classifier version:

- `reading`
- `listening`
- `speaking`
- `writing_or_notes`
- `answer_key_or_checked`
- `unknown_or_needs_review`

The submit pipeline can map only high-confidence `reading`, `listening`, and `speaking` into final folders. Everything else should go to review instead of being forced into one of the three IELTS folders.

## Global Invariants

- Normalize orientation before classification. Do not assume the text is upright.
- Ignore directory names during visual classification, or treat them only as weak metadata.
- Look at page purpose, not just keywords. Many pages include vocabulary, exercises, and headphones icons even when the broader skill is speaking or daily communication.
- Treat heavy handwriting as normal for submit images, but as a warning for fetch-answer images.
- Detect corrected/key pages separately when there are many red ticks, teacher corrections, answer markings, or "Check key" context.
- Detect notebook pages separately when the image is mostly handwritten notes on lined paper with no printed worksheet structure.

## Reading Invariants

Strong signals:

- Visible headings such as `Reading Comprehension`, `Pre-Reading Questions`, `Vocabulary Preview`, `Summary`, or passage/article titles.
- Long passages, article-like blocks, paragraphs, or a large reading topic title.
- Questions referring to a reading/passage/article, for example:
  - "according to the reading"
  - "look for the answers in the passage"
  - "according to the article"
  - true/false statements about a passage
  - multiple-choice questions based on a passage
- Vocabulary extension tied to reading content.
- Layout resembles a textbook reading unit more than an audio transcript or personal speaking prompt.

Weak/ambiguous signals:

- A page with only vocabulary exercises may belong to reading, speaking, or general unit work.
- A page with headphones icons is not automatically listening; some speaking/media units use those icons too.

## Listening Invariants

Strong signals:

- Audio labels such as `Audio 9`, `A19`, or similar track markers.
- Transcript-like conversation with speaker turns, dialogue flow, and many blanks to complete while listening.
- Instructions that imply audio playback:
  - listen
  - complete the conversation
  - fill in the blanks
  - audio track labels
- Dense dotted blank lines embedded inside a dialogue.
- Page may contain many handwritten answers over blanks.

Weak/ambiguous signals:

- Headphone icons alone are not enough.
- Some pages with dialogue can be speaking practice rather than listening if the task asks the student to roleplay, ask a partner, or talk about themselves.

## Speaking Invariants

Strong signals:

- Unit titles like `I can talk about ...`, `I can describe ...`, or similar communicative objectives.
- Personal-response prompts:
  - `ABOUT YOU`
  - `ABOUT YOUR FAMILY`
  - "write your answers"
  - "ask another student"
  - "ask your partner"
  - "Can you remember...?"
- Prompts designed to generate spoken answers rather than find a fixed answer in a passage.
- Cue-card-like or interview-style questions asking about the student, family, opinions, preferences, experiences, or descriptions.
- Vocabulary around describing people, places, daily life, family, travel, etc., paired with speaking/personal tasks.

Weak/ambiguous signals:

- Grammar/vocabulary drill pages inside speaking units may look like reading worksheets.
- If the page has personal questions plus partner/ask prompts, prefer `speaking` over `reading`.

## Writing Or Notes Invariants

Strong signals:

- Mostly handwritten content on notebook paper.
- Essay notes, grammar corrections, planning, outlines, or teacher feedback.
- No printed textbook layout or only very little printed structure.
- Long handwritten paragraphs rather than answers filled into a worksheet.

Handling:

- Do not force these into reading/listening/speaking.
- For submit pipeline, place into `unknown_or_needs_review` or a future `writing` folder if writing becomes supported.

## Answer Key Or Checked Invariants

Strong signals:

- Many red ticks/check marks, corrections, circled answers, or teacher annotations.
- Folder/context may say `Check key`, but visual marks should be enough.
- Page appears to contain completed/corrected answers rather than a clean worksheet.

Handling:

- For submit pipeline, this may be valid evidence of completed work but should be flagged.
- For fetch-answer pipeline, reject or warn because checked/answered pages contaminate answer extraction.

## Prompt Contract Recommendation

Ask Gemini to return structured JSON:

```json
{
  "label": "reading | listening | speaking | writing_or_notes | answer_key_or_checked | unknown_or_needs_review",
  "confidence": 0.0,
  "orientation": "upright | rotate_90_clockwise | rotate_180 | rotate_90_counterclockwise | unknown",
  "evidence": ["short visual/textual reasons"],
  "warnings": ["possible contamination or ambiguity"],
  "should_route_to_review": false
}
```

Routing rule:

- Auto-route only if confidence is high and label is one of `reading`, `listening`, `speaking`.
- Review otherwise.

## First Prompt Strategy

The first classifier prompt should emphasize:

- Classify by image content, not by file path.
- Mentally rotate the image if needed.
- Separate notebook notes and checked/key pages from the three main skills.
- Use `unknown_or_needs_review` when the page purpose is unclear.
- Provide short evidence so we can audit mistakes during prompt iteration.

