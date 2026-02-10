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

const bootstrap = async (controller: ReturnType<typeof makeController>["controller"]) => {
  await controller.start();
  controller.onAssistantDone();
  await nextTick();
};

const runCase = async (label: string, text: string, assertFn: (state: string, ctx: any) => void) => {
  const { controller } = makeController();
  await bootstrap(controller);
  await controller.onUserTranscript(text, 0.9);
  await nextTick();
  assertFn(controller.getState(), controller.getContext());
  console.log("ok", label);
};

const runSequence = async (
  label: string,
  texts: string[],
  assertFn: (state: string, ctx: any) => void
) => {
  const { controller } = makeController();
  await bootstrap(controller);
  for (const text of texts) {
    await controller.onUserTranscript(text, 0.9);
    await nextTick();
  }
  assertFn(controller.getState(), controller.getContext());
  console.log("ok", label);
};

(async () => {
  assert.equal(extractRiceBrand("コシヒカリ")?.brand, "コシヒカリ");
  assert.equal(extractRiceBrand("こしひかり")?.brand, "コシヒカリ");
  assert.equal(extractWeightKg("5kg"), 5);
  assert.equal(extractWeightKg("五キロ"), 5);

  await runSequence("case1: コシヒカリ confirm + weight", ["コシヒカリ 5kg", "はい", "10kg"], (state, ctx) => {
    assert.equal(ctx.riceBrand, "コシヒカリ");
    assert.equal(ctx.riceWeightKg, 10);
    assert.equal(state, "ST_ProductSuggestion");
  });

  await runSequence(
    "case1b: コシヒカリ weight without yes",
    ["コシヒカリ 5kg", "10kg"],
    (state, ctx) => {
      assert.equal(ctx.riceBrand, "コシヒカリ");
      assert.equal(ctx.riceWeightKg, 10);
      assert.equal(state, "ST_ProductSuggestion");
    }
  );

  await runSequence(
    "case2: こしひかりを五キロ confirm + weight",
    ["こしひかりを五キロ", "はい", "5kg"],
    (state, ctx) => {
      assert.equal(ctx.riceBrand, "コシヒカリ");
      assert.equal(ctx.riceWeightKg, 5);
      assert.equal(state, "ST_ProductSuggestion");
    }
  );

  await runCase("case3: はい", "はい", (state, ctx) => {
    assert.equal(ctx.riceBrand, undefined);
    assert.equal(ctx.riceWeightKg, undefined);
    assert.equal(state, "ST_RequirementCheck");
  });

  await runSequence(
    "case4: えっと…コシ… 5 confirm + weight",
    ["えっと…コシ… 5キロ", "はい", "10kg"],
    (state, ctx) => {
      assert.equal(ctx.riceBrand, "コシヒカリ");
      assert.equal(ctx.riceWeightKg, 10);
      assert.equal(state, "ST_ProductSuggestion");
    }
  );

  await runCase("case5: 10トン", "10トン", (state, ctx) => {
    assert.equal(ctx.riceWeightKg, undefined);
    assert.equal(state, "ST_RequirementCheck");
  });

  await runSequence(
    "case6: あきたこまち 10キロ confirm + weight",
    ["あきたこまち 10キロ", "はい", "20kg"],
    (state, ctx) => {
      assert.equal(ctx.riceBrand, "あきたこまち");
      assert.equal(ctx.riceWeightKg, 20);
      assert.equal(state, "ST_ProductSuggestion");
    }
  );

  await runCase("case7: ゆめぴりか 0.5kg", "ゆめぴりか 0.5kg", (state, ctx) => {
    assert.equal(ctx.riceBrand, "ゆめぴりか");
    assert.equal(ctx.riceWeightKg, undefined);
    assert.equal(state, "ST_RequirementCheck");
  });

  await runCase("case8: 5kg", "5kg", (state, ctx) => {
    assert.equal(ctx.riceBrand, undefined);
    assert.equal(ctx.riceWeightKg, undefined);
    assert.equal(state, "ST_RequirementCheck");
  });

  await runCase("case9: コシヒカリ", "コシヒカリ", (state, ctx) => {
    assert.equal(ctx.riceBrand, "コシヒカリ");
    assert.equal(ctx.riceWeightKg, undefined);
    assert.equal(state, "ST_RequirementCheck");
  });

  await runCase("case10: はい 5kg", "はい 5kg", (state, ctx) => {
    assert.equal(ctx.riceBrand, undefined);
    assert.equal(ctx.riceWeightKg, undefined);
    assert.equal(state, "ST_RequirementCheck");
  });

  await runCase("case11: もしもし", "もしもし", (state, ctx) => {
    assert.equal(ctx.riceBrand, undefined);
    assert.equal(ctx.riceWeightKg, undefined);
    assert.equal(state, "ST_RequirementCheck");
  });

  {
    const { controller } = makeController();
    await bootstrap(controller);
    await controller.onUserTranscript("コシヒカリ 5kg", 0.9);
    await nextTick();
    await controller.onUserTranscript("はい", 0.9);
    await nextTick();
    await controller.onUserTranscript("5kg", 0.9);
    await nextTick();
    assert.equal(controller.getState(), "ST_ProductSuggestion");
    controller.onAssistantDone();
    await nextTick();
    assert.equal(controller.getState(), "ST_PriceQuote");
    await controller.onUserTranscript("あきたこまち", 0.9);
    await nextTick();
    const ctx = controller.getContext();
    assert.equal(controller.getState(), "ST_PriceQuote");
    assert.equal(ctx.riceBrand, "コシヒカリ");
    assert.equal(ctx.riceWeightKg, 5);
    console.log("ok case12: non-requirement state ignores requirement extraction");
  }

  {
    const { controller } = makeController();
    await bootstrap(controller);
    controller.onUserCommitWithoutTranscript();
    await nextTick();
    assert.equal(controller.getState(), "EX_NoHear");
    console.log("ok case13: empty transcript commit triggers no-hear recovery");
  }

  console.log("All rice flow tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
