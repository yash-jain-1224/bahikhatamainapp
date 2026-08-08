import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import type { ApiResponse, PaginationMeta } from '@/types';

interface UseApiOptions<T> {
  initialData?: T;
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
  immediate?: boolean;
}

interface UseApiReturn<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  execute: (...args: any[]) => Promise<T | undefined>;
  reset: () => void;
}

export function useApi<T>(
  apiCall: (...args: any[]) => Promise<{ data: ApiResponse<T> }>,
  options: UseApiOptions<T> = {},
): UseApiReturn<T> {
  const [data, setData] = useState<T | undefined>(options.initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (...args: any[]) => {
      try {
        setLoading(true);
        setError(null);
        const response = await apiCall(...args);
        const result = response.data?.data;
        setData(result as T);
        options.onSuccess?.(result as T);
        return result as T;
      } catch (err: any) {
        const message = err.response?.data?.message || err.message || 'Something went wrong';
        setError(message);
        options.onError?.(message);
        toast.error(message);
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [apiCall],
  );

  const reset = useCallback(() => {
    setData(options.initialData);
    setLoading(false);
    setError(null);
  }, []);

  return { data, loading, error, execute, reset };
}

interface UsePaginatedApiReturn<T> extends UseApiReturn<T[]> {
  meta: PaginationMeta | null;
  page: number;
  setPage: (page: number) => void;
}

export function usePaginatedApi<T>(
  apiCall: (params: any) => Promise<{ data: ApiResponse<T[]> & { meta?: PaginationMeta } }>,
  params: Record<string, any> = {},
): UsePaginatedApiReturn<T> {
  const [data, setData] = useState<T[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const execute = useCallback(
    async (...args: any[]) => {
      try {
        setLoading(true);
        setError(null);
        const response = await apiCall({ page, limit: 20, ...params, ...args[0] });
        const result = response.data?.data || [];
        setData(result);
        if (response.data?.meta) setMeta(response.data.meta);
        return result;
      } catch (err: any) {
        const message = err.response?.data?.message || 'Something went wrong';
        setError(message);
        toast.error(message);
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [apiCall, page, JSON.stringify(params)],
  );

  useEffect(() => {
    execute();
  }, [page]);

  const reset = useCallback(() => {
    setData([]);
    setMeta(null);
    setLoading(false);
    setError(null);
    setPage(1);
  }, []);

  return { data, meta, loading, error, execute, reset, page, setPage };
}
