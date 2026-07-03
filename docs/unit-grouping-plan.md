# Unit Grouping Plan

Problem: one photo can contain content from more than one unit. The fetch-answer pipeline should not ask the AI to solve one giant mixed skill folder.

Decision:

```text
classify skill first
  -> group units inside each skill
  -> reorder pages inside each unit
  -> later generate answers per unit
```

One image may appear in more than one unit group.

## CLI Pipeline

```bash
node bin/ielts-auto.mjs fetch-answers fetch/les_1
```

Outputs:

```text
fetch/les_1/organized/
fetch/les_1/unit_groups/
fetch/les_1/sorted_classified/
fetch/les_1/reports/
```

## Module Boundary

- `src/classifier`: decides skill only.
- `src/units`: decides unit membership inside one skill.
- `src/reorder`: decides page order inside one unit.
- `src/answers`: later consumes clean sorted unit folders.

Do not merge these decisions into one prompt.

## Current Scope

Primary focus:

- reading
- speaking

Listening will need separate research because audio may be required.

## Baseline Cross-Unit Test

Test input:

```text
fetch/cross_unit_sample/input
```

Result:

- reading units:
  - `unit_information_theory`
  - `unit_marie_curie`
  - `unit_sport_vocabulary`
- speaking units:
  - `unit_36`
  - `unit_37`
  - `unit_38`
  - `unit_40`

Cross-unit membership was detected:

- `sample_02.jpg` appeared in both `reading/unit_information_theory` and `reading/unit_marie_curie`
- `sample_12.jpg` appeared in both `speaking/unit_37` and `speaking/unit_38`

The pipeline copied those shared images into each relevant unit folder before local reorder.
