type ToolConfig = {
  baseUrl: string;
  stockTimeoutMs: number;
  priceTimeoutMs: number;
  deliveryTimeoutMs: number;
  orderTimeoutMs: number;
};

type ToolError = Error & { status?: number };

const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const requestJson = async (config: ToolConfig, path: string, body: object, timeoutMs: number) => {
  if (!config.baseUrl) {
    const error = new Error("TOOL_BASE_URL is not configured") as ToolError;
    error.status = 503;
    throw error;
  }
  const url = new URL(path, config.baseUrl).toString();
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    timeoutMs
  );
  if (!res.ok) {
    const error = new Error(`Tool request failed (${res.status})`) as ToolError;
    error.status = res.status;
    throw error;
  }
  return res.json();
};

export const createToolClient = (config: ToolConfig) => ({
  async getStock(productId: string) {
    const data = await requestJson(config, "/tools/stock", { productId }, config.stockTimeoutMs);
    if (typeof data?.available !== "boolean") {
      throw new Error("Invalid getStock response");
    }
    return data as { available: boolean; quantity?: number };
  },
  async getPrice(productId: string) {
    const data = await requestJson(config, "/tools/price", { productId }, config.priceTimeoutMs);
    if (typeof data?.price !== "number") {
      throw new Error("Invalid getPrice response");
    }
    return data as { price: number; currency?: string };
  },
  async getDeliveryDate(productId: string, address: string) {
    const data = await requestJson(
      config,
      "/tools/delivery-date",
      { productId, address },
      config.deliveryTimeoutMs
    );
    if (typeof data?.deliveryDate !== "string") {
      throw new Error("Invalid getDeliveryDate response");
    }
    return data as { deliveryDate: string; estimatedDays?: number };
  },
  async saveOrder(payload: {
    productId: string;
    price: number;
    deliveryDate: string;
    customerPhone: string;
    timestamp: string;
  }) {
    const data = await requestJson(config, "/tools/orders", payload, config.orderTimeoutMs);
    if (typeof data?.orderId !== "string") {
      throw new Error("Invalid saveOrder response");
    }
    return data as { orderId: string; status?: string };
  },
});
