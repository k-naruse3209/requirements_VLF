# Consistency Audit Report (Prompt 7)

## Scope / Method
- Spec sources: `docs/PRD.md`, `docs/ConversationSpec.md`, `docs/DetailedDesign.md`
- Implementation sources: `ws-gateway/src/*.ts`, `api/src/server.js`, `voip-client/src/server.ts`, `proxy/src/index.js`, `db/src/index.js`
- Test sources: `ws-gateway/scripts/rice_flow_test.ts`, `ws-gateway/scripts/audio_format_test.ts`, `ws-gateway/scripts/realtime_smoke_test.ts`
- Validation run: `npm run verify` in `ws-gateway` (typecheck + tests) => PASS

## Validation Result
- `ws-gateway` typecheck: PASS
- `ws-gateway` tests: PASS (`rice-test`, `audio-test`)
- Current tests are mostly unit/smoke; several spec-level transitions are not covered (see findings).

## Update (2026-02-10)
- D-1（後段状態での要件抽出暴走）を修正。
  - `ws-gateway/src/conversation.ts` で要件抽出を `ST_RequirementCheck` 系のみに限定。
  - 後段状態でブランド/重量らしき入力が来た場合は `requirement.extract_ignored` をログし、状態固有分岐を優先。
- 再発防止としてテスト追加。
  - `ws-gateway/scripts/rice_flow_test.ts` に case12 を追加し、`ST_PriceQuote` で銘柄入力しても要件抽出に戻らないことを検証。
- 検証結果: `npm run verify` PASS。

## Findings (Ticket-ready)

### A. 未実装

#### A-1. 配送日拒否時の「代替日1回提示」が未実装
- Priority: P1
- Category: 未実装
- Spec evidence:
  - `docs/ConversationSpec.md:197`
  - `docs/ConversationSpec.md:277`
- Impl evidence:
  - `ws-gateway/src/conversation.ts:1058`
  - `ws-gateway/src/conversation.ts:1084`
- Current:
  - 配送日拒否で `getDeliveryDate` 再実行はせず、`配送日の変更はできません。キャンセルしますか？` に分岐している。
- Fix proposal:
  - `ST_DeliveryCheck` の拒否時に `deliveryRetries < deliveryRetryMax` なら `getDeliveryDate` を再実行し代替日を提示。
  - 2回目拒否で `ST_Closing` に遷移。
- Impact:
  - 仕様通りの配送交渉フローになる。ユーザー体験と仕様整合が改善。

#### A-2. 在庫なし時の「要件再確認フォールバック」が未実装
- Priority: P1
- Category: 未実装
- Spec evidence:
  - `docs/ConversationSpec.md:143`
- Impl evidence:
  - `ws-gateway/src/conversation.ts:499`
  - `ws-gateway/src/conversation.ts:503`
- Current:
  - 在庫なしで代替候補が尽きると `ST_RequirementCheck` に戻らず `ST_Closing` (error) へ進む。
- Fix proposal:
  - `ST_ProductSuggestion` で候補なし時は `ST_RequirementCheck` に戻し、要件再収集プロンプトを出す。
- Impact:
  - 失注率と異常終了率を下げられる。

#### A-3. 仕様必須分岐のテストが未実装
- Priority: P2
- Category: 未実装
- Spec evidence:
  - `docs/ConversationSpec.md:473`
  - `docs/ConversationSpec.md:476`
  - `docs/ConversationSpec.md:349`
- Test evidence:
  - `ws-gateway/scripts/rice_flow_test.ts:83`
  - `ws-gateway/scripts/rice_flow_test.ts:164`
- Current:
  - `rice_flow_test` は要件抽出中心で、`ST_StockCheck`/`ST_DeliveryCheck`/`saveOrder(address必須)` 分岐を検証していない。
- Fix proposal:
  - 在庫なし/配送日拒否/saveOrder blocked の3ケースを追加。
- Impact:
  - 仕様逸脱の再発をCIで検知可能。

### B. 実装されているが仕様にない

#### B-1. Realtime verbatimモード（out-of-band + 低温度）が仕様書未記載
- Priority: P2
- Category: 実装されてるが仕様にない
- Impl evidence:
  - `ws-gateway/src/index.ts:433`
  - `ws-gateway/src/index.ts:451`
  - `ws-gateway/src/config.ts:21`
  - `ws-gateway/src/config.ts:27`
- Spec evidence (absence):
  - `docs/ConversationSpec.md`（該当設定説明なし）
  - `docs/DetailedDesign.md`（該当設定説明なし）
- Current:
  - `response.conversation = "none"`、`REALTIME_VERBATIM`、温度/トークン上限制御が実装にのみ存在。
- Fix proposal:
  - DetailedDesignに「運用モード設定（verbatim-ish）」節を追加し、既定値/トレードオフを明文化。
