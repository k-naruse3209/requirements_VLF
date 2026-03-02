# codex/spec-ex-correction-consistency ブランチ 引き継ぎ文書

| 項目 | 値 |
|---|---|
| 作成日 | 2026-03-02 |
| レビュー | Codex Desktop（2026-03-02）全指摘事項反映済 |
| 比較対象 (main) | `origin/main` @ `9a315a9` |
| 比較対象 (branch) | `origin/codex/spec-ex-correction-consistency` @ `e38f859` |
| 差分算出方法 | `git diff origin/main..origin/codex/spec-ex-correction-consistency`（2点間比較） |
| ahead/behind算出 | `git rev-list --left-right --count origin/main...origin/codex/spec-ex-correction-consistency`（3点比較） |

---

## 1. ブランチの概要と現在の位置関係

**目的**: ConversationSpec の Correction（言い直し）フロー仕様を整合させ、例外処理の一貫性を確保する。併せて ws-gateway の音声安定化・barge-in 制御を改善する。

**位置関係（2026-03-02 実測値）**:
- origin/main に対して **30 commits ahead / 7 commits behind**
- behind の内訳（main 側にあってブランチに未反映の 7 コミット）:
  1. `9a315a9` docs: align correction flow and ADR supersession with runtime
  2. `30f7f84` Codex/state machine stability hardening (#11)
  3. `a999617` fix(ws-gateway): hide meta prompt and improve brand alias handling (#10)
  4. `30602fe` fix(conversation): keep follow-up prompt focused on missing slot (#9)
  5. `95d0e80` Codex/speckit effective fixes only (#8)
  6. `def07e1` ws-gateway: apply effective voice stability fixes on main base (#7)
  7. `36fd5fe` Merge pull request #4 from k-naruse3209/codex-speckit

> **注意**: PR #7〜#11 の 5 件に加え、`36fd5fe`（PR #4 マージ）と `9a315a9`（correction flow align）の計 7 件が未取り込み。特に `9a315a9` は Correction フロー関連のため、統合時に ConversationSpec.md で競合する可能性が高い。

---

## 2. main からの変更内容

### 2-1. 変更ファイル一覧（全 25 ファイル）

差分統計: **25 files changed, 2,525 insertions(+), 868 deletions(-)**

| ステータス | ファイルパス | 概要 |
|---|---|---|
| M | `AGENTS.md` | ランタイム検証ポリシー強化 |
| A | `NEXT.md` | 引き継ぎパケット（ブランチ固有） |
| A | `README.md` | 起動順・ポート・env・検証手順の SSOT |
| M | `api/README.md` | 起動・運用整備 |
| M | `api/package.json` | 起動・運用整備 |
| M | `docs/ADR/0004-telephony-and-ws-gateway.md` | テレフォニー関連 ADR の記述削除（-6 行） |
| D | `docs/ADR/0009-pcmu-conversion-at-gateway.md` | ADR 全体を削除（ADR 番号整理の一環） |
| M | `docs/ADR/README.md` | ADR インデックスの更新 |
| M | `docs/ConversationSpec.md` | Correction フローを内部補正に変更（EX_Correction 廃止） |
| M | `docs/ImplementationPlan.md` | 軽微な追記 |
| M | `docs/ImplementationTickets.md` | チケット記述の修正 |
| M | `voip-client/README.md` | 起動・運用整備 |
| M | `ws-gateway/.gitignore` | 無視パターン追加 |
| A | `ws-gateway/catalog.json` | 商品カタログデータ |
| A | `ws-gateway/inventory.json` | 在庫データ（ローカルフォールバック用） |
| M | `ws-gateway/package.json` | test / typecheck / verify / dev:conversation-log 追加 |
| A | `ws-gateway/scripts/audio_format_test.ts` | 音声フォーマット検証テスト |
| A | `ws-gateway/scripts/dev_conversation_log.mjs` | 開発用会話ログ抽出ツール |
| D | `ws-gateway/scripts/extract_last_call_conv.sh` | 旧会話抽出スクリプト削除 |
| M | `ws-gateway/scripts/rice_flow_test.ts` | 追加ケースで遷移暴走回帰を検知 |
| A | `ws-gateway/src/audio.ts` | 音声フォーマット変換ユーティリティ |
| M | `ws-gateway/src/config.ts` | correctionKeywords / VAD サイレンスウィンドウ設定追加 |
| M | `ws-gateway/src/conversation.ts` | 状態遷移ログ、Correction 内部補正、在庫確認プロンプト |
| M | `ws-gateway/src/index.ts` | Twilio playback mark 連携、barge-in 制御、overlap 抑制 |
| M | `ws-gateway/src/tools.ts` | ローカル在庫フォールバック、stock 確認プロンプト |

凡例: M=Modified, A=Added, D=Deleted

### 2-2. docs/ 配下の変更内容詳細

| ファイル | 変更概要 |
|---|---|
| `docs/ConversationSpec.md` | Correction フローを内部補正（EX_Correction 状態廃止）に変更。Mermaid 図・遷移表・本文を修正 |
| `docs/ImplementationPlan.md` | 軽微な追記（+1 行） |
| `docs/ImplementationTickets.md` | チケット記述の修正（+1/-1） |
| `docs/ADR/0004-telephony-and-ws-gateway.md` | テレフォニー関連 ADR の記述削除（-6 行） |
| `docs/ADR/0009-pcmu-conversion-at-gateway.md` | ADR 全体を削除（ADR 番号整理の一環） |
| `docs/ADR/README.md` | ADR インデックスの更新 |

**docs/ConsistencyAudit_Prompt7.md について**: main にも同一ファイルが存在し、2 点間 diff で差分なし（同一 blob）。ブランチ固有の変更ではないため取り込み不要。

#### OpenQuestion: Correction 仕様のブランチ内不整合

ブランチ内で Correction の適用範囲が記述箇所により異なっており、main 反映前に統一が必要。

| 記述箇所 | Correction の適用範囲 | 根拠 |
|---|---|---|
| Mermaid 図 | **3 状態のみ**: ST_ProductSuggestion / ST_AddressConfirm / ST_OrderConfirmation から ST_RequirementCheck への遷移のみ定義 | ConversationSpec.md L34-36（`言い直しキーワード（内部補正）`の矢印が 3 本のみ） |
| 遷移表 | **任意の状態**: 「任意の状態 / 言い直しキーワード検知 / ST_RequirementCheck / 内部補正処理（専用状態は持たない）」 | ConversationSpec.md L282 |
| 本文（Correction セクション） | 適用範囲の明示なし。「専用状態（EX_Correction）には遷移しない」+「resetAllForCorrection() によるリセット」と記述 | ConversationSpec.md L319-332 |
| 実装（conversation.ts） | **グローバル入力ハンドラ内**でキーワードチェック。状態を問わず `resetAllForCorrection()` を実行 | conversation.ts L863（`config.correctionKeywords.some(...)` → `resetAllForCorrection()`） |

> Mermaid は 3 状態限定だが、遷移表と実装は任意の状態から発火する。「3 状態への絞り込みが正しい」という断定はできない。統合時にどちらを正とするか ADR で決定すること。

### 2-3. 実装コードの変更概要

| ファイル | 変更規模 | 概要 |
|---|---|---|
| `ws-gateway/src/conversation.ts` | 大（+983 行規模の改修） | 米フロー状態遷移、Correction 内部補正（`resetAllForCorrection()` L793-824）、在庫確認プロンプト追加 |
| `ws-gateway/src/index.ts` | 大（+1,136 行規模の改修） | Twilio playback mark 連携、barge-in 制御、VAD 設定、overlap 抑制 |
| `ws-gateway/src/tools.ts` | 中（+152 行） | ローカル在庫フォールバック、stock 確認プロンプト |
| `ws-gateway/src/config.ts` | 小（+38 行） | `correctionKeywords` 設定（L48）、VAD サイレンスウィンドウ設定 |
| `ws-gateway/src/audio.ts` | 新規 | 音声フォーマット処理ユーティリティ |
| `ws-gateway/catalog.json` | 新規 | 商品カタログデータ |
| `ws-gateway/inventory.json` | 新規 | 在庫データ |
| `ws-gateway/scripts/audio_format_test.ts` | 新規 | 音声フォーマットテスト |
| `ws-gateway/scripts/dev_conversation_log.mjs` | 新規 | 開発用会話ログツール |

---

## 3. このブランチが持つ main 未反映の価値ある情報

1. **Correction 内部補正モデル**: EX_Correction 状態を廃止し、キーワード検知 → 内部リセット → ST_RequirementCheck 遷移とする設計。ただし上記の Mermaid/遷移表/実装間の不整合を解消してから反映すること（根拠: ConversationSpec.md L34-36 vs L282 vs conversation.ts L863）
2. **Twilio playback mark 連携**: `e38f859` で入力を playback 完了まで gate する仕組み
3. **barge-in 制御の改善**: overlap 抑制（`266d079`）、最小発話長チェック（`7a97c87`）
4. **server-VAD サイレンスウィンドウの設定化**: `e8b61d8` で config.ts に追加
5. **ローカル在庫フォールバック**: tools.ts に在庫確認のフォールバックパス追加（`99e3f56`）
6. **非日本語トランスクリプトの処理**: 英語等の入力を no-hear フローにルーティング（`23dac4b`）
7. **empty-transcript 復旧パス**: 空トランスクリプト時に no-hear パスで復旧（`e55ff0c`）
8. **NEXT.md（引き継ぎパケット）**: ローカル再現手順、既知の落とし穴、次スレッドチェックリストを含む

---

## 4. コミット履歴から読み取れる開発の流れ（4 フェーズ）

30 コミットを時系列で整理すると、以下の 4 フェーズに分かれる。

### Phase 1: 米フロー基盤構築（初期）
- `a9f04b1` Fix rice flow state handling and stabilize tests
- `66b310e` Improve runtime observability and stabilize rice suggestion flow
- `e97175c` Refine rice confirmation flow
- `a9868c1` Refactor conversation.ts for improved readability by 5.2 thinking
- `c7c916a` Align rice flow config, catalog, and conversation state handling
- `218099d` Fix rice state flow to keep ProductSuggestion and ignore weight-only capture
- `e9b64eb` Fix runtime rice flow transitions and transcript handling
- `9a03c5e` Replace conversation.ts with fixed voice flow version
- `16b346f` Fix onAssistantDone signature mismatch

### Phase 2: ドキュメント・仕様整合（中期）
- `22dc9d0` Apply realtime verbatim patch config and runtime options
- `e7a492c` Strengthen AGENTS runtime and verification policy
- `d2b469d` Normalize ADR index and numbering guidance
- `45a21d3` docs: align EX_Correction transitions with section behavior
- `080ce8b` docs: make correction flow internal (no EX_Correction state)
- `55cd721` docs: align startup guide and SSOT decisions
- `ec5a8ad` docs: add consistency audit and align runtime/test tooling

### Phase 3: 音声安定化・例外処理強化（後期）
- `e940d90` fix(ws-gateway): stabilize realtime audio playback and barge-in behavior
- `f719e7c` fix(ws-gateway): use conversation items for prompts and accept date-like delivery replies
- `99e3f56` Add local inventory fallback and stock confirmation prompts
- `74c0644` fix: unify barge-in cancellation and twilio clear handling
- `0813735` audit: align runtime state handling and conversation logging
- `ddd3113` docs: add handoff packet for next thread

### Phase 4: 通話品質・入力制御の最終調整（最終）
- `63c1afc` docs: align EX_NoHear termination with runtime retry semantics
- `f3d9cb6` ws-gateway: force prompt-verbatim playback for response.create
- `e55ff0c` ws-gateway: recover empty-transcript commits via no-hear path
- `266d079` ws-gateway: suppress overlap input during assistant response
- `7a97c87` ws-gateway: require minimum speech duration before barge-in cancel
- `23dac4b` ws-gateway: route non-japanese transcript to no-hear flow
- `e8b61d8` ws-gateway: make server-vad silence window configurable
- `e38f859` ws-gateway: gate input until twilio playback mark ack

---

## 5. 他のブランチとの関係

### codex/fsm-core-integration との関係

並行開発だが **共通変更ファイルあり**。統合時に docs と ws-gateway の競合確認が必要。

共通変更ファイル（8 件）:

| ファイル | 競合リスク | 備考 |
|---|---|---|
| `docs/ConversationSpec.md` | **高** | 両ブランチで状態遷移仕様を変更 |
| `docs/ImplementationPlan.md` | 中 | 両ブランチで追記 |
| `docs/ImplementationTickets.md` | 中 | 両ブランチで修正 |
| `docs/ADR/0004-telephony-and-ws-gateway.md` | 低 | 本ブランチは削除方向 |
| `docs/ADR/0009-pcmu-conversion-at-gateway.md` | 低 | 両ブランチとも削除（競合しにくい） |
| `docs/ADR/README.md` | 低 | インデックス更新 |
| `ws-gateway/src/conversation.ts` | **高** | 両ブランチで大規模改修 |
| `ws-gateway/src/index.ts` | **高** | 両ブランチで大規模改修 |

> 根拠: `git diff origin/main..origin/codex/fsm-core-integration --name-only` と `git diff origin/main..origin/codex/spec-ex-correction-consistency --name-only` の交差で特定。

### main の未取り込みコミットとの関係

特に `9a315a9`（docs: align correction flow and ADR supersession with runtime）は本ブランチの Correction フロー変更と直接関連するため、リベース/マージ時に ConversationSpec.md で競合が発生する可能性が高い。

---

## 6. main への取り込み方針

### 推奨手順

1. **Correction 仕様の統一を先に決定する**
   - Mermaid（3 状態限定）vs 遷移表・実装（任意の状態）のどちらを正とするか決定
   - 決定後、ConversationSpec.md の Mermaid / 遷移表 / 本文を一致させる
   - ADR を記録する（根拠: Mermaid L34-36 は 3 状態、遷移表 L282 は任意、実装 L863 は任意）

2. **main をリベースまたはマージして behind の 7 コミットを取り込む**
   - 特に `9a315a9` との Correction 関連競合を解消
   - PR #7〜#11 の安定化修正を取り込む

3. **fsm-core-integration との統合順序を決定する**
   - 共通 8 ファイルの競合を考慮し、どちらを先にマージするか決定
   - 推奨: fsm-core-integration を先にマージし、本ブランチをリベース

4. **docs/ConsistencyAudit_Prompt7.md は取り込み不要**
   - main と同一内容（diff なし）であるため、変更に含めない

### 取り込み対象の優先度

| 優先度 | 内容 | 根拠 |
|---|---|---|
| 高 | Correction 内部補正モデル（仕様統一後） | conversation.ts L793-824 の resetAllForCorrection() |
| 高 | Twilio playback mark 連携、barge-in 制御改善 | コミット e38f859, 266d079, 7a97c87 |
| 高 | empty-transcript / 非日本語復旧パス | コミット e55ff0c, 23dac4b |
| 中 | ローカル在庫フォールバック | コミット 99e3f56, tools.ts |
| 中 | server-VAD サイレンスウィンドウ設定 | コミット e8b61d8, config.ts |
| 低 | NEXT.md / README.md（ルートレベル） | ブランチ固有の運用ドキュメント。main に入れるか要検討 |

---

## 7. 次のエンジニアへの注意事項・推奨アクション

1. **Correction 不整合の解消が最優先**: Mermaid / 遷移表 / 実装の 3 箇所を統一しないままマージすると、仕様と実装の乖離が固定化する（OpenQuestion として扱うこと）
2. **conversation.ts の差分が巨大**（+983 行規模）: レビュー時はフェーズごとのコミットを個別に確認すること
3. **index.ts も大規模改修**（+1,136 行規模）: Twilio WebSocket 連携・音声再生制御が含まれるため、通話テスト必須
4. **ADR/0009 の削除**: PCMU 変換に関する ADR が削除されている。この決定が現在も有効か確認すること（fsm-core-integration でも同 ADR を削除しているため、両ブランチで合意済みの可能性あり）
5. **behind の 7 コミットには安定化修正が含まれる**: リベース後にテストが壊れる可能性があるため、rice_flow_test.ts を必ず実行
6. **NEXT.md の P0/P1 タスク**: STT 空文字ターンの切り分け（P0）、誤抽出抑止テスト追加（P1）が未完了。NEXT.md の Section 4 を参照

### PR チェックリスト

- [ ] Correction 仕様を Mermaid / 遷移表 / 本文 / 実装で統一した（ADR を記録した）
- [ ] main の最新（7 commits behind 分）をリベースまたはマージした
- [ ] `9a315a9`（correction flow align）との競合を解消した
- [ ] fsm-core-integration との共通ファイル（8 件）の競合方針を確認した
- [ ] ConversationSpec.md の Mermaid 図がテキスト記述と一致している
- [ ] rice_flow_test.ts が通過する
- [ ] audio_format_test.ts が通過する
- [ ] Twilio 連携の通話テストを実施した
- [ ] ADR/0009 削除の妥当性を確認した
- [ ] docs/ConsistencyAudit_Prompt7.md が main と同一であることを再確認した（差分がなければ変更に含めない）
