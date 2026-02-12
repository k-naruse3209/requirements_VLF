# Claude Code Setup for requirements_VLF

このディレクトリには、音声販売AI（VLF）プロジェクト専用のClaude Code設定（スキルとエージェント）が含まれています。

## 📁 ディレクトリ構成

```
.claude/
├── README.md              # このファイル
├── skills/                # Agent Skills（自動適用される作業レシピ）
│   ├── spec-editor/       # 仕様編集スキル
│   │   └── SKILL.md
│   └── adr-writer/        # ADR作成スキル
│       └── SKILL.md
└── agents/                # Subagents（特定タスク専用エージェント）
    └── spec-validator/    # 仕様検証エージェント
        └── agent.md
```

## 🎯 スキル一覧

### 1. spec-editor

**自動適用条件**:
- 仕様ファイル（ConversationSpec.md、PRD.md等）の編集
- OpenQuestionsの追加・更新
- 仕様間の矛盾チェック

**機能**:
- docs/ 配下のファイルのみ編集（プロダクトコード保護）
- 数値パラメータに「MVP default」を自動追加
- OpenQuestionsとの連携
- 変更差分と検証チェックリストを出力

**使用例**:
```
「EX_Silenceのリトライ回数を5回に変更して」
→ spec-editor が自動適用され、ConversationSpec.md を編集
```

### 2. adr-writer

**自動適用条件**:
- ADRの作成依頼
- 設計判断の記録が必要な仕様変更
- アーキテクチャに影響する意思決定

**機能**:
- ADRテンプレートに基づき自動作成
- ADR番号の自動採番
- OpenQuestionsとの連携（解決したOQをクローズ）
- 複数選択肢の比較検討を促す

**使用例**:
```
「saveOrderのリトライロジックをADRに記録して」
→ adr-writer が自動適用され、docs/ADR/YYYY-MM-DD-<title>.md を作成
```

## 🤖 エージェント一覧

### spec-validator

**役割**: 仕様の整合性を検証し、矛盾・欠落・曖昧性を発見

**検証項目**:
- 状態遷移図（Mermaid）と本文の一致
- ツール名の統一（getStock, getPrice, getDeliveryDate, saveOrder）
- 数値パラメータの「MVP default」マークとOpenQuestions参照
- 命名規則の統一（ST_*, EX_*）

**使用方法**:
このエージェントは手動で呼び出します（自動適用ではありません）

```
「仕様を検証して」
→ spec-validator エージェントを手動で起動
```

**出力**:
- 検証結果レポート
- 問題箇所リスト（ファイル名+セクション番号）
- 修正提案（diff形式）

## 🚀 使い方

### 基本的な流れ

1. **仕様を編集する**
   ```
   「ConversationSpecでEX_Silenceのタイムアウトを変更して」
   ```
   → spec-editor スキルが自動適用され、編集 + OpenQuestions更新

2. **設計判断を記録する**
   ```
   「この変更の理由をADRに記録して」
   ```
   → adr-writer スキルが自動適用され、ADRを作成

3. **仕様の整合性を確認する**
   ```
   「仕様を検証して」
   ```
   → spec-validator エージェントを起動し、矛盾チェック

### スキルの確認方法

利用可能なスキルを確認：
```
「利用可能なスキルを教えて」
```

特定のスキルの詳細を確認：
```bash
cat .claude/skills/spec-editor/SKILL.md
```

## 📋 プロジェクト固有のルール

このプロジェクトでは、以下のルールが適用されます（CLAUDE.md、AGENTS.md参照）：

### 編集範囲
- **許可**: docs/ 配下のみ
- **禁止**: プロダクトコードの作成（明示的な指示がない限り）

### 必須事項
- 価格・在庫・配送日は**必ずツール結果を使用**（推測禁止）
- 数値パラメータには「MVP default」を明記
- 設計判断はADRに記録

### 出力形式
- 明確な見出し、短い箇条書き
- Mermaidの状態名と本文見出しを一致
- 変更差分と残存リスクを明示

## 🔗 関連ファイル

- **プロジェクト方針**: `../CLAUDE.md`
- **エージェント定義**: `../AGENTS.md`
- **仕様ファイル**: `../docs/ConversationSpec.md`, `../docs/PRD.md`
- **未決事項**: `../docs/OpenQuestions.md`
- **ADR**: `../docs/ADR/`

## 📖 参考情報

### Claude Code Agent Skills とは
- **公式ドキュメント**: https://docs.claude.ai/docs/agent-skills
- **役割**: 特定のやり方をClaudeに教えるMarkdown
- **発火条件**: description と依頼内容のマッチング
- **スコープ**: このプロジェクト内のみ（`.claude/skills/` に配置）

### SKILL.md の構造
```yaml
---
name: skill-name
description: いつ適用するかの説明（重要！）
---

# Skill Name
手順、フォーマット、注意点など
```

### Subagents との違い
- **Skills**: 今の会話に知識/標準/手順を追加
- **Subagents**: 別コンテキストで動く専門エージェント
- **MCP**: 外部ツール自体を提供

## 🛠️ トラブルシューティング

### スキルが適用されない
1. `.claude/skills/` の配置を確認
2. SKILL.md の description が依頼内容と合っているか確認
3. 明示的にスキル名を指定して実行

### エージェントが見つからない
- `.claude/agents/` の配置を確認
- agent.md が存在するか確認

### 仕様編集が失敗する
- docs/ 配下のファイルか確認
- ファイルが存在するか確認
- 読み取り権限があるか確認

## 📝 メンテナンス

### スキルの追加
1. `.claude/skills/<skill-name>/` ディレクトリを作成
2. `SKILL.md` を作成（YAMLメタデータ + Markdown手順）
3. このREADMEを更新

### エージェントの追加
1. `.claude/agents/<agent-name>/` ディレクトリを作成
2. `agent.md` を作成
3. このREADMEを更新

---

**最終更新**: 2025-01-07
**作成者**: Claude Code (Sonnet 4.5)
