# codex/openai-sdk-state-machine-control ブランチ 引き継ぎ文書

作成日: 2026-03-02
レビュー済み: Codex Desktop（2026-03-02）
比較対象: origin/main@9a315a9 vs origin/codex/openai-sdk-state-machine-control@734ee21
差分算出: git diff origin/main..origin/codex/openai-sdk-state-machine-control（2点間）

---

## 1. ブランチの概要（最大の特徴：ルートコミットから独立）

このブランチは、ws-gateway の OpenAI Realtime API 接続を**生の WebSocket ハンドリングから OpenAI 公式 SDK (`openai` npm パッケージ) に移行**し、同時に**状態機械（FSM）による発話制御を決定論的（deterministic）に行う仕組み**を導入するためのブランチである。

主要な目的は以下の3点:

1. **OpenAI SDK によるトランスポート抽象化**: `ws` パッケージを直接使う raw_ws モードに加え、`openai/realtime/ws`（`OpenAIRealtimeWS`）を使う openai_sdk モードを追加し、`RealtimeConnection` インターフェースで両者を統一的に扱えるようにする。
2. **決定論的発話制御（Deterministic Speech Control）**: `response.create` を `conversation: "none"` + `input: []` で発行することにより、過去の会話コンテキストの混入を排除し、状態機械のプロンプトを一字一句そのまま読み上げさせる。
3. **ローカル開発・検証の整備**: Runbook、`.env.example`、ローカルスタブ（Realtime API スタブ、ツールスタブ）、Twilio E2E プローブを追加し、次のエンジニアが段階的に動作確認できるようにする。

このブランチは**ルートコミット（親コミットなし）から始まっており**、リポジトリ全体のスナップショットとして最初のコミット `eea0f68` が作られている。これは別の開発環境からの持ち込みであり、main ブランチの git 履歴とは直接つながっていない点に注意が必要。`git merge-base` は共通祖先を返さない。

---

## 2. mainとの差分（27 ファイル、+2,419/-1,467行）

### 2-1. 変更ファイル分類（新規追加/既存更新/削除）

#### コミット一覧（時系列順）

| # | コミットハッシュ | メッセージ | 主な内容 |
|---|---|---|---|
| 1 | `eea0f68` | feat: add openai sdk realtime transport and deterministic FSM speech control | リポジトリ全体のスナップショット + SDK統合 + 決定論的発話制御 |
| 2 | `90a4894` | chore: add runbook, env template, and local tools stub for guided SDK rollout | ExecutionRunbook.md、.env.example、local_tools_stub.ts、package.json にツールスタブスクリプト追加 |
| 3 | `734ee21` | fix: improve realtime audio playback diagnostics and gateway flow | voip-client の音声再生診断強化、proxy のパスルーティング追加、index.ts のフロー改善 |

#### 新規追加ファイル（10ファイル）

| ファイル | 行数 | 説明 |
|---|---|---|
| `ws-gateway/src/realtimeTransport.ts` | 181行 | SDK/raw_ws 両対応のトランスポートアダプタ |
| `ws-gateway/src/stateMachine.ts` | 909行 | conversation.ts から分離された会話状態機械本体 |
| `ws-gateway/.env.example` | 41行 | 全環境変数のテンプレート |
| `ws-gateway/scripts/local_realtime_stub.ts` | 195行 | ローカル Realtime API スタブサーバー |
| `ws-gateway/scripts/local_tools_stub.ts` | 87行 | ローカルツールスタブサーバー |
| `ws-gateway/scripts/twilio_e2e_probe.ts` | 106行 | Twilio E2E プローブスクリプト |
| `docs/ExecutionRunbook.md` | 82行 | SDK モードの実行手順書 |
| `docs/FsmCoreIntegrationSpec.md` | 169行 | FSM コア統合仕様書 |
| `docs/OpenAIRealtimeSdkMigration.md` | 38行 | SDK 移行の概要ドキュメント |
| `docs/StateMachineStabilitySpec.md` | 143行 | 状態機械安定性仕様書 |

#### 変更されたファイル（既存ファイルの更新、15ファイル）

