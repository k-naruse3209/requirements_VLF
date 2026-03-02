# mainブランチ 引き継ぎ文書

作成日: 2026-03-02
レビュー済み: Codex Desktop（2026-03-02）

---

## 1. このリポジトリの目的とルール

### 1-1. リポジトリの目的

このリポジトリ `requirements_VLF` は、**VLF（Voice sales AI）-- 音声販売AI** のMVP仕様をSSOT（Single Source of Truth）として管理するためのリポジトリである。

仕様SSOTは `docs/` 配下に集約しているが、検証用の最小実装（`voip-client/`, `proxy/`, `ws-gateway/`, `api/`, `db/`）も同梱している。プロダクトコードを含まない仕様のみのリポジトリではない点に注意すること。

プロダクトの目的そのものは、**電話による購買を完結させる音声AI + 運用管理のための管理画面**を一体として提供することである（PRD.md参照）。

### 1-2. 編集ルール

本リポジトリには2つの編集ルールが存在する。

**CLAUDE.md（原則ルール）:**
- `docs/` 配下のみを編集対象とする（CLAUDE.md line 8: "Only edit files under docs/ unless I explicitly allow otherwise"）
- プロダクトコードの実装は明示的に要求されない限り行わない

**AGENTS.md（拡張ルール）:**
- `docs/`, `.specify/`, `voip-client/`, `proxy/`, `ws-gateway/`, `api/`, `db/` も編集許可（AGENTS.md line 7）
- 仕様と検証コードの両方を対象にした矛盾の検出・修正を行うことを目的とする

両者が矛盾する場合、作業の文脈に応じて判断する。仕様策定作業であればCLAUDE.md原則に従い、Codex等による仕様-実装整合チェックであればAGENTS.mdの拡張ルールに従う。

### 1-3. 共通ルール

- 全ての設計判断は `docs/ADR/` にADRとして記録する
- 価格・在庫・配送日は必ずツール（function call）経由で取得する。推測は禁止
- 数値パラメータ（タイムアウト、リトライ回数等）は「MVP default」としてマークし、未確認であればOpenQuestionを起票する

---

## 2. docs/ ファイル構成と各ファイルの役割

### docs/ 直下のファイル一覧

| ファイル | 役割 | 備考 |
|---|---|---|
| `PRD.md` | プロダクト要件定義書。対象ユーザー、MVP機能スコープ、管理画面の画面仕様、KPI、前提条件を定義 | SSOT |
| `ConversationSpec.md` | 会話仕様書/状態機械。全状態（ST_Greeting〜ST_Closing）、例外状態（EX_Silence、EX_NoHear）、Correction処理、遷移条件、ツール契約の入出力仕様を定義。Mermaid状態遷移図を含む | SSOT。閾値・パラメータの正はこのファイル |
| `DetailedDesign.md` | 詳細設計書。コンポーネント構成、データモデル、認証設計、管理API設計、画面設計、永続化フロー、バージイン制御、起動エントリ等を定義 | SSOT |
| `DBSchema.sql` | SQLiteスキーマ定義（DDL）。calls, contacts, utterances, rice_inquiries, transcripts, notes, call_schedules, tags, call_tags, operators, auth_sessions の各テーブル。IDはULID、時刻はUTC ISO-8601文字列 | -- |
| `ImplementationPlan.md` | 実装計画。Phase 0（準備）〜Phase 4（運用・監視）の進行順序、依存関係、マイルストーン（M1〜M3） | -- |
| `ImplementationTickets.md` | 実装チケット分解。音声AI（チケット1〜8）、管理API（チケット9〜14）、管理画面（チケット15〜19）、運用・監視（チケット20〜22）の22チケットを受け入れ条件付きで定義 | -- |
| `OpenQuestions.md` | 未決事項一覧。OQ-001〜OQ-013の13件。各件に質問・影響範囲・担当・状態（Open/Closed）・補足説明を記載 | **現行の閾値・ステータスの正（SSOT）はこのファイルとConversationSpec.md** |
| `OpenQuestions_ANALYSIS.md` | OpenQuestionsの優先順位分析（履歴分析）。A〜Dの4カテゴリに分類し、フェーズ別の推奨解決順序を提示 | **注意: 「12件」「5秒/0.6」など旧値を含む。現行値はOpenQuestions.mdとConversationSpec.mdを正とすること** |
| `realtime_dialect.md` | OpenAI Realtime APIの「方言」検証レポート。Combo A（audioスキーマ、betaヘッダなし）とCombo B（flatスキーマ、betaヘッダあり）の2パターンの設定詳細とスモークテスト手順 | -- |
| `turn-taking-checklist.md` | ターンテイキング検証チェックリスト。「1ユーザーターン → 1アシスタント応答」の挙動確認用 | -- |
| `ConsistencyAudit_Prompt7.md` | 仕様と実装の整合性監査レポート。未実装（A-1〜A-3）、実装のみ（B-1〜B-2）、用語不一致（C-1〜C-2）、状態遷移逸脱（D-1〜D-2）を優先度付きで列挙 | 乖離の全件一覧 |
| `PROGRESS_REPORT_2025-01-07.md` | 2025-01-07の仕様管理作業進捗レポート | 履歴参照用 |
| `Handoff_main.md` | mainブランチの引き継ぎ文書（本ファイル） | -- |
| `Handoff_openai-sdk-state-machine-control.md` | codex/openai-sdk-state-machine-controlブランチの引き継ぎ文書 | ブランチ固有 |
| `Handoff_fsm-core-integration.md` | codex/fsm-core-integrationブランチの引き継ぎ文書 | ブランチ固有 |
| `Handoff_spec-ex-correction-consistency.md` | codex/spec-ex-correction-consistencyブランチの引き継ぎ文書 | ブランチ固有 |

