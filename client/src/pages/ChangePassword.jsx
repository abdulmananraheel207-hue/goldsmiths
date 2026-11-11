import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { api } from '@/lib/api.js';
import { useAuth } from '@/context/AuthContext.jsx';
import { Button, Card, Input, PageHeader, useToast } from '@/components/ui';

export default function ChangePassword() {
  const { admin, setAdmin } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ current_password: '', new_username: admin?.username || '', new_password: '', confirm_password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.current_password) errs.current_password = 'Please enter your current password';
    if (form.new_username.trim().length < 3) errs.new_username = 'Username must be at least 3 characters';
    if (form.new_password && form.new_password.length < 8) errs.new_password = 'New password must be at least 8 characters';
    if (form.new_password !== form.confirm_password) errs.confirm_password = 'The two new passwords do not match';
    if (!form.new_password && form.new_username.trim() === admin?.username) errs.new_password = 'Please enter a new password or a new username';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const d = await api.post('/auth/change-password', form);
      setAdmin(d.admin);
      toast.success(d.message);
      setForm({ current_password: '', new_username: d.admin.username, new_password: '', confirm_password: '' });
    } catch (err) {
      setErrors(err.errors || {});
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Change Password" subtitle="Change the password (and, if you like, the username) used to log in." />
      <Card className="max-w-xl">
        <form onSubmit={submit} noValidate className="space-y-5">
          <Input label="Current password" type="password" autoComplete="current-password" required value={form.current_password} onChange={set('current_password')} error={errors.current_password} autoFocus />
          <Input label="Username" autoComplete="username" value={form.new_username} onChange={set('new_username')} error={errors.new_username} hint="Change this only if you want a different username." />
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={form.new_password}
            onChange={set('new_password')}
            error={errors.new_password}
            hint="Use something easy for you to remember but hard for others to guess."
          />
          <Input label="Type the new password again" type="password" autoComplete="new-password" value={form.confirm_password} onChange={set('confirm_password')} error={errors.confirm_password} />
          <Button type="submit" size="lg" icon={KeyRound} loading={busy}>
            Save new login details
          </Button>
        </form>
      </Card>
    </>
  );
}
