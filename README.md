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

### Bo qua upload

```bash
node bin/ielts-auto.mjs submit submit/les_1 --skip-upload
```

### Phan loai mot anh

```bash
node bin/ielts-auto.mjs classify submit/les_1/input/page.jpg
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
