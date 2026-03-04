# Tài liệu bàn giao Ubuntu (`run_specex.sh`)

Tài liệu này giúp chạy `origin/codex/spec-ex-correction-consistency` trên Ubuntu theo cách ngắn nhất, đến mức có thể test gọi điện end-to-end.  
Người kế nhiệm chỉ cần làm theo thứ tự từ trên xuống.

---

## 1. Mục tiêu

Hoàn thành setup khi đạt đủ các điều kiện sau:

1. Chạy `./docs/run_specex.sh up` và khởi động được 5 process  
2. `./docs/run_specex.sh status` hiển thị `api/ws-gateway/proxy/voip-client/ngrok` là `running`  
3. Mở `http://localhost:3001` và thao tác `Init -> Call` được

---

## 2. Những thứ cần chuẩn bị trước

1. OpenAI API Key  
2. Giá trị Twilio  
   - `ACCOUNT_SID`
   - `API_KEY_SID`
   - `API_KEY_SECRET`
   - `APP_SID`
3. Kết nối Internet

---

## 3. Thiết lập lần đầu (chỉ làm 1 lần)

### 3-1. Cài gói cần thiết

```bash
sudo apt update
sudo apt install -y curl git python3 make g++ build-essential xdg-utils
```

Nếu chưa có `node`/`npm`, cài Node.js 20 (khuyến nghị dùng nvm):

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
node -v
npm -v
```

### 3-2. Lấy mã nguồn

```bash
cd ~
git clone <REPO_URL> requirements_VLF
cd ~/requirements_VLF
git fetch origin
```

### 3-3. Tạo worktree cho `spec-ex`

```bash
git worktree add -b specex-local ~/requirements_VLF_specex origin/codex/spec-ex-correction-consistency
```

### 3-4. Đặt `run_specex.sh` vào worktree

Khi vận hành, nên đặt script ở `requirements_VLF_specex/docs/` rồi chạy tại đó.

```bash
cp ~/requirements_VLF/docs/run_specex.sh ~/requirements_VLF_specex/docs/run_specex.sh
chmod +x ~/requirements_VLF_specex/docs/run_specex.sh
```

### 3-5. Tạo `.env` ban đầu (giá trị Twilio)

```bash
cd ~/requirements_VLF_specex/voip-client
cp -n .env.example .env
```

Mở `~/requirements_VLF_specex/voip-client/.env` và điền giá trị thật cho:

- `ACCOUNT_SID`
- `API_KEY_SID`
- `API_KEY_SECRET`
- `APP_SID`

`STREAM_URL` và `STREAM_STATUS_URL` sẽ được `run_specex.sh` tự động cập nhật nếu `RUN_NGROK=1`.

---

## 4. Cách khởi động (mỗi lần chạy)

### 4-1. Lệnh khởi động

```bash
cd ~/requirements_VLF_specex
OPENAI_API_KEY='YOUR_OPENAI_API_KEY' \
REALTIME_TRANSCRIPTION_MODEL='gpt-4o-mini-transcribe' \
RUN_NGROK=1 \
./docs/run_specex.sh up
```

Ghi chú:

1. Lần đầu sẽ mất thời gian vì cài dependencies  
2. Từ lần sau có thể thêm `INSTALL_DEPS=0` để chạy nhanh hơn

```bash
cd ~/requirements_VLF_specex
OPENAI_API_KEY='YOUR_OPENAI_API_KEY' \
REALTIME_TRANSCRIPTION_MODEL='gpt-4o-mini-transcribe' \
RUN_NGROK=1 \
INSTALL_DEPS=0 \
./docs/run_specex.sh up
```

### 4-2. Kiểm tra khởi động thành công

```bash
cd ~/requirements_VLF_specex
./docs/run_specex.sh status
```

Trạng thái đúng:

- `api`: running
- `ws-gateway`: running
- `proxy`: running
- `voip-client`: running
- `ngrok`: running

### 4-3. Cấu hình Voice URL trong Twilio Console

Dùng URL hiển thị khi chạy `up`.

Ví dụ:
- `Twilio Voice URL: https://xxxx.ngrok-free.dev/voice`

