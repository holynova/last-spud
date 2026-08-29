/** localStorage 适配器（浏览器环境） */
import type { StorageLike } from '../domain/SaveSystem';

export function localStorageAdapter(): StorageLike {
  return {
    getItem: (k) => window.localStorage.getItem(k),
    setItem: (k, v) => window.localStorage.setItem(k, v),
    removeItem: (k) => window.localStorage.removeItem(k),
  };
}
