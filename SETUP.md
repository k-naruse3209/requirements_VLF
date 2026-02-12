# Claude Code セットアップガイド（requirements_VLF）

このドキュメントでは、音声販売AI（VLF）プロジェクト用のClaude Code環境のセットアップと使い方を説明します。

## 📦 インストール済みコンポーネント

### 1. Agent Skills（自動適用される作業レシピ）

| スキル名 | 役割 | 自動適用条件 |
|---------|------|------------|
| **spec-editor** | 仕様編集 | 仕様ファイルの編集・更新依頼 |
| **adr-writer** | ADR作成 | 設計判断の記録依頼 |

### 2. Subagents（特定タスク専用エージェント）

| エージェント名 | 役割 | 起動方法 |
|--------------|------|---------|
| **spec-validator** | 仕様整合性検証 | 手動（「仕様を検証して」） |

## 🚀 クイックスタート

### ステップ1: スキルの確認

Claude Codeを起動し、以下を実行：

```
利用可能なスキルを教えて
```

**期待される出力**:
```
- spec-editor: 音声販売AI(VLF)のMVP仕様編集
- adr-writer: アーキテクチャ決定記録(ADR)の作成
```

### ステップ2: 仕様を編集してみる

```
「ConversationSpecでEX_Silenceの無音閾値を3秒に変更して」
```

**何が起こるか**:
1. spec-editor スキルが自動適用される
2. ConversationSpec.md が編集される
3. 変更箇所に「（MVP default）」が追加される
4. OpenQuestions.md が更新される（該当する場合）
5. 変更差分と検証チェックリストが出力される

### ステップ3: 設計判断を記録する

```
「この変更の理由をADRに記録して」
```

**何が起こるか**:
1. adr-writer スキルが自動適用される
2. docs/ADR/YYYY-MM-DD-<title>.md が作成される
3. ADR番号が自動採番される（ADR-001, ADR-002...）
4. OpenQuestionsの該当項目がクローズされる（該当する場合）

### ステップ4: 仕様の整合性を確認する

```
「仕様を検証して」
```

**何が起こるか**:
1. spec-validator エージェントが起動する
2. docs/ 配下の全ファイルを検証
3. 矛盾・欠落・曖昧性をレポート
4. 修正提案（diff形式）を出力

## 📋 プロジェクト固有のルール

このプロジェクトでは、以下のルールがClaude Codeに適用されています：

### 編集範囲の制限
- ✅ **許可**: `docs/` 配下のファイルのみ
- ❌ **禁止**: プロダクトコードの作成（明示的な指示がない限り）

### 必須事項
1. **ツール結果の使用**:
   - 価格・在庫・配送日は**必ずツール結果を使用**
   - 推測・ハードコード禁止

2. **数値パラメータの管理**:
   - すべての数値に「（MVP default）」を明記
   - OpenQuestionsに対応するOQ-XXXを追加

3. **設計判断の記録**:
   - アーキテクチャに影響する変更はADRに記録
   - ADRテンプレートに従う

### 出力形式
- 明確な見出し、短い箇条書き
- Mermaidの状態名と本文見出しを一致
- 変更差分と残存リスクを必ず明示

## 🎯 ユースケース別の使い方

### ケース1: 新しい状態を追加する

**依頼**:
```
「ConversationSpecにST_PaymentCheckという状態を追加して、
ST_DeliveryCheckの後、ST_OrderConfirmationの前に配置」
```

**実行される処理**:
1. spec-editor が自動適用
2. Mermaid図に状態を追加
3. 本文に `### ST_PaymentCheck` セクションを追加
4. 遷移表を更新
5. ADRの作成を推奨（状態追加は重要な設計判断のため）

**その後の推奨アクション**:
```
「この状態追加の理由をADRに記録して」
```

### ケース2: 数値パラメータを変更する

**依頼**:
```
「EX_Silenceのリトライ回数を3回から5回に変更」
```

**実行される処理**:
1. spec-editor が自動適用
2. ConversationSpec.md の該当箇所を編集
3. 「（MVP default）」を追加
4. OpenQuestions.md のOQ-002を更新
5. 変更理由の確認（ADR作成を推奨）

### ケース3: ツール契約を変更する

**依頼**:
```
「getStockのOutputにlastUpdatedフィールドを追加」
```

**実行される処理**:
1. spec-editor が自動適用
2. ConversationSpec.md §4 ツール契約を編集
3. **必ずADRを作成**（ツール契約の変更は必須）
4. 影響範囲を特定（ST_StockCheck等）

### ケース4: OpenQuestionを解決する

**依頼**:
```
「OQ-001のEX_Silence無音閾値を5秒で確定し、ADRに記録」
```

**実行される処理**:
1. adr-writer が自動適用
2. docs/ADR/YYYY-MM-DD-confirm-silence-threshold.md を作成
3. OpenQuestions.md のOQ-001を `Resolved (ADR-XXX参照)` に更新
4. ConversationSpec.md の該当箇所から「（MVP default）」を削除（確定値のため）

