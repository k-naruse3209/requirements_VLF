type ConversationState =
  | "ST_Greeting"
  | "ST_RequirementCheck"
  | "ST_ProductSuggestion"
  | "ST_StockCheck"
  | "ST_PriceQuote"
  | "ST_AddressConfirm"
  | "ST_DeliveryCheck"
  | "ST_OrderConfirmation"
  | "ST_Closing"
  | "EX_Silence"
  | "EX_NoHear";

export type Product = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  specs?: string;
};

type ToolClient = {
  getStock: (productId: string) => Promise<{ available: boolean; quantity?: number }>;
  getPrice: (productId: string) => Promise<{ price: number; currency?: string }>;
  getDeliveryDate: (productId: string, address: string) => Promise<{ deliveryDate: string }>;
  saveOrder: (payload: {
    productId: string;
    price: number;
    deliveryDate: string;
    customerPhone: string;
    timestamp: string;
  }) => Promise<{ orderId: string }>;
};

type ConversationConfig = {
  silenceTimeoutMs: number;
  silenceRetriesMax: number;
  noHearRetriesMax: number;
  silenceAutoPromptEnabled: boolean;
  noHearAutoPromptEnabled: boolean;
  sttConfidenceThreshold: number;
  correctionKeywords: string[];
  orderRetryMax: number;
  deliveryRetryMax: number;
};

type ConversationContext = {
  category?: string;
  product?: Product;
  price?: number;
  currency?: string;
  deliveryDate?: string;
  address?: string;
  riceBrand?: string;
  riceWeightKg?: number;
  riceNote?: string;
  addressConfirmed: boolean;
  awaitingAddressConfirm: boolean;
  awaitingCategoryConfirm: boolean;
  customerPhone?: string;
  orderId?: string;
  suggestedProductIds: string[];
  silenceRetries: number;
  noHearRetries: number;
  deliveryRetries: number;
  orderRetries: number;
  closingReason: "success" | "cancel" | "error";
};

type PromptHandler = (message: string) => void;
type LogHandler = (message: string, data?: unknown) => void;
type InquiryUpdateHandler = (payload: {
  brand?: string;
  weightKg?: number;
  deliveryAddress?: string;
  deliveryDate?: string;
  note?: string;
}) => void;

const yesPattern = /(はい|お願いします|そうです|大丈夫|いいですよ|よろしい)/;
const noPattern = /(いいえ|いえ|違う|やめ|キャンセル|不要|結構)/;
const greetingPattern = /(もしもし|聞こえますか|聞こえてますか)/;
const japaneseCharPattern = /[ぁ-んァ-ン一-龯]/;
const punctuationOnlyPattern = /^[\s\p{P}\p{S}]+$/u;

const isYes = (text: string) => yesPattern.test(text);
const isNo = (text: string) => noPattern.test(text);

const normalizeText = (text: string) => text.trim();

const toHiragana = (value: string) =>
  value.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );

export const normalizeRiceText = (text: string) => {
  const normalized = text.normalize("NFKC").toLowerCase();
  const noSpaces = normalized.replace(/\s+/g, "");
  const noPunct = noSpaces.replace(/[・、。.,/\\]/g, "");
  const hiragana = toHiragana(noPunct);
  return hiragana.replace(/ー/g, "");
};

const riceBrandDictionary: Record<string, string[]> = {
  コシヒカリ: ["こしひかり", "こし光", "こしひkari", "越光", "越ひかり", "腰光", "こしひ", "こし"],
  あきたこまち: ["あきたこまち", "秋田こまち", "あきた小町", "秋田小町", "あきたこま", "あきた"],
  ひとめぼれ: ["ひとめぼれ", "一目ぼれ", "一目惚れ", "ひとめ"],
  ゆめぴりか: ["ゆめぴりか", "夢ぴりか", "ゆめぴ"],
  ななつぼし: ["ななつぼし", "七つ星", "ななつ"],
};

const normalizeBrandText = (text: string) => {
  const normalized = normalizeRiceText(text);
  return normalized.replace(/[0-9a-z]/gi, "");
};

