import assert from "node:assert/strict";
import { createConversationController, extractRiceBrand, extractWeightKg } from "../src/conversation.js";

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

const makeController = () => {
  const prompts: string[] = [];
  const controller = createConversationController({
    catalog: [
      { id: "rice-1", name: "コシヒカリ", category: "コシヒカリ" },
      { id: "rice-2", name: "あきたこまち", category: "あきたこまち" },
    ],
    toolClient: {
      async getStock() {
        return { available: true, quantity: 99 };
      },
      async getPrice() {
        return { price: 2000, currency: "JPY" };
      },
      async getDeliveryDate() {
        return { deliveryDate: "2026-02-05" };
      },
      async saveOrder() {
        return { orderId: "ORDER-1" };
      },
    },
    config: {
      silenceTimeoutMs: 999999,
      silenceRetriesMax: 1,
      noHearRetriesMax: 1,
      silenceAutoPromptEnabled: false,
      noHearAutoPromptEnabled: false,
      sttConfidenceThreshold: 0.55,
      correctionKeywords: ["やっぱり", "違う"],
      orderRetryMax: 1,
      deliveryRetryMax: 1,
    },
    onPrompt: (message) => {
      prompts.push(message);
    },
    onLog: () => {},
    onInquiryUpdate: () => {},
  });
  return { controller, prompts };
};

const runCase = async (label: string, text: string, assertFn: (state: string, ctx: any) => void) => {
  const { controller } = makeController();
  await controller.start();
  await controller.onUserTranscript(text, 0.9);
  await nextTick();
  assertFn(controller.getState(), controller.getContext());
  console.log("ok", label);
};

(async () => {
  assert.equal(extractRiceBrand("コシヒカリ")?.brand, "コシヒカリ");
  assert.equal(extractRiceBrand("こしひかり")?.brand, "コシヒカリ");
  assert.equal(extractWeightKg("5kg"), 5);
  assert.equal(extractWeightKg("五キロ"), 5);

  await runCase("case1: コシヒカリ 5kg", "コシヒカリ 5kg", (state, ctx) => {
    assert.equal(ctx.riceBrand, "コシヒカリ");
    assert.equal(ctx.riceWeightKg, 5);
    assert.equal(state, "ST_ProductSuggestion");
  });

  await runCase("case2: こしひかりを五キロ", "こしひかりを五キロ", (state, ctx) => {
    assert.equal(ctx.riceBrand, "コシヒカリ");
    assert.equal(ctx.riceWeightKg, 5);
    assert.equal(state, "ST_ProductSuggestion");
  });

  await runCase("case3: はい", "はい", (state, ctx) => {
    assert.equal(ctx.riceBrand, undefined);
    assert.equal(ctx.riceWeightKg, undefined);
    assert.equal(state, "ST_Greeting");
  });

  await runCase("case4: えっと…コシ… 5", "えっと…コシ… 5キロ", (state, ctx) => {
    assert.equal(ctx.riceBrand, "コシヒカリ");
    assert.equal(ctx.riceWeightKg, 5);
    assert.equal(state, "ST_ProductSuggestion");
  });

  await runCase("case5: 10トン", "10トン", (state, ctx) => {
    assert.equal(ctx.riceWeightKg, undefined);
    assert.equal(state, "ST_Greeting");
  });

  await runCase("case6: あきたこまち 10キロ", "あきたこまち 10キロ", (state, ctx) => {
    assert.equal(ctx.riceBrand, "あきたこまち");
    assert.equal(ctx.riceWeightKg, 10);
    assert.equal(state, "ST_ProductSuggestion");
  });

  await runCase("case7: ゆめぴりか 0.5kg", "ゆめぴりか 0.5kg", (state, ctx) => {
    assert.equal(ctx.riceBrand, "ゆめぴりか");
    assert.equal(ctx.riceWeightKg, undefined);
    assert.equal(state, "ST_Greeting");
  });

  await runCase("case8: 5kg", "5kg", (state, ctx) => {
    assert.equal(ctx.riceBrand, undefined);
    assert.equal(ctx.riceWeightKg, 5);
    assert.equal(state, "ST_RequirementCheck");
  });

  await runCase("case9: コシヒカリ", "コシヒカリ", (state, ctx) => {
    assert.equal(ctx.riceBrand, "コシヒカリ");
    assert.equal(ctx.riceWeightKg, undefined);
    assert.equal(state, "ST_RequirementCheck");
  });

  await runCase("case10: はい 5kg", "はい 5kg", (state, ctx) => {
    assert.equal(ctx.riceBrand, undefined);
    assert.equal(ctx.riceWeightKg, 5);
    assert.equal(state, "ST_RequirementCheck");
  });

  console.log("All rice flow tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