- Impact:
  - 運用時の発話差異の説明コストを削減。

#### B-2. 注文確定前の電話番号再取得分岐が仕様書未記載
- Priority: P2
- Category: 実装されてるが仕様にない
- Impl evidence:
  - `ws-gateway/src/conversation.ts:639`
  - `ws-gateway/src/conversation.ts:1096`
- Spec evidence (absence):
  - `docs/ConversationSpec.md`（ST_OrderConfirmation節に再取得分岐の記載なし）
- Current:
  - `customerPhone` 欠落時は注文確定前に電話番号を聞き直す実装がある。
- Fix proposal:
  - ConversationSpecの ST_OrderConfirmation に「customerPhone未取得時の補完分岐」を追記。
- Impact:
  - 実装意図を仕様で追えるようになる。

### C. 用語不一致

#### C-1. CallLog status の語彙が仕様と実装で不一致
- Priority: P1
- Category: 用語不一致
- Spec evidence:
  - `docs/PRD.md:39`
  - `docs/DetailedDesign.md:56`
- Impl evidence:
  - `ws-gateway/src/index.ts:1059`
  - `ws-gateway/src/index.ts:1150`
  - `ws-gateway/src/index.ts:1173`
- Current:
  - 仕様は `up/down`、実装は `in-progress/completed/ended` を利用。
- Fix proposal:
  - どちらかに統一（推奨: 実装語彙へ仕様を寄せる）。
  - APIフィルタ/画面表示の enum を明記。
- Impact:
  - フィルタ不整合や運用時の誤解を防止。

#### C-2. WSゲートウェイ責務の表現が現実装と不一致
- Priority: P2
- Category: 用語不一致
- Spec evidence:
  - `docs/DetailedDesign.md:211`
- Impl evidence:
  - `ws-gateway/src/index.ts:691`
  - `ws-gateway/src/index.ts:722`
  - `ws-gateway/src/index.ts:1051`
- Current:
  - 設計書は「音声中継のみ」と記載だが、実装は会話制御とAPI経由ログ保存まで担っている。
- Fix proposal:
  - DetailedDesignの責務定義を「中継 + 会話オーケストレーション + API経由イベント永続化」に更新。
- Impact:
  - 新規メンバーの誤認を防ぎ、責務境界が明確になる。

### D. 状態遷移の抜け / 逸脱

#### D-1. 米要件抽出が全状態で実行され、後段状態から要件状態へ逸脱し得る
- Priority: P0
- Category: 状態遷移の抜け
- Status: Resolved on `codex/spec-ex-correction-consistency` (2026-02-10)
- Spec evidence:
  - `docs/ConversationSpec.md:265`
  - `docs/ConversationSpec.md:274`
  - `docs/ConversationSpec.md:276`
- Impl evidence:
  - `ws-gateway/src/conversation.ts:894`
  - `ws-gateway/src/conversation.ts:902`
  - `ws-gateway/src/conversation.ts:1076`
- Current:
  - `brand/weight` 抽出が state 非依存で走るため、`ST_AddressConfirm` や `ST_DeliveryCheck` でも要件収集系プロンプトに逸脱可能。
- Fix proposal:
  - 要件抽出処理を `ST_RequirementCheck`（必要なら `ST_ProductSuggestion`）に限定。
  - それ以外の状態では yes/no/住所等の状態固有処理を優先。
- Impact:
  - 「会話が勝手に戻る・進む」不具合の根本抑止。

#### D-2. ST_Greeting の遷移条件が仕様文言と実装でズレる
- Priority: P2
- Category: 状態遷移の抜け
- Spec evidence:
  - `docs/ConversationSpec.md:73`
  - `docs/ConversationSpec.md:267`
- Impl evidence:
  - `ws-gateway/src/conversation.ts:1190`
- Current:
  - 実装は `onAssistantDone` で `ST_RequirementCheck` へ遷移（ユーザー応答検知を待たない）。
- Fix proposal:
  - 仕様文言を「初回案内の発話完了後に ST_RequirementCheck へ遷移」に修正、または実装をユーザー音声検知条件へ変更。
- Impact:
  - 期待挙動の解釈差を解消。

## Recommended Fix Order
1. P0: D-1（状態逸脱の抑止）
2. P1: A-1（配送日拒否時の代替日）、A-2（在庫なし時の要件再確認）、C-1（status語彙統一）
3. P2: A-3/B-1/B-2/C-2/D-2（仕様・テスト補完）

## Notes for Ticketization
- 各項目は「Spec line」「Impl line」を併記済みのため、そのままチケット起票可能。
- 先に P0/P1 を修正し、その後に仕様追従（P2）を実施すると手戻りが少ない。