export const extractRiceBrand = (text: string) => {
  const normalized = normalizeBrandText(text);
  let best: string | null = null;
  let bestLength = 0;
  for (const [canonical, variants] of Object.entries(riceBrandDictionary)) {
    for (const variant of variants) {
      const key = normalizeBrandText(variant);
      if (!key) continue;
      if (normalized.includes(key) && key.length > bestLength) {
        best = canonical;
        bestLength = key.length;
      }
    }
  }
  return best;
};

const kanjiMap: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

const parseKanjiNumber = (text: string) => {
  if (!text) return null;
  let total = 0;
  let current = 0;
  for (const ch of text) {
    if (ch === "十") {
      current = current === 0 ? 1 : current;
      total += current * 10;
      current = 0;
      continue;
    }
    const value = kanjiMap[ch];
    if (value == null) return null;
    current += value;
  }
  total += current;
  return total || null;
};

export const extractWeightKg = (text: string) => {
  const normalized = text.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
  const numeric = normalized.match(/(\d+(?:\.\d+)?)?(?:kg|ｋｇ|きろ|キロ|公斤)/);
  if (numeric && numeric[1]) {
    const value = Number(numeric[1]);
    return Number.isFinite(value) ? value : null;
  }
  const kanji = normalizeRiceText(text).match(
    /([一二三四五六七八九十零]+)(?:kg|ｋｇ|きろ|キロ|公斤)/
  );
  if (kanji) {
    const value = parseKanjiNumber(kanji[1]);
    return value ?? null;
  }
  return null;
};

const isValidWeightKg = (value: number | null) => {
  if (value == null) return false;
  if (!Number.isFinite(value)) return false;
  return value >= 1 && value <= 50;
};

const backchannelPattern = /(はい|ええ|うん|うーん|えっと|あの|うんうん|うんうーん|もしもし)$/;

const shouldIgnoreTranscript = (text: string) => {
  const normalized = text.trim();
  if (!normalized) return true;
  if (extractWeightKg(normalized) != null) return false;
  if (extractRiceBrand(normalized)) return false;
  if (punctuationOnlyPattern.test(normalized)) return true;
  if (normalized.length < 2) return true;
  if (!japaneseCharPattern.test(normalized) && normalized.length < 4) return true;
  return false;
};

const pickProduct = (catalog: Product[], category: string | undefined, excludeIds: string[]) => {
  if (!catalog.length) return undefined;
  if (!category) {
    return catalog.find((item) => !excludeIds.includes(item.id));
  }
  const categoryMatch = catalog.find(
    (item) => item.category?.includes(category) && !excludeIds.includes(item.id)
  );
  return categoryMatch || catalog.find((item) => !excludeIds.includes(item.id));
};