### ケース5: 仕様の矛盾を発見・修正する

**依頼**:
```
「仕様を検証して」
```

**実行される処理**:
1. spec-validator エージェントが起動
2. 検証結果レポートを出力
3. CRITICAL問題を発見した場合、修正提案を提示

**出力例**:
```markdown
## 問題詳細

### [CRITICAL] 状態名の不一致
**ファイル**: ConversationSpec.md
**箇所**: §2 ST_Greeting
**内容**: Mermaid図では `ST_Greeting` だが、本文見出しは `### Greeting`
**修正提案**: `### ST_Greeting` に統一
```

**その後の修正**:
```
「提案された修正を実施して」
```

## 🔍 検証とメンテナンス

### スキルが正しく動作しているか確認

1. **スキルの一覧表示**:
   ```
   「利用可能なスキルを教えて」
   ```

2. **スキルの詳細確認**:
   ```bash
   cat .claude/skills/spec-editor/SKILL.md
   ```

3. **テスト実行**:
   ```
   「ConversationSpecのEX_Silenceセクションを読んで要約して」
   ```
   → spec-editor が自動適用されるか確認

### 定期的な仕様検証

週次または大きな変更の後に実行：
```
「仕様を検証して」
```

### ADRの整理

ADRが増えてきたら、一覧を確認：
```bash
ls -lt docs/ADR/
```

または：
```
「ADRの一覧を教えて」
```

## 📂 ディレクトリ構造

```
requirements_VLF_claude/
├── .claude/                    # Claude Code設定
│   ├── README.md               # 設定の詳細説明
│   ├── skills/                 # Agent Skills
│   │   ├── spec-editor/
│   │   │   └── SKILL.md
│   │   └── adr-writer/
│   │       └── SKILL.md
│   └── agents/                 # Subagents
│       └── spec-validator/
│           └── agent.md
├── docs/                       # 仕様（SSOT）
│   ├── PRD.md
│   ├── ConversationSpec.md
│   ├── OpenQuestions.md
│   └── ADR/                    # アーキテクチャ決定記録
│       └── README.md
├── CLAUDE.md                   # プロジェクト全体のルール
├── AGENTS.md                   # エージェントの役割定義
└── SETUP.md                    # このファイル
```

## 🛠️ トラブルシューティング

### 問題1: スキルが適用されない

**症状**: 仕様編集を依頼してもspec-editorが発火しない

**確認事項**:
1. `.claude/skills/spec-editor/SKILL.md` が存在するか
2. ファイルのYAMLメタデータが正しいか
3. description が依頼内容と合っているか

**解決策**:
```
「spec-editorスキルを使って、ConversationSpecを編集して」
```
（明示的にスキル名を指定）

### 問題2: ADRの番号が重複する

**症状**: ADR-003が2つ存在する

**確認事項**:
```bash
ls docs/ADR/ | grep "^ADR-" | sort -V
```

**解決策**:
1. 既存のADRを確認
2. 重複したADRを手動でリネーム
3. 次回からはadr-writerに任せる（自動採番）

### 問題3: 仕様検証で大量のエラー

**症状**: spec-validatorが100件以上の問題を報告

**確認事項**:
1. CRITICAL問題のみフィルタ
2. 優先度を付けて段階的に修正

**解決策**:
```
「CRITICALな問題から優先的に修正して」
```

## 📖 参考資料

### プロジェクト内
- `.claude/README.md`: 設定の詳細
- `CLAUDE.md`: プロジェクト方針
- `AGENTS.md`: エージェント定義
- `docs/ADR/README.md`: ADRの書き方

### Claude Code公式
- [Agent Skills Documentation](https://docs.claude.ai/docs/agent-skills)
- [Subagents vs Skills](https://docs.claude.ai/docs/subagents-vs-skills)
- [MCP Integration](https://docs.claude.ai/docs/mcp)

## 🎓 学習リソース

### 初心者向け
1. まず「利用可能なスキルを教えて」で確認
2. 簡単な仕様変更を依頼（例: 数値の変更）
3. 変更差分を確認し、OpenQuestionsの更新を確認

### 中級者向け
1. 新しい状態を追加してみる
2. ADRを作成してみる
3. 仕様検証を実行し、矛盾を修正

### 上級者向け
1. 新しいスキルを追加（例: pr-reviewer）
2. Subagentをカスタマイズ
3. MCPサーバーと連携

---

**最終更新**: 2025-01-07
**バージョン**: 1.0.0
**作成者**: Claude Code (Sonnet 4.5)

## 💡 次のステップ

1. ✅ スキルの動作確認（「利用可能なスキルを教えて」）
2. ✅ 簡単な仕様変更を試す
3. ✅ ADRを1つ作成してみる
4. ✅ 仕様検証を実行

**質問があれば**:
```
「Claude Codeの使い方について質問」
```
