import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/** Un parámetro de la URL como estado: `?clase=`, `?clienta=`, `?tab=`.
 *  Reemplaza la entrada del historial (no apila) y respeta los demás parámetros. */
export function useSearchParamState(key: string): [string | null, (value: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key);
  const set = useCallback(
    (next: string | null) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next) p.set(key, next);
          else p.delete(key);
          return p;
        },
        { replace: true },
      );
    },
    [key, setParams],
  );
  return [value, set];
}