| ファイル | +/- | 変更概要 |
|---|---|---|
| `ws-gateway/src/conversation.ts` | +7/-909 | 909行の本体を stateMachine.ts へ移動し、re-export（7行）に縮小 |
| `ws-gateway/src/index.ts` | +265/-239 | SDK トランスポート対応、決定論的発話制御、セッションガード追加 |
| `ws-gateway/src/config.ts` | +2/-0 | `realtimeTransport` と `realtimeApiBaseUrl` の2設定追加 |
| `ws-gateway/package.json` | +4/-0 | `openai` (`^6.21.0`) 依存追加、スタブ起動スクリプト追加 |
| `ws-gateway/package-lock.json` | +22/-0 | `openai` パッケージのロックファイル更新 |
| `docs/realtime_dialect.md` | +62/-0 | main 79行 → ブランチ141行に拡張。Combo A/B、Voice Stability Profile 追記 |
| `docs/ConversationSpec.md` | +24/-35 | 状態定義の調整（EX_Silence タイムアウト変更等） |
| `docs/DetailedDesign.md` | +5/-21 | WSゲートウェイ説明更新（stateMachine.ts 分離反映） |
| `docs/ADR/README.md` | +9/-26 | ADR一覧テーブルの変更（0009 削除に伴う） |
| `docs/ADR/0004-telephony-and-ws-gateway.md` | +0/-6 | "Superseded by" セクション削除（ADR-0009 削除に伴う） |
| `docs/ImplementationPlan.md` | +0/-7 | 「決定事項（実装SSOT）」セクション削除 |
| `docs/ImplementationTickets.md` | +7/-9 | チケット番号のずれ修正 |
| `proxy/src/index.js` | +3/-0 | `/twilio/stream-status`、`/token`、`/app.js` パス追加（45行） |
| `voip-client/src/public/app.js` | +54/-0 | リモートオーディオ再生リトライ、DOM マウント、診断イベントログ |
| `voip-client/src/public/index.html` | +4/-0 | Remote Audio 表示エリア追加 |

#### 削除されたファイル（2ファイル、-215行）

| ファイル | 削除行数 | 説明 |
|---|---|---|
| `docs/ADR/0009-pcmu-conversion-at-gateway.md` | -25行 | PCMU変換に関するADR。このブランチでは不要と判断 |
| `docs/ConsistencyAudit_Prompt7.md` | -190行 | 一貫性監査レポート。このブランチには含まれていない |

### 2-2. 主要ファイルの内容詳細

#### `ws-gateway/src/realtimeTransport.ts`（181行、新規）

OpenAI Realtime API への接続を抽象化するモジュール。

- **`RealtimeConnection` インターフェース**: `onOpen`、`onMessage`、`onClose`、`onError`、`send`、`close`、`isOpen` の7メソッドを定義。トランスポート方式に関わらず統一的にイベントハンドリングが可能。
- **`createRawWsConnection`**: 従来の `ws` パッケージを直接使う接続。URL にモデル名をクエリパラメータで付与し、Authorization ヘッダーを設定。バイナリメッセージは base64 エンコードして `__raw_binary_audio__` 型イベントとして返す。
- **`createSdkConnection`**: `openai` パッケージの `OpenAIRealtimeWS` クラスを使う接続。`baseURL` に `REALTIME_API_BASE_URL` を設定し、SDK 内部で接続を管理。イベントは SDK の `event` イベントから取得。
- **`createRealtimeConnection`**: ファクトリ関数。`transport` パラメータが `"raw_ws"` なら raw、それ以外は SDK モード。

#### `ws-gateway/src/stateMachine.ts`（909行、新規）

会話状態機械の本体。元の `conversation.ts`（909行）の内容がそのまま移動された。

- **状態定義**: `ST_Greeting` / `ST_RequirementCheck` / `ST_RequirementConfirm` / `ST_ProductSuggestion` / `ST_StockCheck` / `ST_PriceQuote` / `ST_AddressConfirm` / `ST_DeliveryCheck` / `ST_OrderConfirmation` / `ST_Closing` / `EX_Silence` / `EX_NoHear`
- **型定義**: `ConversationState`、`Product`、`ToolClient`、`ConversationConfig`、`ConversationContext`
- **米銘柄処理**: `normalizeRiceText`、`extractRiceBrand`（辞書ベースの銘柄マッチング + エイリアス + ファジーマッチング）、`extractWeightKg`（正規表現ベースの重量抽出）
- **`createConversationController`**: FSM のメインファクトリ。`onPrompt`、`onLog`、`onInquiryUpdate` のハンドラーを受け取り、`start()`、`onUserTranscript()`、`onUserCommitted()`、`onSpeechStarted()`、`onSpeechStopped()`、`onAssistantStart()`、`onAssistantDone()`、`setCustomerPhone()`、`setAddress()` のメソッドを公開。

