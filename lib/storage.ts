import { STORAGE_KEY, type PersistedState } from "@/lib/domain";
import { parsePersisted } from "@/lib/state";

export interface DeskStore {
  read(): { state: PersistedState | null; rawError: boolean };
  write(state: PersistedState): void;
}

export function memoryStore(initial: PersistedState | null = null): DeskStore {
  let current = initial;
  return {
    read() {
      return { state: current, rawError: false };
    },
    write(state) {
      current = state;
    },
  };
}

export function subscribeBrowserStore(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("baseline-state", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("baseline-state", onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function readBrowserSnapshot(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_KEY) ?? "";
}

export function browserStore(): DeskStore {
  return {
    read() {
      if (typeof window === "undefined") return { state: null, rawError: false };
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return { state: null, rawError: false };
      try {
        const state = parsePersisted(JSON.parse(raw));
        return state ? { state, rawError: false } : { state: null, rawError: true };
      } catch {
        return { state: null, rawError: true };
      }
    },
    write(state) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      window.dispatchEvent(new Event("baseline-state"));
    },
  };
}
