# Open Questions（未決事項）

| ID | 質問 | 影響範囲 | 担当 | 期限 | 状態 |
|---|---|---|---|---|---|
| OQ-001 | EX_Silenceの無音閾値は5秒で適切か？（現在MVP default: 5秒） | ConversationSpec §3 EX_Silence | 要確認 | MVP前 | Open |
| OQ-002 | EX_Silenceのリトライ回数は3回で適切か？（現在MVP default: 3回） | ConversationSpec §3 EX_Silence | 要確認 | MVP前 | Open |
| OQ-003 | ツールタイムアウト値は適切か？（getStock/getPrice: 3秒、getDeliveryDate: 5秒） | ConversationSpec §4 ツール契約 | 要確認 | MVP前 | Open |
| OQ-004 | STT信頼度閾値は0.6で適切か？（現在MVP default: 0.6未満で失敗判定） | ConversationSpec §3 EX_NoHear | 要確認 | MVP前 | Open |
| OQ-005 | EX_NoHearのリトライ回数は2回で適切か？（現在MVP default: 2回） | ConversationSpec §3 EX_NoHear | 要確認 | MVP前 | Open |
| OQ-006 | saveOrderのリトライ回数は1回で適切か？（失敗時の再試行回数） | ConversationSpec §4 saveOrder | 要確認 | MVP前 | Open |
| OQ-007 | EX_Correctionのキーワードリストは十分か？（現在:「やっぱり」「違う」「他の」） | ConversationSpec §3 EX_Correction | 要確認 | MVP前 | Open |
| OQ-008 | ST_DeliveryCheckでユーザー拒否時、ST_Closingで良いか？（代替配送日提案の要否） | ConversationSpec §1 ST_DeliveryCheck | 要確認 | MVP前 | Open |
| OQ-009 | ST_StockCheckで在庫なし時、代替品提案は自動か手動か？（推薦アルゴリズムの有無） | ConversationSpec §1 ST_StockCheck | 要確認 | MVP前 | Open |

---

## 補足説明

### OQ-001, OQ-002（EX_Silence関連）
**背景**: 無音閾値5秒、リトライ3回（計15秒+プロンプト時間）で通話終了する仕様。
**懸念**: 電話環境によっては5秒が短すぎる/長すぎる可能性。
**確認事項**: ユーザーテストで実測値を取得し、最適値を決定する。

### OQ-003（ツールタイムアウト）
**背景**: 外部API呼び出しのタイムアウトをgetStock/getPrice: 3秒、getDeliveryDate: 5秒に仮設定。
**懸念**: API応答時間の実測値がない状態での仮置き。
**確認事項**: API提供元のSLA確認、負荷テストでの実測値取得。

### OQ-004, OQ-005（EX_NoHear関連）
**背景**: STT信頼度0.6未満で失敗判定、2回リトライ。
**懸念**: STTエンジンの性能により適切な閾値が異なる。
**確認事項**: 使用するSTTエンジン（例: Google Speech-to-Text, AWS Transcribe）の精度評価。

### OQ-006（saveOrderリトライ）
**背景**: DB保存失敗時に1回だけリトライ。
**懸念**: トランザクション特性により適切なリトライ戦略が異なる。
**確認事項**: DBの特性（ACID保証、ネットワーク遅延）に応じた設計。

### OQ-007（言い直しキーワード）
**背景**: 「やっぱり」「違う」「他の」の3つのみ。
**懸念**: カバレッジ不足の可能性（例：「間違えた」「キャンセル」等）。
**確認事項**: 実会話ログから頻出パターンを抽出。

### OQ-008（配送日拒否時の動作）
**背景**: 現在は即座にST_Closingで注文キャンセル。
**懸念**: 代替配送日を提案する機会を失う。
**確認事項**: ビジネス要件（代替日提案の価値 vs 実装コスト）。

### OQ-009（在庫なし時の代替品提案）
**背景**: 現在は「ST_ProductSuggestionに戻る」とだけ記載。
**懸念**: 推薦アルゴリズムの有無が不明（類似商品を自動提案 or オペレーター判断）。
**確認事項**: MVP範囲での推薦機能の要否。
