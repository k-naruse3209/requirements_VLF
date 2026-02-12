---
name: spec-editor
description: 音声販売AI(VLF)のMVP仕様編集。docs/配下の仕様ファイルを編集し、矛盾チェック、ADR記録、OpenQuestion管理を行う。
---

# Spec Editor Skill (requirements_VLF)

このスキルは、音声販売AI（VLF: Voice sales AI）のMVP仕様を編集・管理するための標準手順を定義します。

## 適用タイミング

以下のリクエストに自動適用されます：
- 仕様の編集・追加・更新（ConversationSpec.md、PRD.md等）
- OpenQuestionsの追加・更新
- 仕様間の矛盾チェック
- 仕様変更に伴うADRの作成

## 編集可能範囲

**許可**: `docs/` 配下のファイルのみ編集可能
**禁止**: プロダクトコード、実装ファイルの作成（明示的な指示がない限り）

## 必須手順

### 1. 編集前の矛盾チェック

編集対象ファイルを読み込み、以下を確認：
- Mermaid図の状態名と本文見出しの一致
- ツール名の一貫性（getStock, getPrice, getDeliveryDate, saveOrder）
- 数値パラメータ（タイムアウト、リトライ回数）が "MVP default" とマークされているか
- OpenQuestions へのリンク（OQ-XXX）が存在するか

### 2. 編集実施

- **小さなPR原則**: 1-2ファイルに限定した変更
- **状態名の統一**: Mermaid の `stateDiagram-v2` 内の状態名と、本文の見出し（例: `### ST_Greeting`）を完全一致させる
- **ツール契約の厳守**: 価格・在庫・配送日は必ずツール結果を使用。推測・ハードコード禁止。

### 3. 数値パラメータの扱い

新しい数値（タイムアウト、閾値、リトライ回数等）を追加する際：
1. 値の後に `（MVP default）` を明記
2. OpenQuestions.md に対応するエントリを追加（OQ-XXX 形式）
3. 該当箇所から `OQ-XXX参照` とリンク

**例**:
```markdown
リトライ回数: **3回**（MVP default）

**OpenQuestion**: OQ-001参照（リトライ3回は仮置き）
```

### 4. ADR作成（意思決定を伴う変更の場合）

以下の条件に該当する場合、`docs/ADR/` にADRを作成：
- 状態遷移の追加・削除
- ツール契約の変更
- エラーハンドリング戦略の変更
- 数値パラメータの設計根拠が必要な場合

**ADRファイル名**: `YYYY-MM-DD-<decision-title>.md`

**ADRテンプレート**:
```markdown
# ADR-XXX: <タイトル>

日付: YYYY-MM-DD
状態: Accepted / Proposed / Deprecated

## 文脈（Context）
なぜこの決定が必要か

## 決定（Decision）
何を決めたか

## 結果（Consequences）
- ポジティブな影響
- ネガティブな影響
- 関連するOpenQuestions（あれば OQ-XXX）

## 参照
- ConversationSpec.md §X
- PRD.md §Y
```

### 5. 編集後の確認

- **差分要約**: 変更内容を箇条書きで列挙
- **残存リスク**: 未解決の矛盾、確認が必要な事項を明示
- **検証チェックリスト**: PRレビュー時に確認すべき項目

**例**:
```markdown
## 変更差分
- ConversationSpec.md: EX_Silence のリトライ回数を 3→5 に変更
- OpenQuestions.md: OQ-001 を更新（リトライ5回の根拠を記載）

## 残存リスク
- リトライ5回の妥当性は実測データ待ち（OQ-001）

## 検証チェックリスト
- [ ] Mermaid図が正しくレンダリングされるか
- [ ] OQ-001 のステータスが正しいか
```

## 出力フォーマット

### 見出し
- 階層を明確に（# → ## → ###）
- 簡潔な名前（例: `## 状態一覧`）

### 箇条書き
- 短く、1行1概念
- ネストは2階層まで

### Mermaid
- `stateDiagram-v2` を使用
- 状態名は本文見出しと完全一致（例: `ST_Greeting`）

## 禁止事項

- **推測の記載禁止**: 価格・在庫・配送日をツール結果なしで記載
- **実装コードの作成禁止**: 仕様のみ。コードは明示的指示があるまで作成しない
- **大規模な一括変更禁止**: 複数ファイルにまたがる変更は分割してPR化

## エラーハンドリング

### 矛盾を発見した場合
1. 矛盾箇所をリストアップ（ファイル名 + セクション番号）
2. 提案する修正内容を明示
3. ユーザーに確認を求める

### OpenQuestionが未解決の場合
- 該当箇所に `（OQ-XXX参照）` を明記
- 仮の値を使う場合は `（MVP default）` と明記

## 参考情報

- CLAUDE.md: プロジェクト全体のルール
- AGENTS.md: エージェントの役割定義
- ConversationSpec.md: 会話状態遷移の仕様
- OpenQuestions.md: 未決事項の管理

## スキル実行例

**ユーザー**: 「EX_Silenceのリトライ回数を5回に変更して」

**実行内容**:
1. ConversationSpec.md を読み込み
2. EX_Silence セクションのリトライ回数を 3→5 に変更
3. 変更箇所に `（MVP default）` を追加
4. OpenQuestions.md の OQ-002 を更新
5. 差分要約 + 検証チェックリストを出力
