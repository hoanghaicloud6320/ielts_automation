# IELTS Automation

Tool co 2 nut chinh:

1. Fetch dap an tu de goc.
2. Nop bai len Google Drive.

User chi can tha file vao 2 folder o root repo, roi chay lenh. `user_data/` la noi he thong tu luu session, cache, debug, classified, sorted, transcript, skeleton va answers.

## Setup Mot Lan

### 1. Cai dependency

```bash
npm install
```

### 2. Dat Gemini API key

Tao file:

```text
gemini-api-key.txt
```

Va paste API key vao do.

### 3. Config Google Drive bang rclone

Cai `rclone`, sau do config remote Google Drive ten:

```text
ielts-drive
```

Thu nhanh:

```bash
node bin/ielts-auto.mjs check
```

Mac dinh bai nop se upload vao:

```text
ielts-drive:IELTS/submissions/<session_name>
```

## Cach Dung Hang Ngay

### Nut 1: Fetch Dap An

Bo tat ca anh de goc chua lam va audio vao:

```text
put_image_here_to_fetch_ans/
```

Chay:

```bash
npm run fetch
```

He thong se tu:

- copy input vao `user_data/fetch_sessions/<session_name>/`
- phan loai skill
- chia unit trong tung skill
- sort trang trong tung unit
- trich dap an
- luu transcript/skeleton/debug khi co listening

Ket qua dap an se nam trong:

```text
user_data/fetch_sessions/<session_name>/answers/
```

Sau khi chay xong, user co the tu xoa file trong:

```text
put_image_here_to_fetch_ans/
```

Luu y khi chup anh de goc:

- Chup truoc khi lam bai.
- Chu ro, khong mo, khong loang bong.
- De so trang/unit/audio trong anh neu co.
- Listening nen chup ro marker xanh va bo audio vao cung folder input.

### Nut 2: Nop Bai

Bo tat ca anh bai da lam vao:

```text
put_image_here_to_submit/
```

Chay:

```bash
npm run submit
```

He thong se tu:

- copy input vao `user_data/submit_sessions/<session_name>/`
- phan loai anh thanh `reading`, `listening`, `speaking`, `review`
- sap vao folder local
- upload len Google Drive bang `rclone`

Mac dinh upload len:

```text
ielts-drive:IELTS/submissions/<session_name>
```

Sau khi chay xong, user co the tu xoa file trong:

```text
put_image_here_to_submit/
```

## Chi Tiet Ky Thuat

Flag nang cao, lenh test, pipeline map, va cach debug nam trong:

```text
README_detail.md
```
