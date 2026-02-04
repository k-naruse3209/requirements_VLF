# Project Constitution

## Non-negotiables
- “Spec → Plan → Tasks → Implement” の順で進める。仕様と計画が無い実装は禁止。
- 変更は必ず spec / plan / tasks のどれかに反映してからコードに入る。
- PII（個人情報）は最小化し、ログに出さない。必要ならマスキング。
- 失敗時は「暫定対応→恒久対応→再発防止」と再現手順を記録する。

## Quality Gates
- 変更には自動テストを付ける（unit中心、必要に応じてintegration）。
- 既存テストは壊さない（CIが落ちたら最優先で修正）。
- エラー時のユーザー影響が出る箇所はログ/例外/リトライ方針を明記する。

## Review / PR Habits
- PRは小さく（1機能/目的）。仕様・計画・タスクの更新を含める。
- 変更点と影響範囲、動作確認手順をPR本文に必ず書く。
- PIIや認証情報が含まれていないことをレビューで確認する。

## Testing Policy
- 重要フローは最低1本の自動テストを持つ。
- 失敗再現テストを追加する（再発防止の一部）。
- 新規の外部I/Oはモックと実通信の両方で最低限検証する。

## Logging & PII Policy
- 収集する個人情報は最小化（電話番号・住所はマスキング）。
- トークン/APIキー/認証情報はログに出さない。
- 監視イベントは匿名化IDで追跡する。

## Performance Targets (P95)
- API応答: P95 < 300ms（管理API）
- WSゲートウェイ: 接続確立P95 < 1s
- 音声ストリーム受信: P95 < 250ms（受信側計測）

## Operations & Monitoring
- 主要エラーはアラート化（認証失敗、ツール失敗、WS切断）。
- KPI計測（通話開始/完了/中断/例外）をログに残す。
- 監視ダッシュボードでP95遅延と失敗率を確認する。

## Documentation Outputs
- Featureごとに `.specify/specs/<FEATURE>/` を作り、spec.md / plan.md / tasks.md を残す。