#### `ws-gateway/src/conversation.ts`（7行、大幅縮小）

```typescript
export {
  createConversationController,
  extractRiceBrand,
  extractWeightKg,
  normalizeRiceText,
  type Product,
} from "./stateMachine.js";
```

`stateMachine.ts` への re-export のみ。後方互換性を維持しつつ、実装本体は `stateMachine.ts` に集約。

#### `ws-gateway/src/index.ts`（大幅改修、+265/-239行）

- `createRealtimeConnection` を使い、`config.realtimeTransport` に応じてトランスポートを切り替え。
- `buildStrictRendererInstructions()`: 状態機械のプロンプトを「一字一句読み上げ」指示に変換する関数。
- `response.create` 送信時に `conversation: "none"` と `input: []` を設定し、過去コンテキストの影響を排除。
- `isCloseSpokenMatch()`: 期待発話と実際の音声書き起こしを正規化して比較し、不一致時に `assistant.transcript.mismatch` を出力。
- `session.updated` 受信前のガード: メディア転送や `response.create` の送信を抑止。
- リモートオーディオのバッファリングと Twilio への転送ロジック改善。

#### `ws-gateway/src/config.ts`（微修正、+2行）

追加された設定:
- `realtimeTransport`: `"openai_sdk"` (デフォルト) / `"raw_ws"`
- `realtimeApiBaseUrl`: SDK モード用の API ベースURL（デフォルト: `https://api.openai.com/v1`）

#### `ws-gateway/.env.example`（41行、新規）

全環境変数のテンプレート。セクション分けされている:
- OpenAI Realtime 接続設定（Transport、Model、Beta Header、Schema、Audio Mode 等）
- 状態機械挙動設定（Silence Timeout、Retries、STT Confidence 等）
- 外部サービス接続（Tool Base URL、Log API Base URL）
- オプション設定（Product Catalog Path、Test Prompt）

#### `ws-gateway/scripts/local_realtime_stub.ts`（195行、新規）

ローカル開発用の Realtime API スタブサーバー。OpenAI API なしでゲートウェイの動作を検証可能。

- WebSocket サーバーとして動作（デフォルト: `127.0.0.1:19001`）
- TLS サポート（`STUB_TLS=1` で有効化）
- `session.update` → `session.updated` の応答
- `response.create` → 指示文から発話テキストを抽出し、`response.audio_transcript.delta/done` + `response.output_audio.delta` + `response.done` のイベントシーケンスを返す
- `input_audio_buffer.append` → オプションでユーザーターンのシミュレーション（`STUB_SEND_USER_TURN=1`）

#### `ws-gateway/scripts/local_tools_stub.ts`（87行、新規）

ツール API スタブサーバー。

- HTTP サーバー（デフォルト: `127.0.0.1:19002`）
- エンドポイント: `/tools/stock`、`/tools/price`、`/tools/delivery-date`、`/tools/orders`
- 固定レスポンス（在庫: 99個、価格: 2,680円、配送日: 2026-02-20、注文ID: ORD-STUB-{timestamp}）

#### `ws-gateway/scripts/twilio_e2e_probe.ts`（106行、新規）

ゲートウェイへの E2E 通信プローブ。

- WebSocket でゲートウェイに接続
- Twilio `start` イベント送信（テストパラメータ付き）
- `media` イベントでサイレンスフレームを送信
- outbound audio の到着を待ち、成功/失敗を判定

#### `docs/ExecutionRunbook.md`（82行、新規）

SDK モードでのセットアップ・実行手順書:
1. 環境変数設定（.env.example からコピー）
2. ローカルスタブ起動（tools-stub → realtime-stub）
3. ws-gateway を SDK モードで起動
4. Twilio E2E プローブ実行
5. raw_ws へのロールバック比較
6. 実通話テスト手順

#### `docs/OpenAIRealtimeSdkMigration.md`（38行、新規）

SDK 移行の変更サマリ:
1. `realtimeTransport.ts` の追加（アダプタパターン）
2. `config.ts` への環境変数追加
3. `response.create` の決定論的設定
4. `openai` パッケージ依存の追加

#### `docs/FsmCoreIntegrationSpec.md`（169行、新規）