### docs/ADR/ のファイル一覧

**正式シリーズ（0001〜0009）:**

| ADR番号 | タイトル | 状態 | 概要 |
|---|---|---|---|
| ADR-0001 | 管理画面（linguaflow-admin）をMVP仕様に含める | Accepted | 管理画面の機能範囲をMVPスコープに含め、/api/v1を利用する |
| ADR-0002 | 管理画面のフィルタと表示順の定義 | Accepted | Call Logs/Contacts/Call Schedulesのフィルタ条件と並び順を定義 |
| ADR-0003 | 配送先住所の解決順序 | Accepted | Contact.address優先、未取得時は通話中に聞き取り |
| ADR-0004 | テレフォニーとWSゲートウェイの選定 | Accepted（一部ADR-0009で上書き） | Twilio Media Streams + Node.js/TypeScript WSゲートウェイを採用 |
| ADR-0005 | SQLite for MVP storage | Accepted | MVPの永続化DBはSQLite。IDはULID、時刻はUTC ISO-8601 |
| ADR-0006 | SQLite driver for MVP | Accepted | better-sqlite3を採用（同期APIで実装をシンプルに） |
| ADR-0007 | API framework for MVP | Accepted | 管理APIはNode.js + Express |
| ADR-0008 | Admin API auth scheme (JWT + refresh cookie) | Accepted | JWT（15分）+ refresh cookie（30日）、refresh_tokenはDBにハッシュ保存 |
| ADR-0009 | WSゲートウェイでのPCMU変換をMVP要件とする | Accepted | REALTIME_AUDIO_MODE（pcmu/pcm16）でフォーマット切替。pcm16時はゲートウェイ内変換 |

**旧形式ADR（履歴参照）:**

| 旧ADR | タイトル | 状態 | 備考 |
|---|---|---|---|
| ADR-001 | DB保存タイミングをST_OrderConfirmationの「はい」受信時のみにする | Accepted | -- |
| ADR-002 | EX_Silenceの無音閾値を初期値5秒にする | Proposed | **ConversationSpecでは7秒に更新済み。ConversationSpec側がSSoT** |
| ADR-003 | saveOrderのリトライ回数を1回にする | Accepted | -- |
| ADR-004 | EX_Correctionのキーワードリストを5パターンにする | Accepted | -- |

---

## 3. 現在確定している仕様の核心

### 3-1. 会話フロー（状態遷移）

音声販売AIは、以下の状態機械で会話を進行する。

**正常フロー（9状態）:**

```
[*] --> ST_Greeting --> ST_RequirementCheck --> ST_ProductSuggestion --> ST_StockCheck --> ST_PriceQuote --> ST_AddressConfirm --> ST_DeliveryCheck --> ST_OrderConfirmation --> ST_Closing --> [*]
```

