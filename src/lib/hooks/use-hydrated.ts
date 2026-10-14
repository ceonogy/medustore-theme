import { useEffect, useState } from "react";

/**
 * True only after the first client render.
 *
 * Cart-derived UI must render the SSR state during hydration: the
 * nanostores atoms survive Astro ClientRouter navigations, so a store
 * already holding a cart would mismatch the fresh "(0)/empty" SSR HTML
 * of the next page and trip React's hydration error (#418). Rendering
 * the SSR value once, then the live value, keeps both renders identical.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}