FSM コア統合仕様。次のスレッドでの FSM 拡張方針を定義:
- 通信層と状態機械層の境界 I/F（Boundary Contract）
- 導入先（Agents SDK）との連携方針（FSM確定 vs LLM自由生成の責務分担）
- 4ステップの実装計画（I/F固定 → 外部化準備 → アダプタ層 → 本番検証）
- 矛盾点・不足項目・具体的編集提案のリスト

#### `docs/StateMachineStabilitySpec.md`（143行、新規）

状態機械の安定性仕様:
- 初期状態ルール（必ず `ST_Greeting` 開始）
- 要件収集スコープ（brand/weight 抽出の許可状態の限定）
- Realtime/Turn ガード仕様（session.updated 前ガード、commit/transcript ガード等）
- AI 発話一致仕様（verbatim wrapper、out-of-band response、mismatch 検知）
- カタログ仕様（フォールバック銘柄カタログ）
- ログ仕様（`[CONV] AI/USER` 形式）

#### `docs/realtime_dialect.md`（141行、既存更新: main 79行 → 141行、+62/-0）

OpenAI Realtime API の方言ドキュメント:
- **Combo A**（audio schema、beta header off）: Twilio 統合用
- **Combo B**（flat schema、beta header on）: 標準設定
- Voice Stability Profile: バージイン制御、ASR ノイズ対策、スロット再質問ロジック等
- Known Pitfalls（session.audio の拒否、イベント名の揺れ等）

#### `proxy/src/index.js`（45行、微修正）

`isVoipPath()` 関数に `/twilio/stream-status`、`/token`、`/app.js` のパスを追加。voip-client の新機能に対応。

#### `voip-client/src/public/app.js`（+54行の拡張）

- `playRemoteAudioWithRetry()`: リモートオーディオ再生のリトライ（最大5回、バックオフ付き）
- `mountRemoteAudioElement()`: audio 要素の DOM マウントと属性設定
- イベントログ強化: `call.audio.playing`、`call.audio.pause`、`call.audio.ended` イベントの記録
- `postClientEvent()`: クライアントイベントのサーバー送信

#### `voip-client/src/public/index.html`（+4行）

Remote Audio の表示ボックスを追加:
```html
<div>
  <strong>Remote Audio:</strong>
  <div id="remote-audio"></div>
</div>
```

---

## 3. このブランチが実現しようとしていること

このブランチは、以下の3つの課題を同時に解決しようとしている。

### 3-1. OpenAI SDK への移行（トランスポート層の近代化）

**課題**: 従来の raw WebSocket 接続は、OpenAI Realtime API のプロトコル変更（イベント名の揺れ、セッションパラメータの変化等）に対して脆弱だった。

**解決策**: `openai` npm パッケージの `OpenAIRealtimeWS` クラスを利用することで、SDK レベルでのプロトコル互換性を確保。同時に `raw_ws` モードをフォールバックとして残し、SDK に問題があった場合に即座にロールバック可能な構成にしている。

### 3-2. 決定論的発話制御（AI の自由発話を抑止）

**課題**: OpenAI Realtime API は会話コンテキストに基づいて応答を生成するため、状態機械が指定したプロンプトとは異なる内容を話してしまう（ドリフト）問題があった。

**解決策**:
- `response.create` を `conversation: "none"` + `input: []` で発行し、コンテキストキャリーオーバーを排除。
- `buildStrictRendererInstructions()` で「一字一句読み上げ」指示を付与。
- `isCloseSpokenMatch()` で期待発話と実際の音声書き起こしを比較し、不一致を検知・ログ出力。

### 3-3. ローカル開発環境の整備

**課題**: OpenAI API キーがないと開発・テストが進められない。Twilio 環境も必要。

**解決策**:
- Realtime API スタブ: セッション管理と `response.create` → 音声イベントシーケンスをローカルで再現。
- ツールスタブ: stock/price/delivery/order の固定レスポンスサーバー。
- E2E プローブ: ゲートウェイの疎通確認スクリプト。
- Runbook: 段階的なセットアップ手順。

---

## 4. 他のブランチとの関係

### main との関係

- このブランチはルートコミットから開始しており、**main の git 履歴とは直接つながっていない**。
- コード内容としては、main に存在する安定化修正（PR #7 ~ #11）の成果が含まれているが、main の最新コミット `9a315a9`（docs: align correction flow）は含まれていない。
- main との差分は 27 ファイル、+2,419 / -1,467 行。
- main に存在して本ブランチにない要素:
  - `docs/ADR/0009-pcmu-conversion-at-gateway.md`（ADR-0009）
  - `docs/ConsistencyAudit_Prompt7.md`（一貫性監査レポート）
  - `docs/ImplementationPlan.md` の「決定事項（実装SSOT）」セクション

