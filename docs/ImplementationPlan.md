# Implementation Plan（実装計画）
Version: 0.1 (MVP)
SSOT: docs/ImplementationPlan.md

## 参照
- docs/ImplementationTickets.md
- docs/PRD.md
- docs/DetailedDesign.md

## 進行順序（依存関係）
### Phase 0: 準備
- 既存API/管理画面の動作確認
- 環境変数と認証トークンの取り回し確認

### Phase 1: 管理API基盤
- チケット 9（認証API）
- チケット 10/11/12/13（データ系API）
依存: 管理画面の疎通確認に必要

### Phase 2: 管理画面
- チケット 14（認証フロー）
- チケット 15〜18（Home/Call Logs/Contacts/Call Schedules）
依存: Phase 1完了

### Phase 3: 音声販売AI
- チケット 1〜8（状態機械/例外/ツール連携/住所解決/注文保存/テレフォニー/WS/音声）
依存: ツールのエンドポイントが利用可能であること

### Phase 4: 運用・監視
- チケット 19/20（ログ/KPI）
依存: 主要フローの実装完了

## マイルストーン
- M1: 管理APIと管理画面の基本操作が可能
- M2: 音声販売AIがConversationSpec通りに動作
- M3: 監視とKPI計測が最低限可能

## 受け入れ観点
- 各チケットの受け入れ条件を満たすこと
- 管理画面の画面仕様がPRDに一致すること
- ConversationSpecの状態遷移が実装に一致すること