**各状態の要約:**

| 状態 | 目的 | 確認方法 | 主要な分岐 |
|---|---|---|---|
| ST_Greeting | 挨拶と通話開始 | 暗黙（応答音声検知） | 応答あり → RequirementCheck |
| ST_RequirementCheck | ユーザーの要件（商品カテゴリ）確認 | 明示（復唱確認） | カテゴリ確定 → ProductSuggestion |
| ST_ProductSuggestion | 具体的な商品を提案 | 明示（この商品でよいか） | 選択確定 → StockCheck |
| ST_StockCheck | 在庫確認（getStockツール） | 暗黙（ツール結果） | 在庫あり → PriceQuote / 在庫なし → ProductSuggestion（代替品。候補なし時はRequirementCheckへフォールバック） |
| ST_PriceQuote | 価格提示（getPriceツール） | 明示（価格承認を確認） | 承認 → AddressConfirm / 拒否 → ProductSuggestion |
| ST_AddressConfirm | 配送先住所の確認 | 明示（住所確認） | 確定 → DeliveryCheck |
| ST_DeliveryCheck | 配送日確認（getDeliveryDateツール） | 明示（配送日承認を確認） | 承認 → OrderConfirmation / 拒否 → 代替日1回提示（getDeliveryDate再実行）、再拒否でClosing |
| ST_OrderConfirmation | 最終確認と注文確定 | 明示（はい/いいえ） | 「はい」→ DB保存(saveOrder) → Closing / 「いいえ」→ Closing(キャンセル) |
| ST_Closing | 通話終了の挨拶 | 暗黙（一方的に終了） | 3パターン（成功/キャンセル/エラー） |

**例外処理（2状態 + 内部処理1件）:**

| 例外 | トリガー | 動作 | パラメータ |
|---|---|---|---|
| EX_Silence | 7秒無音で発火（MVP default） | プロンプトで促す。リトライ2回。無音継続時はST_Closing（計14秒+プロンプト時間）。 | 閾値7秒、リトライ2回 |
| EX_NoHear | STT信頼度 < 0.55（MVP default） | 再発話を依頼。リトライ2回。3回目失敗（初回+リトライ2回）で通話終了 | 閾値0.55、リトライ2回（noHearRetriesMax=2） |
| Correction（内部処理） | キーワード検知（5パターン:「やっぱり」「違う」「他の」「間違えた」「キャンセル」） | 専用状態（EX_Correction）には遷移しない。内部でコンテキストをリセット（resetAllForCorrection相当）しST_RequirementCheckに戻す | ADR-004で確定 |

EX_Silenceの詳細動作:
1. ユーザーからの音声入力が7秒間途絶えた場合に発火
2. 「もしもし、お聞きになっていますか？」とプロンプト
3. リトライ2回。各リトライ間隔は7秒
4. 2回連続で無音の場合（計14秒 + プロンプト時間）、ST_Closingへ遷移し通話終了
5. リトライ中に音声検知した場合は元の状態に復帰

Correctionのリセット対象:
- 商品・注文情報: product, price, currency, deliveryDate, customerPhone, orderId
- 住所系: address, addressConfirmed, awaitingAddressConfirm
- 要件系: category, awaitingCategoryConfirm, suggestedProductIds
- 米要件系: riceBrand, riceWeightKg, riceMilling, riceNote
- フラグ系: awaitingBrandConfirm, awaitingWeightChoice, awaitingMillingChoice, brandConfirmed, awaitingDeliveryCancelConfirm
- リトライ系: deliveryRetries, orderRetries

**ツール契約（4つ）:**

| ツール | 呼び出し状態 | Input | タイムアウト | 失敗時 |
|---|---|---|---|---|
| getStock | ST_StockCheck | `{ productId }` | 4秒（MVP default） | ST_Closing（エラー終了） |
| getPrice | ST_PriceQuote | `{ productId }` | 4秒（MVP default） | ST_Closing（エラー終了） |
| getDeliveryDate | ST_DeliveryCheck | `{ productId, address }` | 6秒（MVP default） | ST_Closing（エラー終了） |
| saveOrder | ST_OrderConfirmation（「はい」受信後） | `{ productId, price, deliveryDate, address, customerPhone, timestamp }` | -- | リトライ1回（1秒固定間隔）、2回連続失敗でST_Closing + エラーログ |

