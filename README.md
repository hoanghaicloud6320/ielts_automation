# IELTS Automation

Tool tu dong phan loai anh bai tap IELTS va nop len Google Drive qua `rclone`.

## Chuan bi

1. Cai dependency:

   ```bash
   npm install
   ```

2. Dat Gemini API key vao file:

   ```text
   gemini-api-key.txt
   ```

   Hoac dung bien moi truong:

   ```bash
   GEMINI_API_KEY=your_key
   ```

3. Kiem tra `rclone` remote:

   ```bash
   node bin/ielts-auto.mjs check
   ```

   Remote mac dinh la:

   ```text
   ielts-drive:
   ```

## Cach Dung Nhanh

Dat anh da lam vao:

```text
submit/les_1/input/
```

Chay pipeline nop bai:

```bash
npm run submit -- submit/les_1
```

He thong se:

- goi Gemini de phan loai anh
- sap anh vao `reading`, `listening`, `speaking`, hoac `review`
- upload folder da sap xep len Google Drive bang `rclone`
- xuat report JSON trong `submit/les_1/reports`

Ket qua local:

```text
submit/les_1/classified/
  reading/
  listening/
  speaking/
  review/
```

Upload mac dinh:

```text
ielts-drive:IELTS/submissions/les_1
```

## Lenh CLI

### Submit mot lesson

```bash
node bin/ielts-auto.mjs submit submit/les_1
```

### Submit nhung khong upload that

```bash
node bin/ielts-auto.mjs submit submit/les_1 --dry-run
```

### Tiep tuc lesson dang chay do

Neu mang/API bi dung giua chung, chay lai voi `--resume`:

```bash
node bin/ielts-auto.mjs submit submit/les_1 --resume --dry-run
```

### Bo qua upload

```bash
node bin/ielts-auto.mjs submit submit/les_1 --skip-upload
```

### Phan loai mot anh

```bash
node bin/ielts-auto.mjs classify submit/les_1/input/page.jpg
```

### Fetch dap an tu de goc chua lam

Can chup de goc truoc khi lam bai. Neu anh da co chu viet tay, ket qua co the bi nhieu.

Dat anh de goc vao:

```text
fetch/les_1/input/
```

Phan loai va gom trang theo skill:

```bash
node bin/ielts-auto.mjs fetch-answers fetch/les_1
```

Neu muon goi Gemini de trich dap an/guidance theo tung unit:

```bash
node bin/ielts-auto.mjs fetch-answers fetch/les_1 --extract-answers
```

Hien tai `--extract-answers` xu ly:

- `reading`: giai bai theo tung unit, upload ca passage va cau hoi da sort cho Gemini.
- `speaking`: tao answer guidance/sample answers theo tung unit.
- `listening`: tam thoi skip vi can audio di kem, se co pipeline rieng sau.

Ket qua:

```text
fetch/les_1/organized/
  reading/
  listening/
  speaking/
  review/

fetch/les_1/unit_groups/
  reading/
  speaking/

fetch/les_1/sorted_classified/
  reading/
  listening/
  speaking/
  review/

fetch/les_1/answers/
  reading/
    unit_x.md
  speaking/
    unit_y.md
  reading.md
  speaking.md
fetch/les_1/reports/
```

Pipeline fetch lam 2 buoc rieng:

1. Classify anh vao `organized`.
2. Group unit rieng trong tung skill va ghi vao `unit_groups`.
3. Reorder rieng tung unit va ghi vao `sorted_classified`.
4. Neu co `--extract-answers`, trich dap an/guidance rieng tung unit va ghi vao `answers`.

Khong gop classify, group unit va reorder vao cung mot prompt. Mot anh co the nam trong nhieu unit neu la trang cross-unit.

### Thu nghiem sap xep thu tu trang

Dung cho mot folder anh cung skill da bi xao tron:

```bash
node bin/ielts-auto.mjs reorder-pages fetch/les_1/organized/reading --skill reading
```

Lenh nay chi tra JSON thu tu trang, khong giai dap an.

Neu muon test plumbing ma khong goi Gemini:

```bash
node bin/ielts-auto.mjs reorder-pages fetch/les_1/organized/reading --strategy filename
```

### Kiem tra rclone

```bash
node bin/ielts-auto.mjs check
```

### Tao lesson demo tu du lieu mau

```bash
node bin/ielts-auto.mjs prepare-demo --sample-root build/tmp/sample_data --lesson-dir submit/les_demo
```

Sau do chay:

```bash
node bin/ielts-auto.mjs submit submit/les_demo --dry-run
```

## Tuy Chinh

Model mac dinh:

```text
gemini-3.1-flash-lite
```

Doi model:

```bash
node bin/ielts-auto.mjs submit submit/les_1 --model gemini-3.1-flash-lite
```

Doi nguong auto-route:

```bash
node bin/ielts-auto.mjs submit submit/les_1 --min-confidence 0.85
```

Doi noi upload:

```bash
node bin/ielts-auto.mjs submit submit/les_1 --remote ielts-drive --base-path IELTS/submissions
```

## Luu Y

- Anh `reading`, `listening`, `speaking` confidence cao se duoc auto-route.
- Anh ghi chu, writing, bai qua mo ho, hoac bai co dau hieu khong ro se vao `review`.
- `submit/`, `node_modules/`, `.npm-cache/`, `build/`, file key, va file zip mau da duoc ignore khoi git.

Tai lieu chi tiet:

- `docs/submit-pipeline-map.md`
- `docs/classification-invariants.md`
- `docs/upload-transport-decision.md`
