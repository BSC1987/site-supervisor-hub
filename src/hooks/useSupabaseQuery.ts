import { useCallback, useEffect, useRef, useState } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';

type SupabaseResult<T> = {
  data: T | null;
  error: PostgrestError | { message: string } | null;
};

export interface UseSupabaseQueryOptions {
  enabled?: boolean;
}

export interface UseSupabaseQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: { message: string } | null;
  refetch: () => Promise<void>;
}

export function useSupabaseQuery<T>(
  queryFn: () => PromiseLike<SupabaseResult<T>>,
  deps: ReadonlyArray<unknown> = [],
  options: UseSupabaseQueryOptions = {},
): UseSupabaseQueryResult<T> {
  const { enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<{ message: string } | null>(null);

  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;

  const cancelledRef = useRef(false);

  const run = useCallback(async () => {
    cancelledRef.current = false;
    setLoading(true);
    setError(null);
    const { data: result, error: err } = await queryFnRef.current();
    if (cancelledRef.current) return;
    if (err) {
      setError(err);
      setLoading(false);
      return;
    }
    setData(result);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    cancelledRef.current = false;
    run();
    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  return { data, loading, error, refetch: run };
}
