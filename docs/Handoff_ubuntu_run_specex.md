# Ubuntu 引き継ぎ手順書（`run_specex.sh`）

この手順書は、Ubuntu 環境で `origin/codex/spec-ex-correction-consistency` を最短で起動し、通話テストまで進めるためのものです。  
後任の方は、このページを上から順に実行してください。

---

## 1. ゴール

以下が満たせればセットアップ完了です。

1. `./docs/run_specex.sh up` で 5プロセスが起動する  
2. `./docs/run_specex.sh status` で `api/ws-gateway/proxy/voip-client/ngrok` が `running`  
3. `http://localhost:3001` で `Init -> Call` が実行できる

---

## 2. 事前に必要なもの

1. OpenAI API Key  
2. Twilio の値  
   - `ACCOUNT_SID`
   - `API_KEY_SID`
   - `API_KEY_SECRET`
   - `APP_SID`
3. インターネット接続

---

## 3. 初回セットアップ（1回だけ）

### 3-1. 必要パッケージ

```bash
sudo apt update
sudo apt install -y curl git python3 make g++ build-essential xdg-utils
```

`node`/`npm` が無い場合は Node.js 20 系を入れてください（nvm 推奨）。

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
node -v
npm -v
```

### 3-2. リポジトリ取得

```bash
cd ~
git clone <REPO_URL> requirements_VLF
cd ~/requirements_VLF
git fetch origin
```

### 3-3. `spec-ex` 用 worktree 作成

```bash
git worktree add -b specex-local ~/requirements_VLF_specex origin/codex/spec-ex-correction-consistency
```

### 3-4. `run_specex.sh` を worktree 側へ配置

`run_specex.sh` は運用上、`requirements_VLF_specex/docs/` に置いて実行してください。

```bash
cp ~/requirements_VLF/docs/run_specex.sh ~/requirements_VLF_specex/docs/run_specex.sh
chmod +x ~/requirements_VLF_specex/docs/run_specex.sh
```

### 3-5. `.env` の初期作成（Twilio値）

```bash
cd ~/requirements_VLF_specex/voip-client
cp -n .env.example .env
```

`~/requirements_VLF_specex/voip-client/.env` を開き、以下を実値で設定:

- `ACCOUNT_SID`
- `API_KEY_SID`
- `API_KEY_SECRET`
- `APP_SID`

`STREAM_URL` と `STREAM_STATUS_URL` は `run_specex.sh` が自動更新します（`RUN_NGROK=1` の場合）。

---

## 4. 起動手順（毎回）

### 4-1. 起動コマンド

```bash
cd ~/requirements_VLF_specex
OPENAI_API_KEY='YOUR_OPENAI_API_KEY' \
REALTIME_TRANSCRIPTION_MODEL='gpt-4o-mini-transcribe' \
RUN_NGROK=1 \
./docs/run_specex.sh up
```

補足:

1. 初回は依存インストールが走るため時間がかかります  
2. 2回目以降は高速化するため `INSTALL_DEPS=0` をつけてもOK

```bash
cd ~/requirements_VLF_specex
OPENAI_API_KEY='YOUR_OPENAI_API_KEY' \
REALTIME_TRANSCRIPTION_MODEL='gpt-4o-mini-transcribe' \
RUN_NGROK=1 \
INSTALL_DEPS=0 \
./docs/run_specex.sh up
```

### 4-2. 起動成功の確認

```bash
cd ~/requirements_VLF_specex
./docs/run_specex.sh status
```

以下の状態ならOK:

- `api`: running
- `ws-gateway`: running
- `proxy`: running
- `voip-client`: running
- `ngrok`: running

### 4-3. Twilio Console の Voice URL

`up` 実行時に表示された URL を設定します。

例:
- `Twilio Voice URL: https://xxxx.ngrok-free.dev/voice`

注意:

1. ngrok ドメインが変わったときだけ Twilio 側の更新が必要  
2. 固定ドメイン運用で同じなら変更不要

### 4-4. ブラウザで通話テスト

`run_specex.sh` は起動後に `http://localhost:3001` を自動で開きます（既定）。  
開かれない場合は手動で開いてください。

テスト操作:

1. `Init`
2. `Call`

---

## 5. 停止・再起動・ログ確認

### 停止

```bash
cd ~/requirements_VLF_specex
./docs/run_specex.sh down
```

### 再起動

```bash
cd ~/requirements_VLF_specex
./docs/run_specex.sh down
OPENAI_API_KEY='YOUR_OPENAI_API_KEY' REALTIME_TRANSCRIPTION_MODEL='gpt-4o-mini-transcribe' RUN_NGROK=1 INSTALL_DEPS=0 ./docs/run_specex.sh up
```

### ログ確認

```bash
cd ~/requirements_VLF_specex
./docs/run_specex.sh logs
./docs/run_specex.sh logs ws-gateway
FOLLOW=1 ./docs/run_specex.sh logs ws-gateway
```

---

## 6. よくあるトラブル

### ケース1: `OPENAI_API_KEY is required`

`up` 実行時に `OPENAI_API_KEY='...'` を渡してください。

### ケース2: `REALTIME_TRANSCRIPTION_MODEL is required`

`REALTIME_TRANSCRIPTION_MODEL='gpt-4o-mini-transcribe'` などを渡してください。

### ケース3: `Could not get ngrok public URL ...`

1. ngrokログ確認:
```bash
cd ~/requirements_VLF_specex
./docs/run_specex.sh logs ngrok
```
2. API確認:
```bash
curl -s http://127.0.0.1:4040/api/tunnels
```
3. 再実行:
```bash
cd ~/requirements_VLF_specex
./docs/run_specex.sh down
OPENAI_API_KEY='YOUR_OPENAI_API_KEY' REALTIME_TRANSCRIPTION_MODEL='gpt-4o-mini-transcribe' RUN_NGROK=1 WAIT_NGROK_SECONDS=60 INSTALL_DEPS=0 ./docs/run_specex.sh up
```

### ケース4: `voip-client/.env ... looks like a placeholder`

`.env` の Twilio 値が仮値です。実値を設定してください。

### ケース5: ブラウザ自動起動を無効にしたい

```bash
cd ~/requirements_VLF_specex
AUTO_OPEN_BROWSER=0 OPENAI_API_KEY='YOUR_OPENAI_API_KEY' REALTIME_TRANSCRIPTION_MODEL='gpt-4o-mini-transcribe' RUN_NGROK=1 INSTALL_DEPS=0 ./docs/run_specex.sh up
```

---

## 7. 引き継ぎチェックリスト

1. `git worktree` で `origin/codex/spec-ex-correction-consistency` を別ディレクトリに展開した  
2. `run_specex.sh up` で 5プロセスが起動した  
3. Twilio Voice URL が `https://<ngrok-domain>/voice` になっている  
4. `http://localhost:3001` で `Init -> Call` が成功した  
5. 必要ログが `./docs/run_specex.sh logs` で確認できる  

---

## 8. セキュリティ注意

1. APIキーやTwilioシークレットをチケット/チャットに貼らない  
2. 露出したキーはすぐに無効化して再発行する  
3. シェル履歴に残したくない場合は、実行前に `read -s` で入力する

例:

```bash
read -s OPENAI_API_KEY
export OPENAI_API_KEY
cd ~/requirements_VLF_specex
REALTIME_TRANSCRIPTION_MODEL='gpt-4o-mini-transcribe' RUN_NGROK=1 INSTALL_DEPS=0 ./docs/run_specex.sh up
```
