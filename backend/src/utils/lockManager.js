/**
 * Key-based Pessimistic Lock Manager for in-process concurrency control.
 * Implements Deadlock-free multi-key locking by enforcing ascending key ordering,
 * and manages lock queues with timeouts to avoid infinite blocking.
 */
class LockManager {
  constructor() {
    /** @type {Map<string, Promise<void>>} */
    this.locks = new Map();
  }

  /**
   * Sort keys to guarantee a deterministic lock acquisition order,
   * completely eliminating Deadlock between intersecting concurrent transactions.
   * @param {Array<string|number>} keys
   * @returns {string[]}
   */
  _normalizeAndSortKeys(keys) {
    const unique = [...new Set(keys.map(String))];
    return unique.sort((a, b) => {
      const numA = Number(a.replace(/\D/g, ""));
      const numB = Number(b.replace(/\D/g, ""));
      if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) {
        return numA - numB;
      }
      return a.localeCompare(b);
    });
  }

  /**
   * Acquire an exclusive lock on a single resource key.
   * @param {string} key
   * @param {number} timeoutMs
   * @returns {Promise<() => void>} Release function
   */
  async acquire(key, timeoutMs = 10000) {
    let release;
    let timer;

    const nextLock = new Promise((resolve) => {
      release = resolve;
    });

    const currentLock = this.locks.get(key) || Promise.resolve();
    this.locks.set(key, currentLock.then(() => nextLock));

    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Timeout (${timeoutMs}ms) waiting for lock on resource: ${key}`));
      }, timeoutMs);
    });

    try {
      await Promise.race([currentLock, timeoutPromise]);
      clearTimeout(timer);
    } catch (err) {
      clearTimeout(timer);
      release();
      throw err;
    }

    return () => {
      release();
      if (this.locks.get(key) === nextLock) {
        this.locks.delete(key);
      }
    };
  }

  /**
   * Execute a function while holding pessimistic locks on one or more resource keys.
   * Acquires all locks in ascending order to prevent deadlocks,
   * and guarantees release in reverse order even if errors occur.
   * @template T
   * @param {Array<string|number>|string|number} keys
   * @param {() => Promise<T>|T} fn
   * @param {number} [timeoutMs=10000]
   * @returns {Promise<T>}
   */
  async withLock(keys, fn, timeoutMs = 10000) {
    const keyList = Array.isArray(keys) ? keys : [keys];
    const sortedKeys = this._normalizeAndSortKeys(keyList);
    const releaseFns = [];

    try {
      for (const key of sortedKeys) {
        const unlock = await this.acquire(key, timeoutMs);
        releaseFns.push(unlock);
      }
      return await fn();
    } finally {
      // Release in reverse order of acquisition
      while (releaseFns.length > 0) {
        const unlock = releaseFns.pop();
        try {
          unlock();
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }
}

export const lockManager = new LockManager();
