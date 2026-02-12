# FSM Core Integration Spec（新スレッド実装仕様）
Version: 0.1
Target Branch: `codex/fsm-core-integration`
SSOT: `docs/FsmCoreIntegrationSpec.md`

## 1. 目的
本仕様は、`/Users/narusekeisuke/projects/requirements_VLF_codex_realtime_verbatim` で安定稼働している Twilio <-> Realtime API 通信層を維持したまま、状態機械（FSM）を他プログラムでも再利用できる形に拡張するための実装基準を定義する。

この仕様の主目的は次の3点。
- 通信層と状態機械層の境界を固定し、FSMのみを安全に入れ替え可能にする。
- プロンプト依存ではなく、コードで遷移を強制する実行モデルを維持する。
- 次スレッドで「実装順序」「受け入れ条件」「検証方法」が曖昧にならない状態を作る。

## 2. 現在のベースライン（根拠）
以下は本ブランチ時点の実装根拠。

- FSM本体は `ws-gateway/src/stateMachine.ts`。
  - `createConversationController`: `ws-gateway/src/stateMachine.ts:293`
  - 初期状態 `ST_Greeting`: `ws-gateway/src/stateMachine.ts:873`
  - 公開I/F（onUserTranscript等）: `ws-gateway/src/stateMachine.ts:874-907` 相当
- 通信層は `ws-gateway/src/index.ts` で維持。
  - FSM生成と接続: `ws-gateway/src/index.ts:547`
  - `session.updated` 後に開始: `ws-gateway/src/index.ts:704`, `ws-gateway/src/index.ts:708`
  - `response.create` は out-of-band (`conversation: "none"`, `input: []`): `ws-gateway/src/index.ts:432`, `ws-gateway/src/index.ts:447`
- 設計書の現行記載。
  - WSゲートウェイ構成: `docs/DetailedDesign.md:22`
  - FSM本体/互換エントリの記載: `docs/DetailedDesign.md:26`

## 3. 導入先プログラムとの差分前提（openai-realtime-agents-main）
導入先は Agents SDK ベースのデモ構成であり、FSMの実行保証は主にプロンプト上の指示に依存している。

- サンプルの性質: `openai-realtime-agents-main/README.md:1`, `openai-realtime-agents-main/README.md:117`
- customerServiceRetail は `RealtimeAgent` + プロンプト内 `Conversation States`: `.../authentication.ts:3`, `.../authentication.ts:67`
- guardrails は主に出力分類（遷移制御ではない）: `.../guardrails.ts:8`, `.../guardrails.ts:80`
- metaprompt は「状態機械を書かせるためのテンプレート」であり、実行時の強制ロジックではない: `.../voiceAgentMetaprompt.txt:78`

したがって、本件では「導入先の書式」は参考にするが、FSMの真実源はコード実装（`stateMachine.ts`）として維持する。

## 4. スコープ
### 4.1 In Scope
- `ws-gateway/src/stateMachine.ts` を中心としたFSM層の拡張。
- FSMと通信層の境界I/F固定。
- FSM定義の外部化（段階導入）または導入準備。
- テスト強化（`ws-gateway/scripts/rice_flow_test.ts`）。
- ドキュメント更新（`docs/`）。

### 4.2 Out of Scope
- Twilio Media Streams の配線変更。
- Realtime API セッション接続ロジック変更。
- コーデック処理の再設計。
- 管理API/DB スキーマ変更。

## 5. 非機能要件（固定）
- 既存の通話安定化ロジックは維持。
- 既存ログ形式（`[CONV] AI/USER`, `state.enter` 等）は後方互換維持。
- `npm run build` と `npm run rice-test` は常時グリーン。
- 挙動変更は「説明可能な条件分岐」で実装し、プロンプト任せにしない。

## 6. FSMコアの設計方針
### 6.1 境界契約（Boundary Contract）
通信層 (`index.ts`) は次のイベントのみFSMへ渡す。
- `start()`
- `onUserTranscript(text, confidence)`
- `onUserCommitted()`
- `onSpeechStarted()`
- `onSpeechStopped()`
- `onAssistantStart()`
- `onAssistantDone()`
- `setCustomerPhone(phone)`
- `setAddress(address)`

FSMは次の出力に限定。
- `onPrompt(message)`
- `onInquiryUpdate(payload)`
- `onLog(event, data)`

### 6.2 遷移保証ルール
- 新規通話は必ず `ST_Greeting` 開始。
- ユーザー未発話時に brand/weight を確定しない。
- brand/weight の片方のみ取得時は不足スロットのみ質問。
- `ST_Closing` は `success|cancel|error` の明示条件でのみ遷移。

### 6.3 導入先連携方針
- 導入先（Agents SDK）には「FSM結果（話す文・次状態）」を受け取るアダプタを作る。
- 導入先の agent instructions は補助的役割に限定する。
- 高リスク処理（注文確定、終了判定）は必ずFSM側で確定し、LLMに委譲しない。

