# Fetch Answers Pipeline Map

Warning for users:

```text
Take photos of the original blank worksheet before doing the homework.
If the photos already contain handwriting, checked answers, or corrections, AI extraction can be contaminated.
```

## CLI

Classify and organize blank/original source pages:

```bash
node bin/ielts-auto.mjs fetch-answers fetch/les_1
```

Classify and ask Gemini to extract answers/guidance:

```bash
node bin/ielts-auto.mjs fetch-answers fetch/les_1 --extract-answers
```

## Flow

```text
fetch/les_i/input
  -> src/classifier batch classify
  -> fetch/les_i/organized
       reading/
       listening/
       speaking/
       review/
  -> src/units skill-wide sort + group
  -> fetch/les_i/unit_groups
       reading/unit_a/
       reading/unit_b/
       speaking/unit_a/
       speaking/unit_b/
       ...
  -> fetch/les_i/sorted_classified
       reading/unit_a/
       reading/unit_b/
       speaking/unit_a/
       speaking/unit_b/
       review/
  -> optional src/answers extraction
  -> fetch/les_i/answers
       reading.md
       listening.md
       speaking.md
  -> fetch/les_i/reports/fetch-answers-report-*.json
```

## Current Scope

Implemented now:

- classify blank/original page photos by visible content
- group pages into skill folders
- sort every skill group as a whole, then infer units from that ordered context
- allow one cross-unit image to appear in multiple unit groups
- preserve per-unit page regions such as `left page only` and `right page only`
- write clean downstream input to `sorted_classified`
- warn when classifier sees completed/checked pages
- optional Gemini answer/guidance extraction per skill
- listening answer extraction saves transcript, builds a transcript-aware blank skeleton, then fills that skeleton

Still experimental:

- answer extraction prompt quality
- automatic physical image rotation
- UI for comparing/checking answers

## Current Reorder Pipeline Test

Mixed input fixture:

```text
fetch/les_reorder_mix/input
```

It contains mixed reading/listening/speaking pages with scrambled filenames.

Result:

- classification created `organized/{reading,listening,speaking}`
- local per-skill reorder created `sorted_classified/{reading,listening,speaking}`
- expected order matched for all 12 test pages

Important: unit grouping and reorder are performed only after classification, and separately inside each skill group. The current strategy sorts all pages inside a skill first, then derives unit groups from that sorted context.

Cross-unit fixture:

```text
fetch/cross_unit_sample/input
```

This fixture confirmed that one image can be copied into multiple unit groups before reorder.

## Module Boundaries

- `src/fetch`: pipeline orchestration for fetch answers.
- `src/answers`: skill-specific answer/guidance prompts and Gemini answer extraction.
- `src/classifier`: shared visual classifier.
- `src/units/skillSortGrouper.js`: skill-wide sort and unit grouping with cross-unit page-region metadata.
