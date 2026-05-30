const prefix = "rst_editKey_";

export function getStoredEditKey(shareId: string) {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(`${prefix}${shareId}`) ?? undefined;
}

export function storeEditKey(shareId: string, editKey: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${prefix}${shareId}`, editKey);
}

export function clearEditKey(shareId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`${prefix}${shareId}`);
}