## 7. 新スレッドでの実装ステップ
### Step 0（完了済み）
- FSM本体分離: `stateMachine.ts` 化。
- 互換エントリ維持: `conversation.ts` re-export。

### Step 1（最優先）
目的: FSM I/F の固定と退行防止。
- `stateMachine.ts` の公開I/Fに型注釈コメントを追加（契約明文化）。
- `rice_flow_test.ts` に「I/F契約を破る変更」を検出するケース追加。

### Step 2
目的: FSM定義の外部化準備。
- 状態定義JSONスキーマ（暫定）を `docs/` に追加。
- 実行エンジンは現行ロジックを維持しつつ、状態メタ情報だけ外部読込可能にする。

### Step 3
目的: 導入先（Agents SDK）との橋渡し。
- アダプタ層で `user transcript -> FSM -> assistant prompt` の単方向制御を実装。
- guardrails は出力監視として併用するが、遷移条件には使わない。

### Step 4
目的: 本番運用を想定した検証。
- 実通話ログで `[CONV]` と `state.enter` を突合。
- ミスマッチ時の再現条件をテスト化。

## 8. 受け入れ基準（Acceptance Criteria）
次をすべて満たしたら完了。

1. 初回発話前にAIが銘柄/重量確定文を話さない。
2. 片スロット取得時に不足スロットのみ再質問する。
3. 「はい/いいえ」のみで終了状態に誤遷移しない。
4. `assistant.transcript.mismatch` が発生しても次ターンでFSM復帰する。
5. `npm run build` 成功。
6. `npm run rice-test` 成功。
7. 通話ログ抽出で `[CONV] AI/USER` が時系列で追える。

## 9. 矛盾点・不足項目・具体的編集提案（file + section anchor）
### 9.1 矛盾点
- 矛盾A: 仕様書に `ST_RequirementConfirm` がないが、実装には存在する。
  - 根拠: `docs/ConversationSpec.md`（状態一覧に未定義）, `ws-gateway/src/stateMachine.ts:4`, `ws-gateway/src/stateMachine.ts:383`
- 矛盾B: 仕様書は `EX_Correction` を独立状態として記載するが、実装はキーワード検知で直接 `ST_RequirementCheck` に戻している。
  - 根拠: `docs/ConversationSpec.md:35`, `docs/ConversationSpec.md:54`, `ws-gateway/src/stateMachine.ts:650`
- 矛盾C: ConversationSpecは汎用商品（ノートPC例）中心だが、実装は米注文専用。
  - 根拠: `docs/ConversationSpec.md:93` 付近の例示文脈、`ws-gateway/src/stateMachine.ts` 内の rice brand/weight 抽出

### 9.2 不足項目
- 不足A: FSM境界I/F（通信層から何を渡し、何を返すか）の明文化が不足。
- 不足B: 導入先（Agents SDK）での責務分担（FSM確定事項 vs LLM自由生成）の定義不足。
- 不足C: ログ一致性（promptと実音声の差異）を品質ゲート化する基準不足。

### 9.3 具体的編集提案
- 提案1: `docs/ConversationSpec.md` の「状態一覧」に `ST_RequirementConfirm` 節を追加。
- 提案2: `docs/ConversationSpec.md` の「例外」節で、`EX_Correction` を「状態」ではなく「キーワードトリガー遷移」として明確化。
- 提案3: `docs/DetailedDesign.md` の「WSゲートウェイ」節にFSM境界I/Fを追記。
- 提案4: `docs/ConversationSpec.md` を「汎用版」と「米注文ランタイム版」に分割、または profile 別章を追加。

## 10. 検証計画
### 10.1 自動検証
- `cd /Users/narusekeisuke/projects/requirements_VLF_codex_realtime_verbatim/ws-gateway`
- `npm run build`
- `npm run rice-test`

### 10.2 手動検証
- 実通話1本で `state.enter` と `[CONV]` の整合確認。
- 直前通話抽出コマンドでAI/USERターンを可視化。
- 先走り発話と停止ループの再発有無を確認。

## 11. PRレビュー用チェックリスト（短縮版）
- 変更が通信層ではなくFSM層中心になっている。
- `stateMachine.ts` の遷移条件が説明可能で、暗黙推論がない。
- 既存必須検証（build/rice-test）がグリーン。
- docs更新が実装差分と1対1で対応している。
- ログ抽出で `[CONV]` と `state.enter` の追跡が可能。

## 12. リスクとロールバック
- リスク: プロンプト由来の想定外発話が再度混入する。
  - 対策: verbatim音声化 + mismatch検知 + queued prompt破棄継続。
- リスク: 外部化FSMの初期導入で分岐漏れ。
  - 対策: 既存 `stateMachine.ts` を canonical として段階移行。

ロールバック方針:
- 外部化導入が不安定なら、`stateMachine.ts` の現行ハードコード遷移へ即時戻し（通信層は不変）。
