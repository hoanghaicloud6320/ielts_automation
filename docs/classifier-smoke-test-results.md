# Classifier Smoke Test Results

Date: 2026-07-02

Model used first: `gemini-2.5-flash`

Default model after project update: `gemini-3.1-flash-lite`

## Summary

The first classifier prompt was tested against representative sample photos from the extracted dataset.

Initial schema used one competing label for `answer_key_or_checked`. Result: 7/8 passed.

The failure was useful:

- A speaking worksheet with many handwritten answers/ticks was classified as `answer_key_or_checked`.
- Gemini still mentioned the speaking evidence in warnings, but the schema forced it to choose either the skill or the checked state.

Conclusion:

- `checked/key/completed` must not be a primary label competing with `reading`, `listening`, and `speaking`.
- The classifier should return a primary skill plus contamination/completion flags.

## Revised Schema

Recommended output:

```json
{
  "primary_label": "reading | listening | speaking | writing_or_notes | unknown_or_needs_review",
  "confidence": 0.0,
  "orientation": "upright | rotate_90_clockwise | rotate_180 | rotate_90_counterclockwise | unknown",
  "is_completed_by_student": false,
  "is_answer_key_or_checked": false,
  "evidence": ["short reasons"],
  "warnings": ["ambiguity or contamination notes"],
  "should_route_to_review": false
}
```

## Revised Schema Test

With the revised schema, the classifier produced correct primary labels for the first 6/6 images tested before quota stopped the run:

- `reading_comprehension`: `reading`
- `reading_article_unit`: `reading`
- `listening_audio_dialogue`: `listening`
- `listening_rotated_dialogue`: `listening`
- `speaking_talk_about_appearance`: `speaking`
- `speaking_personal_prompts`: `speaking`

The previous full run also correctly detected:

- `checked_key_page`: `unknown_or_needs_review`, `is_answer_key_or_checked=true`
- `handwritten_notes_root`: `writing_or_notes`

## Quota Note

The run stopped because the key hit the free-tier quota for `gemini-2.5-flash`:

- quota metric: generate content free-tier requests
- model limit reported by API: 20 requests/day

Fallback attempts during the first smoke test:

- `gemini-2.5-flash-lite`: returned temporary high-demand `503`
- `gemini-2.0-flash`: quota unavailable/zero for this key

The script now saves partial results after every image and supports subset runs:

```bash
SAMPLE_IDS=checked_key_page,handwritten_notes_root npm run classify
```

PowerShell:

```powershell
$env:SAMPLE_IDS='checked_key_page,handwritten_notes_root'; npm run classify
```

The script now defaults to `gemini-3.1-flash-lite`. Override with `GEMINI_MODEL` if the official Flash Lite model ID changes later.

PowerShell override example:

```powershell
$env:GEMINI_MODEL='gemini-3.1-flash-lite'; npm run classify
```

## Routing Decision

For the submit pipeline:

- Auto-route by `primary_label` only when it is `reading`, `listening`, or `speaking` with sufficient confidence.
- Keep `is_completed_by_student` as normal and expected.
- Route to review if `primary_label` is `writing_or_notes` or `unknown_or_needs_review`.

For the fetch-answer pipeline:

- Reject or warn if `is_completed_by_student=true`.
- Reject or warn harder if `is_answer_key_or_checked=true`.
- This pipeline needs clean blank prompt/source pages.
