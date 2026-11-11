import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Gem, LogIn, Info } from 'lucide-react';
import { useAuth } from '@/context/AuthContext.jsx';
import { APP_NAME, APP_TAGLINE } from '@/lib/format.js';
import { Button, Input } from '@/components/ui';

export default function Login() {
  const { status, login, sessionNotice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', password: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (status === 'in') return <Navigate to={location.state?.from || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.username.trim()) errs.username = 'Please enter your username';
    if (!form.password) errs.password = 'Please enter your password';
    setErrors(errs);
    setMessage('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await login(form.username.trim(), form.password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_#2C313A_0%,_#0E1013_60%)] px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-gold-400/40 bg-gradient-to-br from-gold-300 to-gold-600 text-onyx-900 shadow-lift">
            <Gem className="h-8 w-8" aria-hidden />
          </div>
          <h1 className="text-[2rem] text-white">{APP_NAME}</h1>
          <p className="text-[13px] tracking-wide text-gold-300/80">{APP_TAGLINE}</p>
        </div>
        <form onSubmit={submit} className="card space-y-5 p-6" noValidate>
          <h2>Log in</h2>
          {sessionNotice && !message && (
            <p className="flex items-start gap-2 rounded-xl bg-gold-50 px-4 py-2 text-gold-800">
              <Info className="mt-1 h-5 w-5 shrink-0" aria-hidden /> {sessionNotice}
            </p>
          )}
          {message && (
            <p className="rounded-xl border border-danger-100 bg-danger-50 px-4 py-2 font-semibold text-danger-700" role="alert">
              {message}
            </p>
          )}
          <Input
            label="Username"
            autoComplete="username"
            placeholder="Enter your username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            error={errors.username}
            autoFocus
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            error={errors.password}
          />
          <Button type="submit" size="lg" icon={LogIn} loading={busy} className="w-full">
            Log in
          </Button>
        </form>
        <p className="mt-5 text-center text-[12.5px] text-white/50">
          Forgot your password? Ask the person who set up this computer to run the password reset.
        </p>
      </div>
    </div>
  );
}
