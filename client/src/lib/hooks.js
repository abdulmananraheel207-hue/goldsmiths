import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from './api.js';

export function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** Paged + searchable list from an API endpoint. */
export function useListQuery(key, path, extraParams = {}, { pageSize = 20 } = {}) {
  const [search, setSearchRaw] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);
  const filterKey = JSON.stringify(extraParams);

  useEffect(() => {
    setPage(1);
  }, [debounced, filterKey]);

  const params = { ...extraParams, search: debounced, page, pageSize };
  const query = useQuery({
    queryKey: [key, params],
    queryFn: () => api.get(path, params),
    placeholderData: keepPreviousData,
  });

  return {
    search,
    setSearch: setSearchRaw,
    page,
    setPage,
    pageSize,
    query,
    rows: query.data?.data || [],
    total: query.data?.total || 0,
    getAllRows: async () => (await api.get(path, { ...extraParams, search: debounced, page: 1, pageSize: 10000 })).data,
  };
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings'), staleTime: 60_000 });
}

export function useCurrentRate() {
  return useQuery({ queryKey: ['gold-rate', 'current'], queryFn: () => api.get('/gold-rates/current'), staleTime: 30_000 });
}

export function useCategories(params = {}) {
  return useQuery({ queryKey: ['categories', params], queryFn: () => api.get('/categories', params) });
}
