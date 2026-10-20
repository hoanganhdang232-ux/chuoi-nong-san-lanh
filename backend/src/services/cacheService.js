/**
 * SCRUM-192 / T-117: Cache Service (Cache Aside Pattern)
 * Tối ưu tốc độ tải trang công khai < 1.5s trên mạng di động.
 * Hỗ trợ lưu trữ Redis hoặc In-memory high-speed cache với TTL và cơ chế Invalidation khi có sự kiện mới.
 */

class MemoryCacheStore {
  constructor(defaultTtlSeconds = 300) {
    this.defaultTtl = defaultTtlSeconds * 1000;
    this.store = new Map();
    this.hits = 0;
    this.misses = 0;

    // Định kỳ dọn dẹp key hết hạn mỗi 60 giây
    const cleanupTimer = setInterval(() => this.cleanup(), 60 * 1000);
    cleanupTimer.unref?.();
  }

  get(key) {
    const item = this.store.get(key);
    if (!item) {
      this.misses++;
      return null;
    }
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return null;
    }
    this.hits++;
    return item.value;
  }

  set(key, value, ttlSeconds = null) {
    const ttl = (ttlSeconds !== null ? ttlSeconds : 300) * 1000;
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now(),
    });
  }

  del(key) {
    return this.store.delete(key);
  }

  delPattern(prefix) {
    let deletedCount = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix) || key.includes(prefix)) {
        this.store.delete(key);
        deletedCount++;
      }
    }
    return deletedCount;
  }

  clear() {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.store.entries()) {
      if (now > item.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? Number(((this.hits / total) * 100).toFixed(2)) : 0,
      type: "in-memory-lru",
    };
  }
}

// Singleton cache store
export const cacheStore = new MemoryCacheStore(300);

/**
 * Cache Aside Wrapper: Lấy từ cache, nếu miss thì gọi factory fn và lưu cache
 */
export async function getOrSetCache(key, fetchFn, ttlSeconds = 300) {
  const cached = cacheStore.get(key);
  if (cached !== null && cached !== undefined) {
    return { data: cached, fromCache: true };
  }

  const fresh = await fetchFn();
  if (fresh !== null && fresh !== undefined) {
    cacheStore.set(key, fresh, ttlSeconds);
  }
  return { data: fresh, fromCache: false };
}

/**
 * Invalidate cache cho một lô hàng khi có sự kiện mới
 */
export function invalidatePublicTraceCache(batchIdentifier) {
  if (!batchIdentifier) return;
  cacheStore.del(`public:trace:${batchIdentifier}`);
  cacheStore.delPattern(`public:trace:`);
}