export const createConversationController = ({
  catalog,
  toolClient,
  config,
  onPrompt,
  onLog,
  onInquiryUpdate,
}: {
  catalog: Product[];
  toolClient: ToolClient;
  config: ConversationConfig;
  onPrompt: PromptHandler;
  onLog: LogHandler;
  onInquiryUpdate: InquiryUpdateHandler;
}) => {
  let state: ConversationState = "ST_Greeting";
  let lastInteractiveState: ConversationState = "ST_Greeting";
  let silenceTimer: NodeJS.Timeout | null = null;
  let noHearTimer: NodeJS.Timeout | null = null;
  let waitingForCommit = false;

  const context: ConversationContext = {
    suggestedProductIds: [],
    silenceRetries: 0,
    noHearRetries: 0,
    deliveryRetries: 0,
    orderRetries: 0,
    closingReason: "success",
    addressConfirmed: false,
    awaitingAddressConfirm: false,
    awaitingCategoryConfirm: false,
  };

  const clearTimers = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    if (noHearTimer) clearTimeout(noHearTimer);
    silenceTimer = null;
    noHearTimer = null;
  };

  const startSilenceTimer = () => {
    if (waitingForCommit) return;
    if (!config.silenceAutoPromptEnabled) return;
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      handleSilenceTimeout().catch((err) => onLog("silence handler failed", err));
    }, config.silenceTimeoutMs);
  };

  const startNoHearTimer = () => {
    if (noHearTimer) clearTimeout(noHearTimer);
    if (!config.noHearAutoPromptEnabled) return;
    noHearTimer = setTimeout(() => {
      handleNoHearTimeout().catch((err) => onLog("nohear handler failed", err));
    }, 3000);
  };

  const resetRetries = () => {
    context.silenceRetries = 0;
    context.noHearRetries = 0;
  };

  const enterState = async (nextState: ConversationState) => {
    state = nextState;
    if (nextState.startsWith("ST_")) {
      lastInteractiveState = nextState;
    }
    onLog("state.enter", { state: nextState, context });
    clearTimers();

    switch (nextState) {
      case "ST_Greeting": {
        onPrompt(
          "お電話ありがとうございます。お米のご注文ですね。銘柄と量を教えてください。"
        );
        startSilenceTimer();
        break;
      }
      case "ST_RequirementCheck": {
        if (context.riceBrand && context.riceWeightKg) {
          onPrompt(`「${context.riceBrand}」${context.riceWeightKg}kgでよろしいでしょうか？`);
        } else if (context.riceBrand && !context.riceWeightKg) {
          onPrompt(`銘柄は「${context.riceBrand}」で承りました。量は何kgがご希望ですか？`);
        } else if (!context.riceBrand && context.riceWeightKg) {
          onPrompt(`量は${context.riceWeightKg}kgですね。銘柄は何をご希望ですか？`);
        } else {
          onPrompt("銘柄（例: コシヒカリ）と量（例: 5kg）を教えてください。");
        }
        startSilenceTimer();
        break;
      }
      case "ST_ProductSuggestion": {
        const product = pickProduct(
          catalog,
          context.riceBrand ?? context.category,
          context.suggestedProductIds
        );
        if (!product) {
          context.closingReason = "error";
          onPrompt("申し訳ございません。現在ご案内できるお米がありません。失礼いたします。");
          return enterState("ST_Closing");
        }
        context.product = product;
        context.suggestedProductIds.push(product.id);
        const details = [product.description, product.specs].filter(Boolean).join(" ");
        const detailText = details ? ` ${details}` : "";
        onPrompt(
          `${product.name}はいかがでしょうか。${detailText}こちらでよろしいですか？`
        );
        startSilenceTimer();
        break;
      }
      case "ST_StockCheck": {
        if (!context.product) {
          context.closingReason = "error";
          onPrompt("商品情報が取得できませんでした。失礼いたします。");
          return enterState("ST_Closing");
        }
        try {
          const stock = await toolClient.getStock(context.product.id);
          if (!stock.available) {
            return enterState("ST_ProductSuggestion");
          }
        } catch (err) {
          onLog("getStock failed", err);
          context.closingReason = "error";
          onPrompt("在庫確認に失敗しました。申し訳ございません。失礼いたします。");
          return enterState("ST_Closing");
        }
        return enterState("ST_PriceQuote");
      }
      case "ST_PriceQuote": {
        if (!context.product) {
          context.closingReason = "error";
          onPrompt("商品情報が取得できませんでした。失礼いたします。");
          return enterState("ST_Closing");
        }
        try {
          const price = await toolClient.getPrice(context.product.id);
          context.price = price.price;
          context.currency = price.currency || "JPY";
        } catch (err) {
          onLog("getPrice failed", err);
          context.closingReason = "error";
          onPrompt("価格情報の取得に失敗しました。申し訳ございません。失礼いたします。");
          return enterState("ST_Closing");
        }
        const priceText = context.currency === "JPY" ? `${context.price}円` : `${context.price} ${context.currency}`;
        onPrompt(`価格は${priceText}です。よろしいですか？`);
        startSilenceTimer();
        break;
      }
      case "ST_AddressConfirm": {
        if (context.address && context.addressConfirmed) {
          return enterState("ST_DeliveryCheck");
        }
        if (context.address && context.awaitingAddressConfirm) {
          onPrompt(`配送先は${context.address}でよろしいでしょうか？`);
        } else if (context.address) {
          context.awaitingAddressConfirm = true;
          onPrompt(`配送先は${context.address}でよろしいでしょうか？`);
        } else {
          onPrompt("配送先のご住所を教えてください。");
        }
        startSilenceTimer();
        break;
      }
      case "ST_DeliveryCheck": {
        if (!context.product || !context.address) {
          context.closingReason = "error";
          onPrompt("配送先情報が取得できませんでした。失礼いたします。");
          return enterState("ST_Closing");
        }
        try {
          const delivery = await toolClient.getDeliveryDate(context.product.id, context.address);
          context.deliveryDate = delivery.deliveryDate;
          onInquiryUpdate({
            brand: context.riceBrand,
            weightKg: context.riceWeightKg,
            deliveryAddress: context.address,
            deliveryDate: context.deliveryDate,
            note: context.riceNote,
          });
        } catch (err) {
          onLog("getDeliveryDate failed", err);
          context.closingReason = "error";
          onPrompt("配送日の取得に失敗しました。申し訳ございません。失礼いたします。");
          return enterState("ST_Closing");
        }
        onPrompt(`配送は${context.deliveryDate}の予定です。よろしいですか？`);
        startSilenceTimer();
        break;
      }
      case "ST_OrderConfirmation": {
        if (!context.product || !context.price || !context.deliveryDate) {
          context.closingReason = "error";
          onPrompt("注文内容が取得できませんでした。失礼いたします。");
          return enterState("ST_Closing");
        }
        if (!context.customerPhone) {
          onPrompt("確認のためお電話番号をもう一度お知らせいただけますか？");
          startSilenceTimer();
          return;
        }
        const priceText = context.currency === "JPY" ? `${context.price}円` : `${context.price} ${context.currency}`;
        onPrompt(
          `ご注文内容は、商品:${context.product.name}、価格:${priceText}、配送:${context.deliveryDate}です。確定でよろしいですか？`
        );
        startSilenceTimer();
        break;
      }
      case "ST_Closing": {
        if (context.closingReason === "success") {
          onPrompt("ご注文ありがとうございました。失礼いたします。");
        } else if (context.closingReason === "cancel") {
          onPrompt("承知いたしました。失礼いたします。");
        } else {
          onPrompt("申し訳ございません。エラーが発生しました。失礼いたします。");
        }
        clearTimers();
        break;
      }
      case "EX_Silence": {
        onPrompt("もしもし、お聞きになっていますか？");
        startSilenceTimer();
        break;
      }
      case "EX_NoHear": {
        onPrompt("申し訳ございません、もう一度おっしゃっていただけますか？");
        startSilenceTimer();
        break;
      }
      default:
        break;
    }
  };

  const handleSilenceTimeout = async () => {
    if (waitingForCommit) {
      onLog("silence.skipped", { waitingForCommit: true });
      return;
    }
    if (!config.silenceAutoPromptEnabled) {
      onLog("silence.skipped", { autoPrompt: false });
      return;
    }
    context.silenceRetries += 1;
    if (context.silenceRetries > config.silenceRetriesMax) {
      context.closingReason = "error";
      await enterState("ST_Closing");
      return;
    }
    onLog("state.exception", { type: "EX_Silence", retries: context.silenceRetries });
    onPrompt("もしもし、お聞きになっていますか？");
    startSilenceTimer();
  };

  const handleNoHearTimeout = async () => {
    context.noHearRetries += 1;
    if (context.noHearRetries > config.noHearRetriesMax) {
      context.closingReason = "error";
      await enterState("ST_Closing");
      return;
    }
    onLog("state.exception", { type: "EX_NoHear", retries: context.noHearRetries });
    onPrompt("申し訳ございません、もう一度おっしゃっていただけますか？");
    startSilenceTimer();
  };

  const handleUserTranscript = async (text: string, confidence: number | null) => {
    const normalized = normalizeText(text);
    if (!normalized) return;
    if (shouldIgnoreTranscript(normalized)) {
      onLog("transcript.ignored", { text: normalized });
      return;
    }

    clearTimers();

    if (confidence != null && confidence < config.sttConfidenceThreshold) {
      onLog("stt.confidence.low", { confidence, text: normalized });
      return handleNoHearTimeout();
    }

    resetRetries();

    const weightCandidate = extractWeightKg(normalized);
    const brandCandidate = extractRiceBrand(normalized);
    const hasInfo = Boolean(weightCandidate != null || brandCandidate);
    if (!hasInfo) {
      if (state === "ST_Greeting" || state === "ST_RequirementCheck") {
        if (context.noHearRetries === 0) {
          context.noHearRetries += 1;
          onPrompt("銘柄（例: コシヒカリ）と量（例: 5kg）を教えてください。");
          startSilenceTimer();
        } else {
          onLog("transcript.noinfo", { text: normalized });
        }
        return;
      }
    }

    if (weightCandidate != null && !isValidWeightKg(weightCandidate)) {
      if (brandCandidate) {
        context.riceBrand = brandCandidate;
        onInquiryUpdate({
          brand: context.riceBrand,
          weightKg: context.riceWeightKg,
          deliveryAddress: context.address,
          deliveryDate: context.deliveryDate,
          note: context.riceNote,
        });
      }
      onLog("weight.invalid", { value: weightCandidate });
      onPrompt("量は1〜50kgの範囲で教えてください。");
      startSilenceTimer();
      return;
    }

    if (brandCandidate) {
      context.riceBrand = brandCandidate;
    }
    if (weightCandidate != null && isValidWeightKg(weightCandidate)) {
      context.riceWeightKg = weightCandidate;
    }
    if (context.riceBrand || context.riceWeightKg) {
      onInquiryUpdate({
        brand: context.riceBrand,
        weightKg: context.riceWeightKg,
        deliveryAddress: context.address,
        deliveryDate: context.deliveryDate,
        note: context.riceNote,
      });
    }

    if (config.correctionKeywords.some((keyword) => normalized.includes(keyword))) {
      context.product = undefined;
      context.price = undefined;
      context.deliveryDate = undefined;
      context.address = undefined;
      context.addressConfirmed = false;
      context.awaitingAddressConfirm = false;
      context.category = undefined;
      context.awaitingCategoryConfirm = false;
      context.riceBrand = undefined;
      context.riceWeightKg = undefined;
      context.suggestedProductIds = [];
      context.deliveryRetries = 0;
      context.orderRetries = 0;
      return enterState("ST_RequirementCheck");
    }

    if (state === "ST_Greeting") {
      if (greetingPattern.test(normalized)) {
        onPrompt("はい、聞こえています。お米の銘柄と量を教えてください。");
        startSilenceTimer();
        return;
      }
      if (context.riceBrand && context.riceWeightKg) {
        context.category = context.riceBrand;
        return enterState("ST_ProductSuggestion");
      }
      return enterState("ST_RequirementCheck");
    }

    if (state === "ST_RequirementCheck") {
      if (greetingPattern.test(normalized)) {
        onPrompt("はい、聞こえています。お米の銘柄と量を教えてください。");
        startSilenceTimer();
        return;
      }
      if (context.riceBrand && context.riceWeightKg) {
        context.category = context.riceBrand;
        return enterState("ST_ProductSuggestion");
      }
      if (!context.riceBrand && context.riceWeightKg) {
        onPrompt(`量は${context.riceWeightKg}kgですね。銘柄は何をご希望ですか？`);
        startSilenceTimer();
        return;
      }
      if (context.riceBrand && !context.riceWeightKg) {
        onPrompt(`銘柄は「${context.riceBrand}」で承りました。量は何kgがご希望ですか？`);
        startSilenceTimer();
        return;
      }
      onPrompt("銘柄（例: コシヒカリ）と量（例: 5kg）を教えてください。");
      startSilenceTimer();
      return;
    }

    if (state === "ST_ProductSuggestion") {
      if (isYes(normalized)) {
        return enterState("ST_StockCheck");
      }
      if (isNo(normalized)) {
        return enterState("ST_RequirementCheck");
      }
      return enterState("ST_RequirementCheck");
    }

    if (state === "ST_PriceQuote") {
      if (isYes(normalized)) {
        return enterState("ST_AddressConfirm");
      }
      if (isNo(normalized)) {
        return enterState("ST_ProductSuggestion");
      }
      return enterState("ST_ProductSuggestion");
    }

    if (state === "ST_AddressConfirm") {
      if (context.awaitingAddressConfirm) {
        if (isYes(normalized)) {
          context.addressConfirmed = true;
          context.awaitingAddressConfirm = false;
          onInquiryUpdate({
            brand: context.riceBrand,
            weightKg: context.riceWeightKg,
            deliveryAddress: context.address,
            deliveryDate: context.deliveryDate,
            note: context.riceNote,
          });
          return enterState("ST_DeliveryCheck");
        }
        if (isNo(normalized)) {
          context.address = undefined;
          context.addressConfirmed = false;
          context.awaitingAddressConfirm = false;
          onPrompt("承知いたしました。配送先のご住所をもう一度お願いします。");
          startSilenceTimer();
          return;
        }
        onPrompt(`配送先は${context.address}でよろしいでしょうか？`);
        startSilenceTimer();
        return;
      } else if (!context.address) {
        context.address = normalized;
        context.awaitingAddressConfirm = true;
        onInquiryUpdate({
          brand: context.riceBrand,
          weightKg: context.riceWeightKg,
          deliveryAddress: context.address,
          deliveryDate: context.deliveryDate,
          note: context.riceNote,
        });
        onPrompt(`配送先は${context.address}でよろしいでしょうか？`);
        startSilenceTimer();
        return;
      }
    }

    if (state === "ST_DeliveryCheck") {
      if (isYes(normalized)) {
        return enterState("ST_OrderConfirmation");
      }
      if (isNo(normalized)) {
        if (context.deliveryRetries < config.deliveryRetryMax) {
          context.deliveryRetries += 1;
          return enterState("ST_DeliveryCheck");
        }
        context.closingReason = "cancel";
        return enterState("ST_Closing");
      }
      return enterState("ST_DeliveryCheck");
    }

    if (state === "ST_OrderConfirmation") {
      if (!context.customerPhone) {
        context.customerPhone = normalized;
        onInquiryUpdate({
          brand: context.riceBrand,
          weightKg: context.riceWeightKg,
          deliveryAddress: context.address,
          deliveryDate: context.deliveryDate,
          note: context.riceNote,
        });
        return enterState("ST_OrderConfirmation");
      }
      if (isYes(normalized)) {
        return handleSaveOrder();
      }
      context.closingReason = "cancel";
      return enterState("ST_Closing");
    }
  };

  const handleSaveOrder = async () => {
    if (!context.product || !context.price || !context.deliveryDate || !context.customerPhone) {
      context.closingReason = "error";
      return enterState("ST_Closing");
    }
    const payload = {
      productId: context.product.id,
      price: context.price,
      deliveryDate: context.deliveryDate,
      customerPhone: context.customerPhone,
      timestamp: new Date().toISOString(),
    };
    try {
      const result = await toolClient.saveOrder(payload);
      context.orderId = result.orderId;
      context.closingReason = "success";
      return enterState("ST_Closing");
    } catch (err) {
      onLog("saveOrder failed", err);
      if (context.orderRetries < config.orderRetryMax) {
        context.orderRetries += 1;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return handleSaveOrder();
      }
      context.closingReason = "error";
      return enterState("ST_Closing");
    }
  };

  return {
    start: () => enterState("ST_Greeting"),
    onUserTranscript: (text: string, confidence: number | null) =>
      handleUserTranscript(text, confidence),
    onUserCommitted: () => {
      waitingForCommit = false;
      clearTimers();
    },
    onSpeechStarted: () => {
      waitingForCommit = true;
      if (silenceTimer) clearTimeout(silenceTimer);
      if (noHearTimer) clearTimeout(noHearTimer);
    },
    onSpeechStopped: () => {
      if (!waitingForCommit && config.noHearAutoPromptEnabled) {
        startNoHearTimer();
      }
    },
    onAssistantStart: () => {
      clearTimers();
    },
    onAssistantDone: () => {
      if (state !== "ST_Closing" && config.silenceAutoPromptEnabled && !waitingForCommit) {
        startSilenceTimer();
      }
    },
    setCustomerPhone: (phone?: string) => {
      if (!phone) return;
      context.customerPhone = phone;
    },
    setAddress: (address?: string) => {
      if (!address) return;
      context.address = address;
    },
    getState: () => state,
    getContext: () => ({ ...context }),
  };
};
