import { renderHook, act } from '@testing-library/react-native';
import { useApi } from '@/hooks/useApi';
import type { ApiResponse } from '@/types';

type ApiCallReturn<T> = Promise<{ data: ApiResponse<T> }>;

function mockApi<T>(data: T): () => ApiCallReturn<T> {
  return jest.fn().mockResolvedValue({ data: { success: true, data } });
}

function mockApiError<T>(message: string): () => ApiCallReturn<T> {
  return jest.fn().mockRejectedValue({ response: { data: { message } } });
}

describe('useApi hook', () => {
  it('has correct initial state', () => {
    const { result } = renderHook(() => useApi(mockApi(null)));
    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.execute).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('sets loading true during execution, false after', async () => {
    let resolveFn!: (val: { data: ApiResponse<{ id: string }> }) => void;
    const delayedApi: () => ApiCallReturn<{ id: string }> = jest.fn(
      () => new Promise((resolve) => { resolveFn = resolve; }),
    );

    const { result } = renderHook(() => useApi(delayedApi));

    act(() => { result.current.execute(); });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveFn({ data: { success: true, data: { id: '1' } } });
    });
    expect(result.current.loading).toBe(false);
  });

  it('stores returned data on success', async () => {
    const payload = { id: '42', name: 'Yash' };
    const { result } = renderHook(() => useApi(mockApi(payload)));

    await act(async () => { await result.current.execute(); });

    expect(result.current.data).toEqual(payload);
    expect(result.current.error).toBeNull();
  });

  it('calls onSuccess callback with data', async () => {
    const onSuccess = jest.fn();
    const payload = { total: 999 };
    const { result } = renderHook(() => useApi(mockApi(payload), { onSuccess }));

    await act(async () => { await result.current.execute(); });

    expect(onSuccess).toHaveBeenCalledWith(payload);
  });

  it('sets error on failure', async () => {
    const { result } = renderHook(() => useApi(mockApiError('Server error')));

    await act(async () => { await result.current.execute(); });

    expect(result.current.error).toBe('Server error');
    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(false);
  });

  it('calls onError callback on failure', async () => {
    const onError = jest.fn();
    const apiCall: () => ApiCallReturn<null> = jest.fn().mockRejectedValue(
      new Error('Network error'),
    );
    const { result } = renderHook(() => useApi(apiCall, { onError }));

    await act(async () => { await result.current.execute(); });

    expect(onError).toHaveBeenCalledWith('Network error');
  });

  it('uses initialData before first execute', () => {
    const seed = [{ id: 'seed' }];
    const { result } = renderHook(() =>
      useApi(mockApi([] as typeof seed), { initialData: seed }),
    );
    expect(result.current.data).toEqual(seed);
  });

  it('reset restores initial state', async () => {
    const { result } = renderHook(() => useApi(mockApi({ x: 1 })));

    await act(async () => { await result.current.execute(); });
    expect(result.current.data).toEqual({ x: 1 });

    act(() => { result.current.reset(); });
    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('passes arguments to the apiCall', async () => {
    const spy = mockApi<object>({});
    const { result } = renderHook(() => useApi(spy));

    await act(async () => { await result.current.execute('arg1', { page: 2 }); });

    expect(spy).toHaveBeenCalledWith('arg1', { page: 2 });
  });
});
