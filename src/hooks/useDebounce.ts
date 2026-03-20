import { useEffect, useState } from "react";

/**
 * Debounce une valeur — le state interne ne se met à jour qu'après
 * `delay` ms sans nouvelle valeur (défaut 300ms).
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
