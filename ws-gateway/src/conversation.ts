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
  getStock: (
    productId: string
  ) => Promise<{ available: boolean; quantity?: number }>;
  getPrice: (productId: string) => Promise<{ price: number; currency?: string }>;
  getDeliveryDate: (
    productId: string,
    address: string
  ) => Promise<{ deliveryDate: string }>;
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
  riceMilling?: "精米" | "玄米";
  riceNote?: string;

  addressConfirmed: boolean;
  awaitingAddressConfirm: boolean;

  awaitingCategoryConfirm: boolean;
  awaitingBrandConfirm: boolean;
  awaitingWeightChoice: boolean;
  awaitingMillingChoice: boolean;

  brandConfirmed: boolean;

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
const seimaiPattern = /(精米|せいまい)/;
const genmaiPattern = /(玄米|げんまい)/;

const isYes = (text: string) => yesPattern.test(text);
const isNo = (text: string) => noPattern.test(text);
const isJapaneseLike = (text: string) => japaneseCharPattern.test(text);

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

const extractMilling = (text: string): "精米" | "玄米" | null => {
  const normalized = normalizeRiceText(text);
  if (genmaiPattern.test(normalized)) return "玄米";
  if (seimaiPattern.test(normalized)) return "精米";
  return null;
};

const riceBrandDictionary: Record<string, string[]> = {
  コシヒカリ: [
    "こしひかり",
    "こし光",
    "こしひkari",
    "越光",
    "越ひかり",
    "腰光",
    "こしひ",
    "こし",
  ],
  あきたこまち: [
    "あきたこまち",
    "秋田こまち",
    "あきた小町",
    "秋田小町",
    "あきたこま",
    "あきた",
  ],
  ひとめぼれ: ["ひとめぼれ", "一目ぼれ", "一目惚れ", "ひとめ"],
  ゆめぴりか: ["ゆめぴりか", "夢ぴりか", "ゆめぴ"],
  ななつぼし: ["ななつぼし", "七つ星", "ななつ"],
};

const defaultRiceWeights = [5, 10, 20];

const buildWeightPrompt = (weights: number[]) =>
  `${weights.map((weight) => `${weight}kg`).join("、")}があります。この中からお選びください。`;

const extractCatalogWeightKg = (name: string): number | null => {
  const normalized = name.normalize("NFKC");
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(?:kg|キロ)/i);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return value;
};

const normalizeBrandText = (text: string) => {
  const normalized = normalizeRiceText(text);
  return normalized
    .replace(/[0-9a-z]/gi, "")
    .replace(/(kg|ｋｇ|きろ|キロ|公斤)/g, "")
    .replace(/[一二三四五六七八九十零]/g, "")
    .replace(
      /(です|ください|おねがいします|お願いします|にしてください|でお願いします)/g,
      ""
    )
    .trim();
};

