# Open Questions

## 形式
- [ ] 未決（人間判断が必要）
- [x] 解決済（根拠を1行）

## 未決一覧
- [ ] OQ-001: EX_Silenceの無音閾値は5秒で適切か（MVP default: 5秒）
- [ ] OQ-002: EX_Silenceのリトライ回数は3回で適切か（MVP default: 3回）
- [ ] OQ-003: ツールタイムアウト値は適切か（getStock/getPrice: 3秒、getDeliveryDate: 5秒）
- [ ] OQ-004: STT信頼度閾値は0.6で適切か（0.6未満で失敗判定）
- [ ] OQ-005: EX_NoHearのリトライ回数は2回で適切か（MVP default: 2回）
- [ ] OQ-006: saveOrderのリトライ回数は1回で適切か（失敗時の再試行回数）
- [ ] OQ-007: EX_Correctionのキーワードリストは十分か（現行:「やっぱり」「違う」「他の」）
- [ ] OQ-008: ST_DeliveryCheckの拒否時にST_Closingで良いか（代替配送日の要否）
- [ ] OQ-009: 在庫なし時の代替品提案は自動か手動か（推薦アルゴリズムの有無）
