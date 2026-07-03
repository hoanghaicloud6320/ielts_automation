# Page Reorder Test Plan

Goal: test page ordering separately from answer extraction.

CLI:

```bash
node bin/ielts-auto.mjs reorder-pages <imageDir> --skill reading
```

Fallback/plumbing-only test:

```bash
node bin/ielts-auto.mjs reorder-pages <imageDir> --strategy filename
```

Input:

- one folder containing images from the same lesson and skill
- filenames may be scrambled
- pages may be rotated

Output:

```json
{
  "ordered_files": [
    {
      "filename": "scrambled_02.jpg",
      "position": 1,
      "confidence": 0.9,
      "evidence": ["visible page number 12"]
    }
  ],
  "overall_confidence": 0.9,
  "warnings": []
}
```

Ordering signals:

- visible page numbers
- unit/lesson numbers
- exercise sequence
- section headings
- text continuation
- left/right page spread layout

Do not use:

- input filename order
- folder order

## Baseline Fixture Results

After replacing the Gemini key, visual reorder was tested on three scrambled fixtures from the new dataset:

```text
build/tmp/reorder_tests/les4_read_scrambled
build/tmp/reorder_tests/les5_speak_scrambled
build/tmp/reorder_tests/les5_lis_scrambled
```

Results:

- reading: correct order `page_a -> page_b -> page_c -> page_d`
- speaking: correct order `mix_01 -> mix_02 -> mix_03 -> mix_04 -> mix_05`
- listening: correct order `audio_a -> audio_b -> audio_c`

Gemini used visible page numbers and exercise/content flow as evidence.

Integrated pipeline test:

```text
fetch/les_reorder_mix/input
  -> organized
  -> sorted_classified
```

The mixed fixture had 12 pages across reading/listening/speaking. The pipeline classified first, then reordered locally per skill. All 12 pages matched expected per-skill order.