全ツールの入出力はJSON形式で定義済み（ConversationSpec.md参照）。価格・在庫・配送日は必ずツール結果を使用し、推測・ハードコードは禁止。

**saveOrderの必須フィールド:**

| フィールド | 取得元 | 補足 |
|---|---|---|
| productId | ST_ProductSuggestion | 商品確定済みのID |
| price | getPrice | ツール結果のみ使用 |
| deliveryDate | getDeliveryDate | ツール結果のみ使用 |
| address | ST_AddressConfirm | 明示確認済みの住所。addressConfirmed=true が前提条件 |
| customerPhone | 通話メタデータ（取得不可時は口頭確認） | 電話番号は復唱確認 |
| timestamp | システム時刻 | 自動付与 |

**DB保存タイミング**: ST_OrderConfirmationで「はい」を受信した時点のみ。それ以前は揮発性メモリ上のみで保持（ADR-001で決定）。

**言い直しキーワード（Correction）の遷移元:**
ST_Greeting / ST_ProductSuggestion / ST_StockCheck / ST_PriceQuote / ST_AddressConfirm / ST_DeliveryCheck / ST_OrderConfirmation の各状態からST_RequirementCheckへ遷移。

### 3-2. システムアーキテクチャ

**コンポーネント構成:**

1. **音声販売AI（オーケストレータ）**: ConversationSpecの状態機械を実装。STT入力 → 意図判定 → TTS応答 + ツール呼び出し + ログ記録

2. **テレフォニー**: Twilio Media Streams。音声フォーマットは mu-law 8kHz / G.711 PCMU

3. **WSゲートウェイ**: Node.js（TypeScript）。OpenAI Realtime APIと双方向WebSocket接続。REALTIME_AUDIO_MODE によりpcmu/pcm16を選択可能。pcm16選択時はゲートウェイ内でPCMU<->PCM16の変換を実行（ADR-0009）。外部プロセス（ffmpeg等）は使わずインメモリ処理

4. **管理API（/api/v1）**: Node.js + Express（ADR-0007）。SQLite + better-sqlite3（ADR-0005, ADR-0006）で永続化。JWT認証: Access token 15分 / Refresh cookie 30日（ADR-0008）

5. **管理画面（linguaflow-admin）**: 認証付きUI
   - Home: 進行中通話監視（status=up、5秒ポーリング）
   - Call Logs: 一覧・詳細・フィルタ（status APIフィルタ + テーブル内全文検索）、created_at降順。会話詳細はcreated_at昇順
   - Contacts: CRUD（phone_numberは数字のみ）
   - Call Schedules: CRUD（contact_ids複数選択、status/start_at指定）

**データモデル（SQLite、11テーブル）:**
- calls, contacts, utterances, rice_inquiries, transcripts, notes, call_schedules, tags, call_tags, operators, auth_sessions
- IDはULID（TEXT）、時刻はUTC ISO-8601文字列
- 詳細DDLは `docs/DBSchema.sql` を参照

**配送先住所の解決順序（ADR-0003）:**
1. CallLog.phone_numberに紐づくContact.addressを参照
2. Contact.addressが空の場合は通話中に住所を聞き取り、確認後に使用
3. ST_OrderConfirmationでsaveOrder実行前に `addressConfirmed=true` を必須検証する

**バージイン（割り込み）制御:**
- トリガー: `input_audio_buffer.speech_started`
- 停止: Twilio `clear` + `response.cancel` + ローカル送信キュー破棄
- `response.cancel` は冪等ガード付き
- CallSid単位でイベントログ記録

**責務分離（設計書上の定義）:**
- WSゲートウェイ: 音声中継のみ（DB書き込みなし）
- オーケストレータ/API: DB書き込みの唯一の責務
- 管理画面: 読み取り中心（notes/tagsのみ作成可能）

※ ただし現実装ではWSゲートウェイが会話制御とAPI経由ログ保存も担っており、設計書の責務定義と乖離がある（C-2として記録済み）。

**起動エントリ（SSOT）:**
- `api`: `src/server.js`
- `voip-client`: `src/server.ts`
- `proxy`: `src/index.js`
- `ws-gateway`: `src/index.ts`

### 3-3. 主要なアーキテクチャ決定（ADR一覧）

