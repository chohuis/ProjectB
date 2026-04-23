import { writable } from 'svelte/store';

export type FieldStyle = 'digital' | 'dot' | 'retro';

function makePersistedStore<T>(key: string, initial: T) {
  let saved = initial;
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) saved = JSON.parse(raw) as T;
  } catch {}

  const store = writable<T>(saved);
  store.subscribe(val => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  });
  return store;
}

export const fieldStyleStore = makePersistedStore<FieldStyle>('fieldStyle', 'digital');
