import { useEffect, useState } from "react";

/** Гасит шквал запросов к API транспортных компаний при вводе/пересчёте партии. */
export function useDebounce<T>(value: T, delay = 500): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