const levenshtein = (a: string, b: string) => {
  if (a === b) return 0;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;
  const dp = Array.from({ length: aLen + 1 }, () =>
    new Array(bLen + 1).fill(0)
  );
  for (let i = 0; i <= aLen; i += 1) dp[i][0] = i;
  for (let j = 0; j <= bLen; j += 1) dp[0][j] = j;
  for (let i = 1; i <= aLen; i += 1) {
    for (let j = 1; j <= bLen; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[aLen][bLen];
};

const bestDistanceInText = (text: string, key: string) => {
  if (!text || !key) return Number.POSITIVE_INFINITY;
  if (text.includes(key)) return 0;
  if (text.length <= key.length) return levenshtein(text, key);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= text.length - key.length; i += 1) {
    const chunk = text.slice(i, i + key.length);
    const dist = levenshtein(chunk, key);
    if (dist < best) best = dist;
    if (best === 1) break;
  }
  return best;
};

const isFuzzyAcceptable = (distance: number, keyLength: number) => {
  if (distance === 0) return true;
  if (keyLength <= 3) return distance <= 1;
  if (keyLength <= 5) return distance <= 2;
  if (keyLength <= 8) return distance <= 3;
  return distance <= 4;
};

export const extractRiceBrand = (text: string) => {
  const normalized = normalizeBrandText(text);
  let best: string | null = null;
  let bestLength = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  let confidence: "exact" | "fuzzy" = "exact";
  for (const [canonical, variants] of Object.entries(riceBrandDictionary)) {
    for (const variant of variants) {
      const key = normalizeBrandText(variant);
      if (!key) continue;
      if (normalized.includes(key) && key.length > bestLength) {
        best = canonical;
        bestLength = key.length;
        bestDistance = 0;
        confidence = "exact";
        continue;
      }
      const distance = bestDistanceInText(normalized, key);
      if (distance > 0 && isFuzzyAcceptable(distance, key.length)) {
        if (best == null || distance < bestDistance) {
          best = canonical;
          bestLength = key.length;
          bestDistance = distance;
          confidence = "fuzzy";
        }
      }
    }
  }
  return best ? { brand: best, confidence } : null;
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

const pickProduct = (
  catalog: Product[],
  category: string | undefined,
  excludeIds: string[]
) => {
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
  let skipRequirementPromptOnce = false;
  const pendingTranscripts: Array<{ text: string; confidence: number | null }> = [];

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
    awaitingBrandConfirm: false,
    awaitingWeightChoice: false,
    awaitingMillingChoice: false,
    brandConfirmed: false,
  };

  const allowedRiceWeights = (() => {
    const set = new Set<number>();
    for (const item of catalog) {
      const weight = extractCatalogWeightKg(item.name);
      if (weight != null && Number.isInteger(weight) && isValidWeightKg(weight)) {
        set.add(weight);
      }
    }
    return set.size > 0
      ? Array.from(set).sort((a, b) => a - b)
      : [...defaultRiceWeights];
  })();
  const weightOptionsPrompt = buildWeightPrompt(allowedRiceWeights);

  const selectRiceProduct = (brand: string, weightKg: number) => {
    const normalizedBrand = normalizeRiceText(brand);
    return catalog.find((item) => {
      const category = normalizeRiceText(item.category || "");
      const itemWeight = extractCatalogWeightKg(item.name);
      return category === normalizedBrand && itemWeight === weightKg;
    });
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
        break;
      }

      case "ST_RequirementCheck": {
        if (skipRequirementPromptOnce) {
          skipRequirementPromptOnce = false;
          startSilenceTimer();
          break;
        }
        if (context.awaitingBrandConfirm && context.riceBrand) {
          onPrompt(`「${context.riceBrand}」でよろしいですか？`);
        } else if (context.brandConfirmed && !context.riceWeightKg) {
          onPrompt(weightOptionsPrompt);
        } else if (!context.riceBrand && context.riceWeightKg) {
          onPrompt(
            `量は${context.riceWeightKg}kgですね。銘柄は何をご希望ですか？`
          );
        } else {
          onPrompt("銘柄（例: コシヒカリ）と量（例: 5kg）を教えてください。");
        }
        startSilenceTimer();
        break;
      }

      case "ST_ProductSuggestion": {
        // ★ここが最大の修正点：商品を確定し、次（在庫→価格→住所…）へ繋ぐ
        if (!context.riceBrand || !context.riceWeightKg) {
          return enterState("ST_RequirementCheck");
        }
        // category は銘柄で固定し、重さ一致SKUを優先
        context.category = context.riceBrand;
        const picked =
          selectRiceProduct(context.riceBrand, context.riceWeightKg) ||
          pickProduct(catalog, context.category, context.suggestedProductIds);
        if (!picked) {
          context.closingReason = "error";
          onPrompt("該当商品が見つかりませんでした。申し訳ございません。失礼いたします。");
          return enterState("ST_Closing");
        }
        context.product = picked;
        if (context.product.description) {
          context.riceNote = context.product.description;
        }
        onInquiryUpdate({
          brand: context.riceBrand,
          weightKg: context.riceWeightKg,
          deliveryAddress: context.address,
          deliveryDate: context.deliveryDate,
          note: context.riceNote,
        });

        onPrompt(
          `かしこまりました。${context.riceBrand}${context.riceWeightKg}kgですね。おすすめは「${context.product.name}」です。在庫と価格を確認します。`
        );

        // 次へ
        return enterState("ST_StockCheck");
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
            // ★在庫なし：同一商品を避けて再提案
            context.suggestedProductIds.push(context.product.id);
            context.product = undefined;
            onPrompt(
              "申し訳ございません、在庫がありませんでした。別の商品をお探しします。"
            );
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
        const priceText =
          context.currency === "JPY"
            ? `${context.price}円`
            : `${context.price} ${context.currency}`;
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
          const delivery = await toolClient.getDeliveryDate(
            context.product.id,
            context.address
          );
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
        if (!context.product || context.price == null || !context.deliveryDate) {
          context.closingReason = "error";
          onPrompt("注文内容が取得できませんでした。失礼いたします。");
          return enterState("ST_Closing");
        }
        if (!context.customerPhone) {
          onPrompt("確認のためお電話番号をもう一度お知らせいただけますか？");
          startSilenceTimer();
          return;
        }
        const priceText =
          context.currency === "JPY"
            ? `${context.price}円`
            : `${context.price} ${context.currency}`;
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

  const flushGreetingQueue = async () => {
    if (!pendingTranscripts.length) return;
    const queued = pendingTranscripts.splice(0, pendingTranscripts.length);
    for (const item of queued) {
      await handleUserTranscript(item.text, item.confidence);
    }
  };

  const exitGreetingIfNeeded = async () => {
    if (state !== "ST_Greeting") return;
    skipRequirementPromptOnce = true;
    await enterState("ST_RequirementCheck");
    await flushGreetingQueue();
  };

  const resetAllForCorrection = async () => {
    context.product = undefined;
    context.price = undefined;
    context.currency = undefined;
    context.deliveryDate = undefined;
    context.address = undefined;
    context.addressConfirmed = false;
    context.awaitingAddressConfirm = false;

    context.category = undefined;
    context.awaitingCategoryConfirm = false;

    context.riceBrand = undefined;
    context.riceWeightKg = undefined;
    context.riceMilling = undefined;
    context.riceNote = undefined;

    context.awaitingBrandConfirm = false;
    context.awaitingWeightChoice = false;
    context.awaitingMillingChoice = false;
    context.brandConfirmed = false;

    context.customerPhone = undefined;
    context.orderId = undefined;

    context.suggestedProductIds = [];
    context.deliveryRetries = 0;
    context.orderRetries = 0;
    await enterState("ST_RequirementCheck");
  };

  const handleUserTranscript = async (text: string, confidence: number | null) => {
    if (state === "ST_Greeting") {
      pendingTranscripts.push({ text, confidence });
      onLog("transcript.queued", { text });
      return;
    }

    const normalized = normalizeText(text);
    if (!normalized) return;

    // ★住所・電話は非日本語/短文でも通す（米要件は従来通りフィルタ）
    const allowFreeText =
      state === "ST_AddressConfirm" ||
      (state === "ST_OrderConfirmation" && !context.customerPhone);

    if (!allowFreeText && shouldIgnoreTranscript(normalized)) {
      onLog("transcript.ignored", { text: normalized });
      return;
    }

    clearTimers();

    if (confidence != null && confidence < config.sttConfidenceThreshold) {
      onLog("stt.confidence.low", { confidence, text: normalized });
      return handleNoHearTimeout();
    }

    resetRetries();

    // correction keyword
    if (config.correctionKeywords.some((keyword) => normalized.includes(keyword))) {
      return resetAllForCorrection();
    }

    // 米関連の抽出
    const weightCandidate = extractWeightKg(normalized);
    const brandCandidate = extractRiceBrand(normalized);
    const hasInfo = Boolean(weightCandidate != null || brandCandidate);

    // 住所/電話は allowFreeText なのでここはスキップ
    if (!allowFreeText && !hasInfo && !isJapaneseLike(normalized)) {
      onLog("transcript.skip_non_japanese", { text: normalized });
      return;
    }

    // milling（現状フロー未接続だが、将来用に拾う）
    const milling = extractMilling(normalized);
    if (milling) context.riceMilling = milling;

    // ─────────────────────────────────────────
    // Brand confirm flow
    // ─────────────────────────────────────────
    if (context.awaitingBrandConfirm && context.riceBrand) {
      if (isYes(normalized)) {
        context.awaitingBrandConfirm = false;
        context.brandConfirmed = true;
        context.awaitingWeightChoice = true;

        // 同発話で「10kg」などが入った場合
        if (
          weightCandidate != null &&
          allowedRiceWeights.includes(weightCandidate as any)
        ) {
          context.riceWeightKg = weightCandidate;
          context.awaitingWeightChoice = false;
          context.category = context.riceBrand;
          onInquiryUpdate({
            brand: context.riceBrand,
            weightKg: context.riceWeightKg,
            deliveryAddress: context.address,
            deliveryDate: context.deliveryDate,
            note: context.riceNote,
          });
          return enterState("ST_ProductSuggestion");
        }

        onPrompt(weightOptionsPrompt);
        startSilenceTimer();
        return;
      }

      if (isNo(normalized)) {
        context.riceBrand = undefined;
        context.brandConfirmed = false;
        context.awaitingBrandConfirm = false;
        onPrompt("承知いたしました。銘柄を教えてください。");
        startSilenceTimer();
        return;
      }

      // YES/NOじゃなくても、重さが取れたら進める
      if (
        weightCandidate != null &&
        allowedRiceWeights.includes(weightCandidate as any)
      ) {
        context.awaitingBrandConfirm = false;
        context.brandConfirmed = true;
        context.awaitingWeightChoice = false;
        context.riceWeightKg = weightCandidate;
        context.category = context.riceBrand;
        onInquiryUpdate({
          brand: context.riceBrand,
          weightKg: context.riceWeightKg,
          deliveryAddress: context.address,
          deliveryDate: context.deliveryDate,
          note: context.riceNote,
        });
        return enterState("ST_ProductSuggestion");
      }

      onPrompt(`「${context.riceBrand}」でよろしいですか？`);
      startSilenceTimer();
      return;
    }

    // ─────────────────────────────────────────
    // Weight choice flow
    // ─────────────────────────────────────────
    if (context.awaitingWeightChoice) {
      if (
        weightCandidate != null &&
        allowedRiceWeights.includes(weightCandidate as any)
      ) {
        context.riceWeightKg = weightCandidate;
        context.awaitingWeightChoice = false;
        if (context.riceBrand) context.category = context.riceBrand;

        onInquiryUpdate({
          brand: context.riceBrand,
          weightKg: context.riceWeightKg,
          deliveryAddress: context.address,
          deliveryDate: context.deliveryDate,
          note: context.riceNote,
        });
        return enterState("ST_ProductSuggestion");
      }

      onPrompt(weightOptionsPrompt);
      startSilenceTimer();
      return;
    }

    // ─────────────────────────────────────────
    // Extract brand
    // ─────────────────────────────────────────
    if (brandCandidate) {
      context.riceBrand = brandCandidate.brand;
      context.brandConfirmed = false;
      context.awaitingBrandConfirm = true;

      // 「銘柄確定」前は重さを一旦クリア（既存挙動を踏襲）
      context.riceWeightKg = undefined;
      context.awaitingWeightChoice = false;

      onInquiryUpdate({
        brand: context.riceBrand,
        weightKg: context.riceWeightKg,
        deliveryAddress: context.address,
        deliveryDate: context.deliveryDate,
        note: context.riceNote,
      });

      onPrompt(`「${context.riceBrand}」でよろしいですか？`);
      startSilenceTimer();
      return;
    }

    // ─────────────────────────────────────────
    // Extract weight (brand not found)
    // ─────────────────────────────────────────
    if (weightCandidate != null) {
      // ★ここも改善：重さは保持して次の質問へ
      if (isValidWeightKg(weightCandidate)) {
        context.riceWeightKg = weightCandidate;
      }
      onPrompt("銘柄を教えてください。");
      startSilenceTimer();
      return;
    }

    // ─────────────────────────────────────────
    // State-specific handling
    // ─────────────────────────────────────────
    if (!hasInfo) {
      if (state === "ST_RequirementCheck") {
        if (context.noHearRetries === 0) {
          context.noHearRetries += 1;
          onPrompt("銘柄（例: コシヒカリ）と量（例: 5kg）を教えてください。");
          startSilenceTimer();
          return;
        }
        if (greetingPattern.test(normalized)) {
          onPrompt("はい、聞こえています。お米の銘柄と量を教えてください。");
          startSilenceTimer();
          return;
        }
        onPrompt("銘柄（例: コシヒカリ）と量（例: 5kg）を教えてください。");
        startSilenceTimer();
        return;
      }

      if (state === "ST_ProductSuggestion") {
        // ここは商品確定→次状態へが enterState 側で走るので基本無処理
        return;
      }

      if (state === "ST_PriceQuote") {
        if (isYes(normalized)) return enterState("ST_AddressConfirm");
        if (isNo(normalized)) return enterState("ST_ProductSuggestion");
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
        }

        if (!context.address) {
          context.address = normalized; // ★非日本語も通る
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

        // address があるのに awaiting でないケースは再確認へ
        context.awaitingAddressConfirm = true;
        onPrompt(`配送先は${context.address}でよろしいでしょうか？`);
        startSilenceTimer();
        return;
      }

      if (state === "ST_DeliveryCheck") {
        if (isYes(normalized)) return enterState("ST_OrderConfirmation");
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
          // ★電話番号は非日本語も通す
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

      // その他：情報なしは軽く促す（元ロジック踏襲）
      if (state === "ST_RequirementCheck") {
        onPrompt("銘柄（例: コシヒカリ）と量（例: 5kg）を教えてください。");
        startSilenceTimer();
        return;
      }

      onLog("transcript.noinfo", { text: normalized, state });
      return;
    }
  };

  const handleSaveOrder = async () => {
    if (
      !context.product ||
      context.price == null ||
      !context.deliveryDate ||
      !context.customerPhone
    ) {
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
      void exitGreetingIfNeeded();
    },

    onSpeechStarted: () => {
      waitingForCommit = true;
      if (silenceTimer) clearTimeout(silenceTimer);
      if (noHearTimer) clearTimeout(noHearTimer);
    },

    onSpeechStopped: () => {
      // commit が必ず来る前提ならこのままでもOK。
      // 実装によって commit が来ない場合は waitingForCommit を戻す設計も検討。
      if (!waitingForCommit && config.noHearAutoPromptEnabled) {
        startNoHearTimer();
      }
    },

    onAssistantStart: () => {
      clearTimers();
    },

    onAssistantDone: () => {
      if (state === "ST_Greeting") {
        void exitGreetingIfNeeded().catch((err) =>
          onLog("state.transition.failed", err)
        );
        return;
      }
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
