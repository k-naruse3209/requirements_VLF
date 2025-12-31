# Conversation Spec（音声販売AI：会話仕様 / 状態機械）
Version: 0.1 (MVP)
SSOT: docs/ConversationSpec.md

## 0. 目的
- 音声対話で必要情報を収集し、ユーザーに「最適な米の購入提案（容量/頻度/銘柄/配送）」を提示する
- 収集した情報をDBに保存し、次回以降の対話を短縮する

## 1. 前提・スコープ
### 1.1 チャネル
- Web（Realtime/WebRTC）または 電話（Twilio/Asterisk等）
- 音声の割り込み（barge-in）を許可する：ユーザーが話し始めたらAI発話を中断して聞き取る

### 1.2 録音/同意（必須）
- 録音/保存/分析の同意を最初に取得する
- 同意NGの場合：保存なしでその場限りの提案のみ（ログは最小）

### 1.3 MVPの提案範囲
- 容量：2kg/5kg/10kg（仮）
- 購入形態：都度 / 定期（隔週・4週）
- 価格・在庫は外部ツールから取得する（LLMが推測しない）

## 2. データ定義（Slots）
> 対話で埋める「変数」。値は基本DBに保存する。
- user_id: string（電話番号ハッシュ等）
- consent_recording: boolean
- household_size: int（家族人数）
- rice_consumption_pace: enum（例：週/隔週/月、または「5kgが何日でなくなる」）
- current_rice_type: enum（白米/玄米/無洗米/ブレンド）
- taste_pref: enum（もちもち/あっさり/硬め 等）
- budget_range: enum（〜/kg, 価格重視/品質重視）
- delivery_pref: enum（午前/午後/指定なし、置き配可否）
- storage_capacity: enum（5kgまで/10kgまで/余裕あり）
- allergies_notes: string（任意）
- language: enum（ja/en/vi 等：MVPはja）

## 3. ツール（Function Calling）契約
> LLMはここだけを呼ぶ。DB更新/推薦/在庫はツールで。
- upsert_profile(user_id, slots_patch) -> {ok, profile}
- estimate_monthly_consumption(slots) -> {kg_per_month, rationale}
- search_products(criteria) -> {products[]}
- create_recommendation(user_id, recommendation) -> {recommendation_id}
- log_interaction(event) -> {ok}

## 4. 状態機械（State Machine）
```mermaid
stateDiagram-v2
  [*] --> S0_Greet
  S0_Greet --> S1_Consent
  S1_Consent --> S2_Intake : consent=true
  S1_Consent --> S2_Intake_NoSave : consent=false
  S2_Intake --> S3_CollectHousehold
  S3_CollectHousehold --> S4_CollectPace
  S4_CollectPace --> S5_CollectPreferences
  S5_CollectPreferences --> S6_SummarizeConfirm
  S6_SummarizeConfirm --> S7_Recommend : confirmed=true
  S6_SummarizeConfirm --> S3_CollectHousehold : confirmed=false (fix slots)
  S7_Recommend --> S8_HandleObjection
  S8_HandleObjection --> S7_Recommend : retry
  S7_Recommend --> S9_Close : accept/next-step
  S2_Intake_NoSave --> S3_CollectHousehold
  S9_Close --> [*]

  %% exceptions
  S3_CollectHousehold --> EX_NLU_Fail
  S4_CollectPace --> EX_NLU_Fail
  S5_CollectPreferences --> EX_NLU_Fail
  EX_NLU_Fail --> EX_Reprompt
  EX_Reprompt --> S3_CollectHousehold
  EX_Reprompt --> S4_CollectPace
  EX_Reprompt --> S5_CollectPreferences
  EX_Silence --> EX_Reprompt
  EX_Handoff --> [*]
