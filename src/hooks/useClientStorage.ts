import { useSyncExternalStore } from "react";

import { getStoredEditKey, storeEditKey } from "@/lib/editKey";

function noopSubscribe() {
  return () => {};
}

function readEditKey(shareId: string): string | undefined {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("editKey");
  if (fromUrl) {
    storeEditKey(shareId, fromUrl);
    return fromUrl;
  }
  return getStoredEditKey(shareId);
}

/** Client-only edit key; server snapshot is always undefined (avoids hydration mismatch). */
export function useEditKey(shareId: string) {
  return useSyncExternalStore(
    noopSubscribe,
    () => readEditKey(shareId),
    () => undefined
  );
}

export function useOrigin() {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => ""
  );
}

/** True only after client hydration; server snapshot is always false. */
export function useIsClient() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}