1. **DB保存タイミング（ADR-001）**: ST_OrderConfirmationで「はい」受信時のみ。それ以前は揮発性メモリのみ
2. **saveOrderリトライ1回（ADR-003）**: 1秒固定間隔で1回のみリトライ。2回連続失敗でST_Closing + エラーログ
3. **Correction 5キーワード（ADR-004）**: 専用状態なし、内部リセットでST_RequirementCheckに戻す
4. **配送先住所の解決順序（ADR-0003）**: Contact.address優先、未取得時は通話中に聞き取り
5. **Twilio + WSゲートウェイ（ADR-0004, ADR-0009）**: PCMU変換はゲートウェイの責務。外部プロセス不使用
6. **SQLite + better-sqlite3（ADR-0005, ADR-0006）**: 単一ノード運用前提。同期APIでシンプルな実装
7. **Express + JWT認証（ADR-0007, ADR-0008）**: Access token 15分 + Refresh cookie 30日。refresh_tokenはDBにハッシュ保存
8. **管理画面をMVP仕様に含める（ADR-0001）**: Home/Call Logs/Contacts/Call Schedulesの4画面
9. **管理画面のフィルタと表示順（ADR-0002）**: 各画面のフィルタ条件と並び順を明文化

---

## 4. 未解決事項

### 4-1. OpenQuestion（未解決3件）

OQ-001〜OQ-009およびOQ-013はClosed（確定済み）。以下の3件がOpenのまま残っている。

| ID | 内容 | 影響範囲 | 優先度 |
|---|---|---|---|
| OQ-010 | MVP対象の商品カテゴリが未定（PRDで「数十SKU程度」とのみ記載） | PRD, 会話フロー | HIGH |
| OQ-011 | 顧客認証は電話番号のみで十分か（なりすまし・誤配送リスク） | PRD, セキュリティ | HIGH |
| OQ-012 | AIからオペレーターへのエスカレーション基準が不明確（転送条件の定義） | ConversationSpec | MEDIUM |

**注意: OpenQuestions_ANALYSIS.mdは履歴分析であり、「12件」「5秒/0.6」など旧値を含む。現行のステータス・閾値はOpenQuestions.mdとConversationSpec.mdを正とすること。**

### 4-2. 仕様と実装の主要乖離（抜粋）-- ConsistencyAudit_Prompt7.md参照

以下は主要な乖離の抜粋である。**全件は `docs/ConsistencyAudit_Prompt7.md` を参照**（A-1〜A-3, B-1〜B-2, C-1〜C-2, D-1〜D-2の全8件）。

| ID | 優先度 | カテゴリ | 内容 |
|---|---|---|---|
| A-1 | P1 | 未実装 | 配送日拒否時の「代替日1回提示」が未実装。仕様ではgetDeliveryDate再実行で代替日を提示、再拒否でST_Closing。実装は即キャンセル確認に分岐 |
| A-2 | P1 | 未実装 | 在庫なし時、代替候補が尽きた場合のST_RequirementCheckフォールバックが未実装。実装はST_Closing（error）へ直行 |
| A-3 | P2 | 未実装 | 仕様必須分岐（ST_StockCheck/ST_DeliveryCheck/saveOrder address必須）のテストが未実装 |
| B-1 | P2 | 実装のみ | Realtime verbatimモード（out-of-band + 低温度）が実装にのみ存在し仕様書未記載 |
| B-2 | P2 | 実装のみ | 注文確定前のcustomerPhone再取得分岐が実装にのみ存在し仕様書未記載 |
| C-1 | P1 | 用語不一致 | CallLog status語彙が不一致（仕様: `up/down` / 実装: `in-progress/completed/ended`） |
| D-1 | -- | Resolved | 米要件抽出が全状態で実行され後段状態から逸脱する問題 → 修正済み（要件抽出をST_RequirementCheck系に限定） |
| D-2 | P2 | 遷移逸脱 | ST_Greetingの遷移条件が仕様文言と実装でズレ（仕様: 応答音声検知 / 実装: onAssistantDoneで即遷移） |

