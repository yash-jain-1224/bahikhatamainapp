import { useState, useCallback } from 'react';
import type { ApiResponse, PaginationMeta } from '../types';

interface UseApiOptions<T> {
  initialData?: T;
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
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
        const message =
          err.response?.data?.message || err.message || 'Something went wrong';
        setError(message);
        options.onError?.(message);
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
  loadMore: () => void;
  refreshing: boolean;
  onRefresh: () => void;
}

export function usePaginatedApi<T>(
  apiCall: (
    params: any,
  ) => Promise<{ data: ApiResponse<T[]> & { meta?: PaginationMeta } }>,
  params: Record<string, any> = {},
): UsePaginatedApiReturn<T> {
  const [data, setData] = useState<T[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const execute = useCallback(
    async (...args: any[]) => {
      try {
        setLoading(true);
        setError(null);
        const currentPage = args[0]?.page || page;
        const response = await apiCall({
          page: currentPage,
          limit: 20,
          ...params,
          ...args[0],
        });
        const result = response.data?.data || [];
        if (currentPage === 1) {
          setData(result);
        } else {
          setData((prev) => [...prev, ...result]);
        }
        if (response.data?.meta) setMeta(response.data.meta);
        return result;
      } catch (err: any) {
        const message =
          err.response?.data?.message || 'Something went wrong';
        setError(message);
        return undefined;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [apiCall, page, JSON.stringify(params)],
  );

  const loadMore = useCallback(() => {
    if (meta?.hasNext && !loading) {
      const nextPage = page + 1;
      setPage(nextPage);
      execute({ page: nextPage });
    }
  }, [meta, loading, page, execute]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    execute({ page: 1 });
  }, [execute]);

  const reset = useCallback(() => {
    setData([]);
    setMeta(null);
    setLoading(false);
    setError(null);
    setPage(1);
  }, []);

  return {
    data,
    loading,
    error,
    execute,
    reset,
    meta,
    page,
    setPage,
    loadMore,
    refreshing,
    onRefresh,
  };
}