### codex/fsm-core-integration との関係

- `fsm-core-integration` は main の `30f7f84`（#11）から分岐し、2コミットを追加:
  - `0cc5f43` refactor(ws-gateway): isolate state machine module
  - `8d912c4` docs: add FSM integration/stability handoff specs
- `openai-sdk-state-machine-control` には、`fsm-core-integration` にある**main の全履歴が含まれていない**（ルートコミットのため）。
- 逆に、`openai-sdk-state-machine-control` が持つ独自コンテンツ:
  - `realtimeTransport.ts`（SDK トランスポートアダプタ）
  - `.env.example`、`local_realtime_stub.ts`、`local_tools_stub.ts`、`twilio_e2e_probe.ts`
  - `ExecutionRunbook.md`、`OpenAIRealtimeSdkMigration.md`
  - voip-client の音声再生改善
  - proxy のパスルーティング追加
- **両ブランチの共通コンテンツ**: `FsmCoreIntegrationSpec.md`、`StateMachineStabilitySpec.md`、`realtime_dialect.md`、`stateMachine.ts` の分離構造。ただし、`fsm-core-integration` 側は main の履歴を正しく継承しており、本ブランチはスナップショット持ち込みである。

### 位置づけのまとめ

```
main ─── #7 ─── #8 ─── #9 ─── #10 ─── #11 ─── 9a315a9
                                         │
                                         ├── codex/fsm-core-integration (+2 commits)
                                         │   stateMachine.ts 分離 + docs追加
                                         │   main の履歴を正しく継承
                                         │
(独立) codex/openai-sdk-state-machine-control (ルートコミット)
        eea0f68 ── 90a4894 ── 734ee21
        SDK統合 + 決定論的発話 + ローカルスタブ + 音声再生改善
        main の成果物は含むが、git 履歴は独立
```

---

## 5. mainへのマージ可否と移植方針

### マージが困難な理由

1. **git 履歴の断絶**: ルートコミットから始まっているため、`git merge` や `git rebase` が大量のコンフリクトを生む。89ファイルが初回コミットで追加されており、main の既存ファイルとの3-way merge が事実上不可能。

2. **main の最新変更が未反映**: `9a315a9`（docs: align correction flow and ADR supersession with runtime）が含まれていない。

3. **削除されたファイルの意図が不明確**: ADR-0009 と ConsistencyAudit_Prompt7.md の削除が意図的かどうか確認が必要。

### 推奨アプローチ

**このブランチを直接 main にマージするべきではない。** 代わりに以下のアプローチを推奨:

1. **チェリーピックベースの移植**: main の最新から新ブランチを切り、このブランチの独自成果物を手動で移植する。
2. **移植対象の優先順位**:
   - **最優先**: `realtimeTransport.ts`（SDK アダプタ）、`config.ts` の2項目追加、`index.ts` の SDK 対応箇所
   - **高優先**: `local_realtime_stub.ts`、`local_tools_stub.ts`、`twilio_e2e_probe.ts`、`.env.example`
   - **中優先**: `ExecutionRunbook.md`、`OpenAIRealtimeSdkMigration.md`
   - **低優先**: voip-client / proxy の変更（音声再生改善）
3. **`fsm-core-integration` との統合**: `stateMachine.ts` の分離は `fsm-core-integration` でも実施済み。fsm-core-integration を先に main にマージし、その上に SDK 統合を移植するのが最もクリーン。

---

## 6. 次のエンジニアへの注意事項・推奨アクション

### 注意事項

1. **このブランチを直接チェックアウトして作業を続けない**こと。git 履歴が main と独立しているため、将来のマージが極めて困難になる。

2. **`conversation.ts` の扱い**: このブランチでは re-export のみ（7行）に縮小されている。main ではまだ909行の巨大ファイルのまま。`fsm-core-integration` ブランチで同様の分離が行われているので、そちらを基準にすること。

3. **OpenAI SDK バージョン**: `openai` `^6.21.0` を使用。Realtime WebSocket API はまだ experimental であり、SDK のバージョンアップで breaking change が入る可能性がある。
   > **OpenQuestion**: OpenAI Realtime WS API の experimental ステータスについて、公式ドキュメントでの安定性保証・GA 時期の確認が必要。

