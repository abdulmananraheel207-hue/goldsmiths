import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, setUnauthorizedHandler } from '@/lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | in | out
  const [sessionNotice, setSessionNotice] = useState('');
  const qc = useQueryClient();

  const signOutLocal = useCallback(
    (notice = '') => {
      setAdmin(null);
      setStatus('out');
      setSessionNotice(notice);
      qc.clear();
    },
    [qc],
  );

  useEffect(() => {
    setUnauthorizedHandler(() => signOutLocal('Your session has ended. Please log in again.'));
    api
      .get('/auth/me')
      .then((d) => {
        setAdmin(d.admin);
        setStatus('in');
      })
      .catch(() => setStatus('out'));
  }, [signOutLocal]);

  const login = useCallback(async (username, password) => {
    const d = await api.post('/auth/login', { username, password });
    setAdmin(d.admin);
    setStatus('in');
    setSessionNotice('');
    return d.admin;
  }, []);

  const logout = useCallback(
    async (notice = '') => {
      try {
        await api.post('/auth/logout');
      } finally {
        signOutLocal(notice);
      }
    },
    [signOutLocal],
  );

  const value = useMemo(
    () => ({ admin, setAdmin, status, login, logout, sessionNotice, setSessionNotice }),
    [admin, status, login, logout, sessionNotice],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
