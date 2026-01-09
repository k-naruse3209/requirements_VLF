# Architecture Decision Records (ADR)

このディレクトリには、音声販売AI（VLF）プロジェクトにおけるアーキテクチャ決定記録（ADR）を保存します。

## ADRとは

ADR（Architecture Decision Record）は、プロジェクトにおける重要な設計判断を記録するドキュメントです。

**目的**:
- なぜその設計を選んだのか、背景を残す
- 将来のメンバーが判断の根拠を理解できる
- 設計変更時に過去の判断を参照できる

## ADR一覧

| ADR番号 | タイトル | 状態 | 日付 |
|---------|---------|------|------|
| ADR-001 | [DB保存タイミングをST_OrderConfirmationの「はい」受信時のみにする](./2025-01-07-db-save-timing-at-order-confirmation.md) | Accepted | 2025-01-07 |
| ADR-002 | [EX_Silenceの無音閾値を初期値5秒にする](./2025-01-07-silence-threshold-initial-value-5-seconds.md) | Proposed | 2025-01-07 |
| ADR-003 | [saveOrderのリトライ回数を1回にする](./2025-01-07-saveorder-retry-count-one-time.md) | Accepted | 2025-01-07 |
| ADR-004 | [EX_Correctionのキーワードリストを5パターンにする](./2025-01-07-correction-keyword-list-five-patterns.md) | Accepted | 2025-01-07 |

**ADRが必要になるケース**:
- 状態遷移図への状態追加・削除
- ツール契約の変更
- エラーハンドリング戦略の変更
- 数値パラメータ（タイムアウト、リトライ回数）の設計根拠

## ADR作成方法

1. **スキルを使う（推奨）**:
   ```
   「saveOrderのリトライロジックをADRに記録して」
   ```
   → `adr-writer` スキルが自動で適用され、テンプレートに基づきADRを作成

2. **手動で作成**:
   - テンプレート: `.claude/skills/adr-writer/SKILL.md` を参照
   - ファイル名: `YYYY-MM-DD-<decision-title>.md`
   - ADR番号: 既存ADRの次の連番（ADR-001, ADR-002...）

## ADRの状態

各ADRは以下のいずれかの状態を持ちます：

- **Proposed**: 提案中（レビュー待ち）
- **Accepted**: 承認済み（実装可能）
- **Deprecated**: 非推奨（新しいADRで置き換え推奨）
- **Superseded**: 上書き済み（ADR-YYYで置き換え）

## 関連ドキュメント

- **スキル定義**: `.claude/skills/adr-writer/SKILL.md`
- **仕様ファイル**: `../ConversationSpec.md`, `../PRD.md`
- **未決事項**: `../OpenQuestions.md`

## 検索方法

特定のトピックに関するADRを探す場合：

```bash
# ファイル名で検索
ls docs/ADR/ | grep "retry"

# 内容で検索
grep -r "saveOrder" docs/ADR/
```
