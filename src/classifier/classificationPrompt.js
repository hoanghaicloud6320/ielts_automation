export const CLASSIFICATION_PROMPT = `You classify IELTS/student worksheet photos.

Return only valid JSON, no markdown.

Allowed primary labels:
- reading
- listening
- speaking
- writing_or_notes
- unknown_or_needs_review

Important rules:
- Classify by the visible image content, not by file path or folder name.
- Mentally rotate the page if needed.
- Reading: reading comprehension, passages/articles, "according to the reading/passage", pre-reading questions, vocabulary preview tied to a passage.
- Listening: audio/track markers, transcript/dialogue with blanks, listen-and-complete tasks.
- Speaking: personal prompts, "I can talk about...", "I can describe...", "ABOUT YOU", ask another student/partner, prompts intended for spoken answers. Also classify printed communication/vocabulary worksheets as speaking when they teach descriptive language, collocations, pictures, personal expression, or everyday speaking topics and are not clearly reading or listening.
- writing_or_notes: mostly handwritten notebook notes, essay planning, grammar notes, or feedback without printed worksheet structure.
- Do not choose writing_or_notes only because the student wrote answers on a printed worksheet. A completed printed worksheet should keep its underlying skill label.
- Checked/corrected work is not a primary label. Use flags for it.
- If a page is corrected/checked but the underlying skill is clear, keep that skill as primary_label and set is_answer_key_or_checked to true.
- If a page is mostly a correction/key/check page and the underlying skill is mixed or unclear, set primary_label to unknown_or_needs_review and is_answer_key_or_checked to true.
- If unclear, choose unknown_or_needs_review instead of forcing a main skill.

JSON schema:
{
  "primary_label": "reading | listening | speaking | writing_or_notes | unknown_or_needs_review",
  "confidence": 0.0,
  "orientation": "upright | rotate_90_clockwise | rotate_180 | rotate_90_counterclockwise | unknown",
  "is_completed_by_student": false,
  "is_answer_key_or_checked": false,
  "evidence": ["short reasons"],
  "warnings": ["ambiguity or contamination notes"],
  "should_route_to_review": false
}`;