4. **`response.create` の `conversation: "none"`**: これは OpenAI Realtime API の非公式な使い方に近い。将来の API 変更で動作しなくなる可能性があるため、`raw_ws` フォールバックを維持すること。
   > **OpenQuestion**: `conversation: "none"` の動作保証について、OpenAI 公式ドキュメントでの記載有無・サポート状況の確認が必要。

5. **削除されたファイルの復元**: ADR-0009 と ConsistencyAudit_Prompt7.md は main に存在するので、移植時に意図しない削除が発生しないよう注意。

### 推奨アクション

1. **`codex/fsm-core-integration` を先に main へマージ**する。stateMachine.ts の分離と docs 追加が安全に取り込まれる。

2. **main から新ブランチを切り、SDK 統合を移植**する。以下のファイルを手動コピー:
   - `ws-gateway/src/realtimeTransport.ts`（新規、そのままコピー可）
   - `ws-gateway/src/config.ts`（2行追加のみ）
   - `ws-gateway/src/index.ts`（最も差分が大きい。慎重にマージ）
   - `ws-gateway/package.json`（`openai` 依存追加 + scripts 追加）
   - `ws-gateway/package-lock.json`（`openai` 依存追加に伴うロックファイル更新。再現性確保のため必須）
   - `ws-gateway/.env.example`（新規）
   - `ws-gateway/scripts/local_realtime_stub.ts`（新規）
   - `ws-gateway/scripts/local_tools_stub.ts`（新規）
   - `ws-gateway/scripts/twilio_e2e_probe.ts`（新規）
   - `docs/ExecutionRunbook.md`（新規）
   - `docs/OpenAIRealtimeSdkMigration.md`（新規）

3. **検証手順**:
   - `cd ws-gateway && npm install && npm run build` が成功すること
   - `npm run rice-test` が成功すること
   - `npm run tools-stub` → `npm run realtime-stub` → `npm run dev` → `npm run twilio-probe` の順で動作確認
   - `REALTIME_TRANSPORT=raw_ws` に切り替えて同じプローブが成功すること

4. **docs の整理**: `FsmCoreIntegrationSpec.md`、`StateMachineStabilitySpec.md`、`realtime_dialect.md` は `fsm-core-integration` にも存在するため、重複を避けて最新版を採用すること。

5. **voip-client / proxy の変更**は独立した PR として分離することを推奨。SDK 統合とは直接関係がなく、レビュー範囲を限定するため。

---

## 差分サマリ（実測値）

`git diff origin/main..origin/codex/openai-sdk-state-machine-control --numstat` による実測値:

| カテゴリ | ファイル数 | 追加行 | 削除行 |
|---|---|---|---|
| 新規ソースコード（ws-gateway/src） | 2 | +1,090 | 0 |
| 変更ソースコード（ws-gateway/src） | 3 | +274 | -1,148 |
| 新規スクリプト/設定（ws-gateway） | 4 | +429 | 0 |
| 変更パッケージ（ws-gateway） | 2 | +26 | 0 |
| 新規ドキュメント（docs/） | 4 | +432 | 0 |
| 変更ドキュメント（docs/） | 7 | +107 | -104 |
| voip-client/proxy 変更 | 3 | +61 | 0 |
| 削除ファイル | 2 | 0 | -215 |
| **合計** | **27** | **+2,419** | **-1,467** |

## 残存リスク

1. **SDK の実験的 API 依存**: `OpenAIRealtimeWS` は experimental であり、breaking change のリスクがある。（**OpenQuestion**: 公式ドキュメントでの experimental ステータスと GA 予定の確認が必要）
2. **`conversation: "none"` の持続性**: この設定が将来のモデルでも有効かどうか不明。（**OpenQuestion**: `conversation: "none"` が公式にサポートされた挙動かどうかの確認が必要）
3. **ルートコミット問題**: このブランチの内容を利用する際、git 履歴の追跡が不可能。変更の意図や経緯はコミットメッセージとドキュメントからのみ読み取る必要がある。
4. **テストカバレッジ**: SDK モードでの自動テスト（`rice_flow_test.ts` 等）は raw_ws 前提のモック構造のため、SDK モード固有のテストが不足している。
5. **main との docs 差分**: ADR-0009 削除や ImplementationPlan の変更が意図的かどうかの確認が必要。
