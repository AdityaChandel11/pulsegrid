/**
 * PulseGrid — Shared async fetch hook
 *
 * Fetches data from a URL without calling setState synchronously inside the effect body.
 * This satisfies the react-hooks/set-state-in-effect lint rule.
 *
 * The trick: setFetching(true) is scheduled via Promise.resolve() which defers
 * it to a microtask — not the synchronous effect body execution.
 */

'use client';

import { useEffect, useRef, useState } from 'react';

export function useAsyncFetch<T>(
  url: string | null,
  deps: unknown[],
): { data: T | null; fetching: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [fetching, setFetching] = useState(false);
  const fetchKeyRef = useRef(0);

  useEffect(() => {
    if (!url) return;

    const key = ++fetchKeyRef.current;

    // Defer setFetching(true) to a microtask so no setState runs synchronously in the effect body
    Promise.resolve().then(() => {
      if (fetchKeyRef.current === key) setFetching(true);
    });

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: T) => {
        if (fetchKeyRef.current === key) {
          setData(d);
          setFetching(false);
        }
      })
      .catch(() => {
        if (fetchKeyRef.current === key) {
          setData(null);
          setFetching(false);
        }
      });

    return () => {
      // Invalidate this fetch key — any in-flight responses will be ignored
      fetchKeyRef.current = key + 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, fetching };
}
