import fs from "node:fs";

type ToolConfig = {
  baseUrl: string;
  stockTimeoutMs: number;
  priceTimeoutMs: number;
  deliveryTimeoutMs: number;
  orderTimeoutMs: number;
  inventoryPath?: string;
};

type ToolError = Error & { status?: number };
type InventoryItem = {
  productId: string;
  available?: boolean;
  quantity?: number;
  price?: number;
  currency?: string;
  estimatedDays?: number;
};

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

const loadInventoryMap = (inventoryPath?: string) => {
  if (!inventoryPath) return new Map<string, InventoryItem>();
  if (!fs.existsSync(inventoryPath)) return new Map<string, InventoryItem>();
  try {
    const raw = fs.readFileSync(inventoryPath, "utf8");
    const list = JSON.parse(raw) as InventoryItem[];
    if (!Array.isArray(list)) return new Map<string, InventoryItem>();
    return new Map<string, InventoryItem>(
      list
        .filter((item): item is InventoryItem => Boolean(item && typeof item.productId === "string"))
        .map((item) => [item.productId, item])
    );
  } catch (err) {
    console.warn("[tools] failed to load inventory file", { inventoryPath, err });
    return new Map<string, InventoryItem>();
  }
};

const deliveryDateFromDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export const createToolClient = (config: ToolConfig) => {
  const inventoryMap = loadInventoryMap(config.inventoryPath);
  if (inventoryMap.size > 0) {
    console.log("[tools] inventory loaded", {
      count: inventoryMap.size,
      path: config.inventoryPath,
    });
  } else if (!config.baseUrl) {
    console.warn("[tools] inventory is empty and TOOL_BASE_URL is not configured");
  }
  const getInventory = (productId: string) => inventoryMap.get(productId);
  const fallbackStock = (productId: string) => {
    const item = getInventory(productId);
    if (!item) throw new Error(`Inventory not found for productId=${productId}`);
    const quantity =
      typeof item.quantity === "number"
        ? item.quantity
        : item.available
        ? 1
        : 0;
    return { available: quantity > 0, quantity };
  };
  const fallbackPrice = (productId: string) => {
    const item = getInventory(productId);
    if (!item || typeof item.price !== "number") {
      throw new Error(`Price not found for productId=${productId}`);
    }
    return { price: item.price, currency: item.currency || "JPY" };
  };
  const fallbackDeliveryDate = (productId: string) => {
    const item = getInventory(productId);
    const estimatedDays =
      item && typeof item.estimatedDays === "number" ? item.estimatedDays : 3;
    return {
      deliveryDate: deliveryDateFromDays(estimatedDays),
      estimatedDays,
    };
  };
  return {
  async getStock(productId: string) {
    if (config.baseUrl) {
      try {
        const data = await requestJson(config, "/tools/stock", { productId }, config.stockTimeoutMs);
        if (typeof data?.available === "boolean") {
          return data as { available: boolean; quantity?: number };
        }
        throw new Error("Invalid getStock response");
      } catch (err) {
        console.warn("[tools] getStock fallback", { productId, err });
      }
    }
    return fallbackStock(productId);
  },
  async getPrice(productId: string) {
    if (config.baseUrl) {
      try {
        const data = await requestJson(config, "/tools/price", { productId }, config.priceTimeoutMs);
        if (typeof data?.price === "number") {
          return data as { price: number; currency?: string };
        }
        throw new Error("Invalid getPrice response");
      } catch (err) {
        console.warn("[tools] getPrice fallback", { productId, err });
      }
    }
    return fallbackPrice(productId);
  },
  async getDeliveryDate(productId: string, address: string) {
    if (config.baseUrl) {
      try {
        const data = await requestJson(
          config,
          "/tools/delivery-date",
          { productId, address },
          config.deliveryTimeoutMs
        );
        if (typeof data?.deliveryDate === "string") {
          return data as { deliveryDate: string; estimatedDays?: number };
        }
        throw new Error("Invalid getDeliveryDate response");
      } catch (err) {
        console.warn("[tools] getDeliveryDate fallback", { productId, address, err });
      }
    }
    return fallbackDeliveryDate(productId);
  },
  async saveOrder(payload: {
    productId: string;
    price: number;
    deliveryDate: string;
    address: string;
    customerPhone: string;
    timestamp: string;
  }) {
    if (config.baseUrl) {
      try {
        const data = await requestJson(config, "/tools/orders", payload, config.orderTimeoutMs);
        if (typeof data?.orderId === "string") {
          return data as { orderId: string; status?: string };
        }
        throw new Error("Invalid saveOrder response");
      } catch (err) {
        console.warn("[tools] saveOrder fallback", { productId: payload.productId, err });
      }
    }
    return {
      orderId: `LOCAL-${Date.now()}`,
      status: "accepted",
    };
  },
  };
};