**saveOrderのaddress必須に関する既知乖離:**
仕様ではsaveOrderに `address` フィールドが必須である（ConversationSpec.md saveOrder Input定義、DetailedDesign.md line 32で `addressConfirmed=true` が前提条件）。しかしmainブランチの実装（`ws-gateway/src/conversation.ts`, `ws-gateway/src/tools.ts`）ではsaveOrder payloadにaddressを含めていない。これは修正対象の既知乖離である。

**推奨修正順序（ConsistencyAudit_Prompt7.md記載）:**
1. P0: D-1（Resolved済み）
2. P1: A-1（配送日拒否時の代替日）、A-2（在庫なし時の要件再確認）、C-1（status語彙統一）
3. P2: A-3 / B-1 / B-2 / C-2 / D-2（仕様・テスト補完）

---

## 5. 直近の変更履歴

### 5-1. 直近コミット（mainブランチ）

| コミット | 内容 |
|---|---|
| `9a315a9` | docs: align correction flow and ADR supersession with runtime |
| `30f7f84` | Codex/state machine stability hardening (#11) |
| `a999617` | fix(ws-gateway): hide meta prompt and improve brand alias handling (#10) |
| `30602fe` | fix(conversation): keep follow-up prompt focused on missing slot (#9) |
| `95d0e80` | Codex/speckit effective fixes only (#8) |
| `def07e1` | ws-gateway: apply effective voice stability fixes on main base (#7) |
| `36fd5fe` | Merge pull request #4 from k-naruse3209/codex-speckit |
| `fc14f43` | Normalize brand text by stripping noise |
| `7e1776f` | Add fuzzy brand confirm flow |
| `7dac820` | Add kanji variant for Koshihikari |

### 5-2. 重要な経緯

- PR #7〜#11でWSゲートウェイの音声安定性修正と状態機械の堅牢化が進行
- ブランド名エイリアス処理やメタプロンプト非表示は実装側で追加されたが、仕様（docs/）への反映は未完了（B-1, B-2としてConsistencyAuditに記録済み）
- D-1（後段状態での要件抽出暴走）は修正済み。要件抽出をST_RequirementCheck系のみに限定し、テスト（rice_flow_test case12）も追加
- 最新コミット `9a315a9` でCorrection処理フローとADR上書き関係の整合を修正

---

## 6. 次のエンジニアへの注意事項

1. **まず読むファイルの順序**: CLAUDE.md → AGENTS.md → PRD.md → ConversationSpec.md → DetailedDesign.md → ConsistencyAudit_Prompt7.md → OpenQuestions.md

2. **ADR-002の無音閾値に注意**: 旧ADRは「5秒」と提案しているが、ConversationSpec（SSOT）は「7秒」に更新済み。現在のMVP defaultは7秒

3. **Correctionは専用状態を持たない**: EX_CorrectionはMermaid図に存在しない。キーワード検知時の内部処理としてコンテキストをリセットしST_RequirementCheckに戻す

4. **saveOrderはaddress必須（仕様上の要件）**: addressConfirmed=trueなしでは実行しない。ただしmain実装（conversation.ts, tools.ts）では未反映であり、修正対象の既知乖離である

5. **新規ADRは0010番から**: 4桁連番形式（`0010-*.md`）。旧形式（`2025-...`）は履歴参照用として保持

6. **OpenQuestions_ANALYSIS.mdは履歴分析**: 旧値（「12件」「5秒/0.6」等）を含むため、現行の閾値・ステータスはOpenQuestions.mdとConversationSpec.mdを正とすること

7. **乖離の全件一覧**: `docs/ConsistencyAudit_Prompt7.md` にA-1〜A-3, B-1〜B-2, C-1〜C-2, D-1〜D-2の全8件が記載されている。修正着手時は推奨修正順序（P0 → P1 → P2）に従うこと

8. **編集権限の二重ルール**: CLAUDE.md原則ではdocs/のみ編集可。AGENTS.mdではコード配下（voip-client/, proxy/, ws-gateway/, api/, db/）も編集許可。作業文脈に応じて使い分けること

9. **WSゲートウェイの責務乖離**: 設計書は「音声中継のみ」と記載だが、実装は会話制御とAPI経由ログ保存まで担っている（C-2）。新機能追加時は責務境界を意識すること

10. **EX_Silence動作の全体像**: 7秒無音で発火、リトライ2回。無音継続時はST_Closing（計14秒+プロンプト時間）。リトライ中に音声検知した場合は元の状態に復帰
