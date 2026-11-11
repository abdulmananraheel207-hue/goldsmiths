import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext.jsx';

/** Logs out after the idle period set in Settings > Security (server enforces it too). */
export function IdleLogout() {
  const { admin, logout } = useAuth();
  const last = useRef(Date.now());
  const timeout = admin?.idle_timeout_ms || 8 * 3600 * 1000;

  useEffect(() => {
    const bump = () => (last.current = Date.now());
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - last.current > timeout) {
        logout('You were logged out because the system was not used for a while. Please log in again.');
      }
    }, 30_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(timer);
    };
  }, [timeout, logout]);

  return null;
}