Lưu ý:

1. Chỉ cần đổi trong Twilio khi domain ngrok thay đổi  
2. Nếu dùng domain cố định và không đổi thì không cần chỉnh lại

### 4-4. Test cuộc gọi trên trình duyệt

Mặc định `run_specex.sh` sẽ tự mở `http://localhost:3001` sau khi startup.  
Nếu không tự mở thì mở thủ công.

Thao tác test:

1. `Init`
2. `Call`

---

## 5. Dừng, khởi động lại, xem log

### Dừng toàn bộ

```bash
cd ~/requirements_VLF_specex
./docs/run_specex.sh down
```

### Khởi động lại

```bash
cd ~/requirements_VLF_specex
./docs/run_specex.sh down
OPENAI_API_KEY='YOUR_OPENAI_API_KEY' REALTIME_TRANSCRIPTION_MODEL='gpt-4o-mini-transcribe' RUN_NGROK=1 INSTALL_DEPS=0 ./docs/run_specex.sh up
```

### Xem log

```bash
cd ~/requirements_VLF_specex
./docs/run_specex.sh logs
./docs/run_specex.sh logs ws-gateway
FOLLOW=1 ./docs/run_specex.sh logs ws-gateway
```

---

## 6. Sự cố thường gặp

### Trường hợp 1: `OPENAI_API_KEY is required`

Truyền `OPENAI_API_KEY='...'` khi chạy `up`.

### Trường hợp 2: `REALTIME_TRANSCRIPTION_MODEL is required`

Truyền `REALTIME_TRANSCRIPTION_MODEL='gpt-4o-mini-transcribe'` (hoặc model hợp lệ khác).

### Trường hợp 3: `Could not get ngrok public URL ...`

1. Kiểm tra log ngrok:
```bash
cd ~/requirements_VLF_specex
./docs/run_specex.sh logs ngrok
```
2. Kiểm tra API của ngrok:
```bash
curl -s http://127.0.0.1:4040/api/tunnels
```
3. Chạy lại với thời gian chờ dài hơn:
```bash
cd ~/requirements_VLF_specex
./docs/run_specex.sh down
OPENAI_API_KEY='YOUR_OPENAI_API_KEY' REALTIME_TRANSCRIPTION_MODEL='gpt-4o-mini-transcribe' RUN_NGROK=1 WAIT_NGROK_SECONDS=60 INSTALL_DEPS=0 ./docs/run_specex.sh up
```

### Trường hợp 4: `voip-client/.env ... looks like a placeholder`

Các giá trị Twilio trong `.env` vẫn là giá trị mẫu. Hãy thay bằng giá trị thật.

### Trường hợp 5: Muốn tắt tự mở trình duyệt

```bash
cd ~/requirements_VLF_specex
AUTO_OPEN_BROWSER=0 OPENAI_API_KEY='YOUR_OPENAI_API_KEY' REALTIME_TRANSCRIPTION_MODEL='gpt-4o-mini-transcribe' RUN_NGROK=1 INSTALL_DEPS=0 ./docs/run_specex.sh up
```

---

## 7. Checklist bàn giao

1. Đã dùng `git worktree` để checkout `origin/codex/spec-ex-correction-consistency` sang thư mục riêng  
2. Đã chạy `run_specex.sh up` và khởi động được 5 process  
3. Twilio Voice URL đang là `https://<ngrok-domain>/voice`  
4. `http://localhost:3001` chạy được `Init -> Call`  
5. Có thể kiểm tra log bằng `./docs/run_specex.sh logs`

---

## 8. Lưu ý bảo mật

1. Không dán API key / Twilio secret lên ticket hoặc chat  
2. Nếu đã lộ key thì thu hồi và cấp mới ngay  
3. Nếu không muốn key lưu trong lịch sử shell, dùng `read -s` trước khi chạy

Ví dụ:

```bash
read -s OPENAI_API_KEY
export OPENAI_API_KEY
cd ~/requirements_VLF_specex
REALTIME_TRANSCRIPTION_MODEL='gpt-4o-mini-transcribe' RUN_NGROK=1 INSTALL_DEPS=0 ./docs/run_specex.sh up
```
