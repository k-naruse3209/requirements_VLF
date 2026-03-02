# codex/fsm-core-integration ブランチ 引き継ぎ文書

作成日: 2026-03-02
レビュー済み: Codex Desktop（2026-03-02）
比較対象: origin/main@9a315a9 vs origin/codex/fsm-core-integration@8d912c4
差分算出方法: A は `git diff 30f7f84..8d912c4`（ブランチ固有）、B は `git diff origin/main..branch`（現main比較）

---

## 1. ブランチの概要と現在の位置関係

| 項目 | 値 |
|---|---|
| ブランチ名 | `codex/fsm-core-integration` |
| 分岐元コミット | `30f7f84` (Codex/state machine stability hardening (#11)) |
| ブランチ先頭 | `8d912c4` (docs: add FSM integration/stability handoff specs) |
| ブランチ固有コミット数 | 2 |
| 現在のmain先頭 | `9a315a9` (docs: align correction flow and ADR supersession with runtime) |
| mainとの関係 | **ahead 2 / behind 1** |

mainは `9a315a9` で1コミット先行している。ブランチは `30f7f84` から分岐し2コミットを積んでいるが、main上の `9a315a9`（docs系の修正・追加）を未取り込みの状態。

### ブランチ固有コミット（時系列順）

| コミット | 日付 | Author | 概要 |
|---|---|---|---|
| `0cc5f43` | 2026-02-12 | k-naruse3209 | refactor(ws-gateway): isolate state machine module |
| `8d912c4` | 2026-03-02 | k-naruse3209 | docs: add FSM integration/stability handoff specs |

### main側の未取り込みコミット

| コミット | 概要 |
|---|---|
| `9a315a9` | docs: align correction flow and ADR supersession with runtime |

このコミットは docs/ADR/0004, docs/ADR/0009（新規追加）, docs/ADR/README, docs/ConsistencyAudit_Prompt7.md（新規追加）, docs/ConversationSpec, docs/DetailedDesign, docs/ImplementationPlan, docs/ImplementationTickets, docs/realtime_dialect の9ファイルを変更している。

---

## 2. 変更内容

### A. ブランチ固有差分（30f7f84 → 8d912c4、6ファイル）

`git diff 30f7f84..origin/codex/fsm-core-integration` による実測値。

| ステータス | ファイル | +行 | -行 | 説明 |
|---|---|---|---|---|
| M | `docs/DetailedDesign.md` | +1 | -0 | stateMachine.ts / conversation.ts re-export の記載追加 |
| A | `docs/FsmCoreIntegrationSpec.md` | +169 | -0 | FSMコア統合仕様（新規） |
| A | `docs/StateMachineStabilitySpec.md` | +143 | -0 | 状態機械安定性仕様（新規） |
| M | `ws-gateway/src/conversation.ts` | +7 | -909 | FSMロジックを全削除、re-exportのみに変更 |
| M | `ws-gateway/src/index.ts` | +1 | -1 | import先を `conversation.js` → `stateMachine.js` に変更 |
| A | `ws-gateway/src/stateMachine.ts` | +909 | -0 | conversation.tsから移動したFSM本体（新規） |

**合計: +1,230行 / -910行（6ファイル）**

#### conversation.ts の変更詳細

差分ハンクは `@@ -1,909 +1,7 @@` の1つのみ。909行の全ロジックを削除し、以下の7行のre-exportに置き換えている:

```typescript
export {
  createConversationController,
  extractRiceBrand,
  extractWeightKg,
  normalizeRiceText,
  type Product,
} from "./stateMachine.js";
```

### B. 現mainとの差分（9a315a9 未取り込みを含む、14ファイル）

`git diff origin/main..origin/codex/fsm-core-integration` による実測値: **+1,336行 / -1,229行（14ファイル）**

上記A.の6ファイルに加え、以下の8ファイルが差分として表示される。

| ファイル | ステータス | 差分の原因 |
|---|---|---|
| `docs/ADR/0004-telephony-and-ws-gateway.md` | M (-6行) | main側 `9a315a9` の変更が未取り込み |
| `docs/ADR/0009-pcmu-conversion-at-gateway.md` | D (-25行) | main側 `9a315a9` で新規追加されたファイルがブランチに未反映 |
| `docs/ADR/README.md` | M (+/-35行) | main側 `9a315a9` の変更が未取り込み |
| `docs/ConsistencyAudit_Prompt7.md` | D (-190行) | main側 `9a315a9` で新規追加されたファイルがブランチに未反映 |
| `docs/ConversationSpec.md` | M (+/-59行) | main側 `9a315a9` の変更が未取り込み |
| `docs/ImplementationPlan.md` | M (-7行) | main側 `9a315a9` の変更が未取り込み |
| `docs/ImplementationTickets.md` | M (+/-16行) | main側 `9a315a9` の変更が未取り込み |
| `docs/realtime_dialect.md` | M (+62行) | main側 `9a315a9` の変更が未取り込み |

これらはブランチが削除・変更したものではなく、main側の `9a315a9` コミットがブランチに未取り込みであることによる差分。マージ前にmainを取り込むことで解消見込み。

---

## 3. このブランチが目指していること

### 目的

`conversation.ts` に一体化していた状態機械（FSM）ロジックを `stateMachine.ts` に分離し、通信層（index.ts）とFSM層の境界を明確化する。これにより FSM のみを安全に入れ替え可能な構造を作る。

### 設計方針（FsmCoreIntegrationSpec.md より）

- 通信層と状態機械層の境界を固定し、FSMのみを安全に入れ替え可能にする
- プロンプト依存ではなく、コードで遷移を強制する実行モデルを維持する
- 次スレッドで「実装順序」「受け入れ条件」「検証方法」が曖昧にならない状態を作る

### 達成済みの作業

1. **FSMモジュール分離** (`0cc5f43`): `conversation.ts` の909行をそのまま `stateMachine.ts` に移動。`conversation.ts` はre-exportのみ（7行）に縮小。`index.ts` のimportを `stateMachine.js` に切り替え
2. **仕様ドキュメント追加** (`8d912c4`): `FsmCoreIntegrationSpec.md`（FSM統合仕様）と `StateMachineStabilitySpec.md`（安定性仕様）を新規作成。`DetailedDesign.md` にstateMachine.tsの記載を追加

### FsmCoreIntegrationSpec.md が定義する実装ステップ（Step 0〜4）

| ステップ | 目的 | 状態 |
|---|---|---|
| Step 0 | FSM本体分離（stateMachine.ts化）、互換エントリ維持（conversation.ts re-export） | 完了済み |
| Step 1 | FSM I/Fの固定と退行防止。公開I/Fに型注釈コメント追加、rice_flow_test.tsにI/F契約破壊検出ケース追加 | 未着手 |
| Step 2 | FSM定義の外部化準備。状態定義JSONスキーマを docs/ に追加、状態メタ情報の外部読込可能化 | 未着手 |
| Step 3 | 導入先（Agents SDK）との橋渡し。アダプタ層で user transcript → FSM → assistant prompt の単方向制御を実装 | 未着手 |
| Step 4 | 本番運用を想定した検証。実通話ログで `[CONV]` と `state.enter` を突合、ミスマッチの再現テスト化 | 未着手 |

### 境界契約（Boundary Contract）

通信層 (`index.ts`) → FSM への入力:
- `start()`, `onUserTranscript(text, confidence)`, `onUserCommitted()`, `onSpeechStarted()`, `onSpeechStopped()`, `onAssistantStart()`, `onAssistantDone()`, `setCustomerPhone(phone)`, `setAddress(address)`

FSM → 通信層への出力:
- `onPrompt(message)`, `onInquiryUpdate(payload)`, `onLog(event, data)`

### StateMachineStabilitySpec.md が定義する安定化仕様

- 初期状態: 新規通話は必ず `ST_Greeting` から開始
- 要件収集: brand/weight 抽出は `ST_Greeting` / `ST_RequirementCheck` / `ST_RequirementConfirm` のみで有効
- 不足スロット再質問: 片方のみ取得時は不足スロットだけ再質問
- Closing条件: `closingReason` の初期値は `error`、`success/cancel` は明示条件でのみ設定
- session.update完了前ガード: `session.updated` 受信前は会話開始・メディア転送・createResponseを禁止
- verbatim wrapper: `<read_aloud>...</read_aloud>` でAI発話の一字一句読み上げを要求
- out-of-band response: `conversation: "none"` + `input: []` で過去会話文脈の混入を抑制
- mismatch検知: 期待発話と実際の `response.audio_transcript.done` を比較、不一致時はログ出力

### FsmCoreIntegrationSpec.md が指摘する矛盾点

| ID | 内容 | 根拠 |
|---|---|---|
| 矛盾A | 仕様書に `ST_RequirementConfirm` がないが実装には存在 | ConversationSpec.md vs stateMachine.ts:4, :383 |
| 矛盾B | 仕様書は `EX_Correction` を独立状態として記載するが、実装はキーワード検知で直接 `ST_RequirementCheck` に戻す | ConversationSpec.md:35, :54 vs stateMachine.ts:650 |
| 矛盾C | ConversationSpecは汎用商品（ノートPC例）中心だが、実装は米注文専用 | ConversationSpec.md:93 付近 vs stateMachine.ts全体 |

---

## 4. 他のブランチとの関係

### codex/openai-sdk-state-machine-control

- `origin/codex/openai-sdk-state-machine-control` が存在する（先頭: `734ee21`）
- **共通祖先なし（`git merge-base` 失敗確認済み）**: このブランチと fsm-core-integration / main の間に共通祖先が存在しない。ルートコミットから独立した履歴系統を持つ
- したがって、openai-sdk-state-machine-control の成果物を取り込む場合はチェリーピックまたは手動での内容移植が必要。通常の `git merge` は全く関係のない履歴を統合することになるため推奨しない

### codex/spec-ex-correction-consistency

- `origin/codex/spec-ex-correction-consistency` が存在する
- こちらはmainと共通祖先あり（`fc14f43`）。fsm-core-integration とも同じmain系統上にある
- 内容の競合可能性は個別に確認が必要

---

## 5. mainへのマージ可否の判断

### マージ可能性: 条件付きで可能

| 観点 | 判定 | 詳細 |
|---|---|---|
| コード変更の安全性 | OK | FSMロジックの移動は機械的。conversation.tsのre-exportで後方互換を維持 |
| main未取り込み差分 | 要対応 | `9a315a9` の変更（docs系8ファイル）が未取り込み。main取り込みで解消見込み |
| ADR-0009 / ConsistencyAudit の差分 | main取り込みで解消見込み | これらのファイルはブランチが削除したのではなく、main側の `9a315a9` で追加されたものがブランチに未反映なだけ。main取り込みで自然に解消する |
| コンフリクトリスク | 低〜中 | `docs/DetailedDesign.md` は両方で変更あり。コード側は `conversation.ts` / `index.ts` のみで競合可能性は低い |
| テスト | 未実施 | ブランチ上でのテスト実行記録なし。マージ前に `npm run build` と `npm run rice-test` の動作確認を推奨 |

### 推奨マージ手順

1. ブランチにmainを取り込む（`git merge main` または `git rebase main`）
2. `docs/DetailedDesign.md` のコンフリクトを解消
3. `StateMachineStabilitySpec.md` 内の `conversation.ts` 参照を `stateMachine.ts` に更新（後述§6参照）
4. `npm run build` と `npm run rice-test` を実行して動作確認
5. PRを作成してマージ

---

## 6. 次のエンジニアへの注意事項・推奨アクション

### 必須対応

1. **main取り込み**: マージ前に `9a315a9` をブランチに取り込むこと。ADR-0009, ConsistencyAudit_Prompt7.md 等はmain側で追加されたファイルであり、取り込みで自然に解消する

2. **テスト実行**: `ws-gateway/scripts/rice_flow_test.ts` でFSM分離後の動作を確認。`npm run build` と `npm run rice-test` の両方がグリーンであること

3. **StateMachineStabilitySpec.md 内の参照ズレ修正（13箇所）**: このファイルは `conversation.ts` を13箇所で参照しているが、FSM分離後の実体は `stateMachine.ts` に移動済み。全参照を `stateMachine.ts` に更新する必要がある

   該当箇所の一覧（行番号はブランチ上の StateMachineStabilitySpec.md 内の行番号）:

   | 行 | 現在の参照 | 更新先 |
   |---|---|---|
   | 10 | `ws-gateway/src/conversation.ts` | `ws-gateway/src/stateMachine.ts` |
   | 22 | `ws-gateway/src/conversation.ts:873` | `ws-gateway/src/stateMachine.ts:873` |
   | 30 | `ws-gateway/src/conversation.ts:586` | `ws-gateway/src/stateMachine.ts:586` |
   | 31 | `ws-gateway/src/conversation.ts:680` | `ws-gateway/src/stateMachine.ts:680` |
   | 32 | `ws-gateway/src/conversation.ts:711` | `ws-gateway/src/stateMachine.ts:711` |
   | 33 | `ws-gateway/src/conversation.ts:728` | `ws-gateway/src/stateMachine.ts:728` |
   | 38 | `ws-gateway/src/conversation.ts:372` | `ws-gateway/src/stateMachine.ts:372` |
   | 39 | `ws-gateway/src/conversation.ts:587` | `ws-gateway/src/stateMachine.ts:587` |
   | 40 | `ws-gateway/src/conversation.ts:710` | `ws-gateway/src/stateMachine.ts:710` |
   | 46 | `ws-gateway/src/conversation.ts:320` | `ws-gateway/src/stateMachine.ts:320` |
   | 47 | `ws-gateway/src/conversation.ts:512` | `ws-gateway/src/stateMachine.ts:512` |
   | 48 | `ws-gateway/src/conversation.ts:817` | `ws-gateway/src/stateMachine.ts:817` |
   | 49 | `ws-gateway/src/conversation.ts:858` | `ws-gateway/src/stateMachine.ts:858` |

### 注意事項

4. **conversation.ts のre-export**: 分離後の `conversation.ts` は以下のre-exportのみ（7行）。外部から `conversation.ts` を参照している箇所は動作するが、新規コードでは `stateMachine.ts` を直接参照すること

   ```typescript
   export {
     createConversationController,
     extractRiceBrand,
     extractWeightKg,
     normalizeRiceText,
     type Product,
   } from "./stateMachine.js";
   ```

5. **openai-sdk-state-machine-control ブランチ**: 共通祖先が存在しない独立した履歴系統のため、成果物の統合にはチェリーピックまたは手動での内容移植が必要。通常の `git merge` は非推奨

6. **FsmCoreIntegrationSpec.md の矛盾点への対応**: 同仕様書が指摘する3つの矛盾（ST_RequirementConfirm未定義、EX_Correction の扱い、米注文専用 vs 汎用商品）は、Step 1以降の作業で ConversationSpec.md を更新する際に解消すること

7. **行番号ベース参照の脆弱性**: StateMachineStabilitySpec.md と FsmCoreIntegrationSpec.md は行番号で実装を参照している。今後のコード変更で行番号がずれる可能性があるため、中期的には関数名・セクション名ベースの参照への置き換えを検討

---

## 差分サマリ

本引き継ぎ文書は以下のCodexレビュー指摘を全て反映済み:

| # | 指摘 | 重要度 | 対応 |
|---|---|---|---|
| 1 | mainが1コミット先行の未記載 | 高 | §1に ahead 2 / behind 1 の状態を明記 |
| 2 | 差分の比較基準が混在（14ファイル vs 6ファイル） | 重大 | §2をA（ブランチ固有: 6ファイル）/ B（現main比較: 14ファイル）に分離。算出方法を冒頭に明記 |
| 3 | ADR-0009削除/ConsistencyAudit削除の誤帰属 | 重大 | §5で「main取り込みで解消見込み」に修正。ブランチが削除したという誤った記述を排除 |
| 4 | openai-sdk-state-machine-controlとの関係の誤記 | 高 | 「同じ分岐点から派生」→「共通祖先なし（git merge-base失敗確認済み）」に修正（§4） |
| 5 | conversation.tsの行数不正確 | 中 | 実測値 -909/+7 で記載。差分ハンク `@@ -1,909 +1,7 @@` も明記（§2-A） |
| 6 | StateMachineStabilitySpec.mdの参照ズレ | 中 | §6に conversation.ts → stateMachine.ts の更新が必要な13箇所を一覧で明記 |

## 残存リスク

1. **テスト未実施**: FSM分離後のエンドツーエンドテストが未実行。本番相当の通話フローで問題がないか要確認
2. **StateMachineStabilitySpec.md の行番号参照**: 今後のコード変更で行番号がずれる可能性がある。行番号ベースの参照は脆弱であり、関数名・セクション名ベースの参照への置き換えを中期的に検討
3. **DetailedDesign.md のコンフリクト**: main取り込み時にコンフリクトが発生する可能性がある（両ブランチで同一ファイルを変更）
4. **Step 1〜4 未着手**: FsmCoreIntegrationSpec.md が定義するStep 1（I/F固定・退行防止）以降が未着手。FSM分離の効果を活かすにはStep 1の型注釈・テスト追加が最優先
