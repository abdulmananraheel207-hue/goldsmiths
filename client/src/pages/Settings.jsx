import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Upload, Download, PlugZap, Store, Coins, FileCheck2, DatabaseBackup, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '@/lib/api.js';
import { useSettings } from '@/lib/hooks.js';
import { useAuth } from '@/context/AuthContext.jsx';
import { Button, Card, Field, Input, NumberInput, Select, Textarea, PageHeader, Loading, ErrorState, Badge, useToast } from '@/components/ui';

const TABS = [
  { key: 'shop', label: 'Shop Information', icon: Store },
  { key: 'defaults', label: 'Gold & Tax Defaults', icon: Coins },
  { key: 'tax', label: 'Tax Integration', icon: FileCheck2 },
  { key: 'backup', label: 'Backup', icon: DatabaseBackup },
  { key: 'security', label: 'Security', icon: ShieldCheck },
];

function useSaveSettings() {
  const toast = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.put('/settings', body),
    onSuccess: (d) => {
      toast.success(d.message);
      qc.setQueryData(['settings'], d.settings);
      qc.invalidateQueries({ queryKey: ['gold-rate'] });
    },
    onError: (e) => toast.error(e.message),
  });
}

function pick(obj, keys) {
  return Object.fromEntries(keys.map((k) => [k, obj[k] ?? '']));
}

function ShopTab({ settings }) {
  const keys = ['shop_name', 'shop_address', 'shop_phone', 'shop_email', 'ntn', 'stn'];
  const [form, setForm] = useState(pick(settings, keys));
  const save = useSaveSettings();
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const upload = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('logo', file);
    setUploading(true);
    try {
      const d = await api.upload('/settings/logo', fd);
      toast.success(d.message);
      qc.invalidateQueries({ queryKey: ['settings'] });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const removeLogo = async () => {
    await api.del('/settings/logo');
    toast.success('Logo removed.');
    qc.invalidateQueries({ queryKey: ['settings'] });
  };

  return (
    <Card title="Shop Information">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(form);
        }}
        className="max-w-2xl space-y-5"
        noValidate
      >
        <Input label="Shop name" required value={form.shop_name} onChange={set('shop_name')} error={save.error?.errors?.shop_name} />
        <Textarea label="Address" value={form.shop_address} onChange={set('shop_address')} placeholder="Shop number, market, city" />
        <Input label="Phone" value={form.shop_phone} onChange={set('shop_phone')} placeholder="042-1234567" />
        <Input label="Email" type="email" value={form.shop_email} onChange={set('shop_email')} error={save.error?.errors?.shop_email} />
        <Input label="NTN (National Tax Number)" value={form.ntn} onChange={set('ntn')} />
        <Input label="STN (Sales Tax Number)" value={form.stn} onChange={set('stn')} />
        <div className="space-y-2">
          <p className="text-[14px] font-semibold">Logo (shown on invoices)</p>
          <div className="flex flex-wrap items-center gap-4">
            {settings.logo_path ? (
              <img src={settings.logo_path} alt="Shop logo" className="h-20 w-20 rounded-xl border border-line object-contain" />
            ) : (
              <span className="text-ink-soft">No logo uploaded.</span>
            )}
            <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => upload(e.target.files[0])} />
            <Button variant="secondary" icon={Upload} loading={uploading} onClick={() => fileRef.current?.click()}>
              {settings.logo_path ? 'Change logo' : 'Upload logo'}
            </Button>
            {settings.logo_path && (
              <Button variant="danger" icon={Trash2} onClick={removeLogo}>
                Remove logo
              </Button>
            )}
          </div>
          <p className="text-[13px] text-ink-soft">PNG, JPG or WEBP, under 2 MB.</p>
        </div>
        <Button type="submit" icon={Save} size="lg" loading={save.isPending}>
          Save shop information
        </Button>
      </form>
    </Card>
  );
}

function DefaultsTab({ settings }) {
  const keys = ['grams_per_tola', 'tax_percent', 'pos_service_fee', 'card_fee_percent', 'invoice_prefix', 'invoice_footer_note'];
  const [form, setForm] = useState(() => {
    const f = pick(settings, keys);
    keys.slice(0, 4).forEach((k) => (f[k] = String(f[k])));
    return f;
  });
  const save = useSaveSettings();
  const err = save.error?.errors || {};
  const setN = (k) => (v) => setForm({ ...form, [k]: v });
  return (
    <Card title="Gold & Tax Defaults">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(form);
        }}
        className="max-w-2xl space-y-5"
        noValidate
      >
        <NumberInput
          label="Grams in one tola"
          decimals={4}
          value={form.grams_per_tola}
          onChange={setN('grams_per_tola')}
          error={err.grams_per_tola}
          hint="Standard is 11.6638. Changes apply the next time you add the daily gold price."
        />
        <NumberInput label="Tax (GST) percent" value={form.tax_percent} onChange={setN('tax_percent')} error={err.tax_percent} hint="Charged on the sub total after discount." />
        <NumberInput label="POS service fee (Rs)" value={form.pos_service_fee} onChange={setN('pos_service_fee')} error={err.pos_service_fee} hint="Added to every sale." />
        <NumberInput label="Card fee percent" value={form.card_fee_percent} onChange={setN('card_fee_percent')} error={err.card_fee_percent} hint="Only added when the customer pays by card. 0 means no fee." />
        <Input
          label="Invoice number prefix"
          value={form.invoice_prefix}
          onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value })}
          error={err.invoice_prefix}
          hint={`Invoices will look like ${form.invoice_prefix || ''}000123. Numbers are never reused.`}
        />
        <Textarea
          label="Invoice footer note"
          value={form.invoice_footer_note}
          onChange={(e) => setForm({ ...form, invoice_footer_note: e.target.value })}
          hint="Printed at the bottom of every invoice."
        />
        <Button type="submit" icon={Save} size="lg" loading={save.isPending}>
          Save defaults
        </Button>
      </form>
    </Card>
  );
}

function TaxTab({ settings }) {
  const t = settings.tax_integration;
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    authority: t.authority || 'FBR',
    pos_id: t.pos_id || '',
    pntn: t.pntn || '',
    default_pct_code: t.default_pct_code || '',
    endpoint_url: t.endpoint_url || '',
    environment: t.environment || 'sandbox',
    auto_upload: t.auto_upload !== false,
  });
  const [token, setToken] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(Boolean(t.endpoint_url));
  const [testResult, setTestResult] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const isPra = form.authority === 'PRA';
  const portal = isPra
    ? { name: 'PRA', url: 'https://reg.pra.punjab.gov.pk/', email: 'eims@pra.punjab.gov.pk' }
    : { name: 'FBR', url: 'https://iris.fbr.gov.pk/', email: null };

  const save = useMutation({
    mutationFn: () => api.put('/settings/tax-integration', { ...form, ...(token ? { token } : {}) }),
    onSuccess: (d) => {
      toast.success(d.message);
      setToken('');
      qc.setQueryData(['settings'], d.settings);
    },
    onError: (e) => toast.error(e.message),
  });
  const test = useMutation({
    mutationFn: () => api.post('/settings/tax-integration/test'),
    onSuccess: setTestResult,
    onError: (e) => toast.error(e.message),
  });
  const err = save.error?.errors || {};

  return (
    <Card
      title="Tax Integration (invoice posting)"
      actions={t.is_configured ? <Badge tone="success">Ready</Badge> : <Badge tone="warn">Not configured</Badge>}
    >
      <div className="mb-5 rounded-lg border border-gold-200 bg-gold-50 px-4 py-3 text-[14px]">
        <p className="font-semibold">
          Register this POS at the{' '}
          <a href={portal.url} target="_blank" rel="noreferrer" className="text-gold-700 underline">
            {portal.name} portal
          </a>{' '}
          to get your POS ID and Bearer token, then paste them below.
        </p>
        <p className="mt-1 text-ink-soft">
          Gold jewellery is a sale of <strong>goods</strong>, so it is normally reported to <strong>FBR</strong>. PRA (Punjab) is for services such as
          restaurants. Ask your tax advisor if unsure.
        </p>
        {!t.is_configured && t.missing?.length > 0 && <p className="mt-1 text-warn-700">Still needed: {t.missing.join(', ')}.</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="space-y-4"
        noValidate
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Tax authority"
            value={form.authority}
            onChange={set('authority')}
            options={[
              { value: 'FBR', label: 'FBR (federal sales tax on goods)' },
              { value: 'PRA', label: 'PRA (Punjab sales tax on services)' },
            ]}
          />
          <Select
            label="Environment"
            value={form.environment}
            onChange={set('environment')}
            options={[
              { value: 'sandbox', label: 'Sandbox (testing)' },
              { value: 'production', label: 'Production (real invoices)' },
            ]}
            hint="Production needs this computer's IP address approved by the tax authority."
          />
          <Input
            label="POS ID"
            required
            inputMode="numeric"
            placeholder="e.g. 12345678"
            value={form.pos_id}
            onChange={(e) => setForm({ ...form, pos_id: e.target.value.replace(/\D/g, '') })}
            error={err.pos_id}
            hint={`Numeric POS ID assigned by ${form.authority}. Also printed on invoices.`}
          />
          {isPra ? (
            <Input
              label="PNTN (Punjab NTN)"
              required
              placeholder="e.g. 1234567-8"
              value={form.pntn}
              onChange={set('pntn')}
              error={err.pntn}
              hint="Format: XXXXXXX-X"
            />
          ) : (
            <Input label="Seller NTN" value={settings.ntn || ''} readOnly hint="Taken from Shop Information." />
          )}
          <Input
            label="Default PCT code"
            required
            placeholder="e.g. 7113.1910"
            value={form.default_pct_code}
            onChange={set('default_pct_code')}
            error={err.default_pct_code}
            hint="HS classification code sent with every item. Confirm the right code for gold jewellery with your tax advisor."
          />
          <div className="flex items-end">
            <label className="flex min-h-[40px] w-full cursor-pointer items-center gap-3 rounded-lg border border-line px-3 text-[14px]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-gold-500"
                checked={form.auto_upload}
                onChange={(e) => setForm({ ...form, auto_upload: e.target.checked })}
              />
              <span className="font-medium">Upload invoices automatically when a sale is saved</span>
            </label>
          </div>
        </div>

        <Field label="Bearer token" required hint={`Unique token provided by ${form.authority} for API authentication. Stored encrypted and never shown again.`}>
          <textarea
            rows={2}
            autoComplete="off"
            spellCheck={false}
            className="field-input py-2 font-mono text-[13px]"
            placeholder={t.has_token ? `Saved (${t.token_masked}). Paste a new one only to replace it.` : 'Paste your Bearer token here…'}
            value={token}
            onChange={(e) => setToken(e.target.value.trim())}
          />
        </Field>

        <div>
          <button type="button" className="text-[13px] font-medium text-gold-700 underline" onClick={() => setShowAdvanced((s) => !s)}>
            {showAdvanced ? 'Hide' : 'Show'} advanced: API address
          </button>
          {showAdvanced && (
            <Input
              className="mt-2"
              label="Custom API address (optional)"
              placeholder={t.effective_endpoint}
              value={form.endpoint_url}
              onChange={set('endpoint_url')}
              error={err.endpoint_url}
              hint="Leave empty to use the standard address for the chosen authority and environment. Only change it if the authority's documentation gives a different address."
            />
          )}
          <p className="mt-1 text-[12.5px] text-ink-faint">Sending to: {t.effective_endpoint}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" icon={Save} loading={save.isPending}>
            Save tax settings
          </Button>
          <Button variant="secondary" icon={PlugZap} loading={test.isPending} onClick={() => test.mutate()}>
            Test Connection
          </Button>
        </div>
        <p className="text-[12.5px] text-ink-faint">
          Test Connection uses the <strong>saved</strong> settings. In Sandbox it sends one clearly marked test invoice. In Production it sends
          nothing; it only checks the server can be reached.
        </p>
        {testResult && (
          <p
            className={`rounded-lg px-4 py-2 text-[14px] font-medium ${testResult.ok ? 'bg-success-50 text-success-700' : 'bg-warn-50 text-warn-700'}`}
            role="status"
          >
            {testResult.message}
          </p>
        )}
      </form>

      <div className="mt-5 rounded-lg border border-warn-100 bg-warn-50 px-4 py-3 text-[13.5px] text-warn-700">
        <p className="font-semibold">Before switching to Production</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>Register at the {portal.name} portal and complete the POS setup.</li>
          <li>
            Send the shop computer&apos;s public IP address to {form.authority} for whitelisting
            {portal.email ? ` (${portal.email})` : ''}, then wait for confirmation.
          </li>
          <li>Get the Production Bearer token (it is different from the Sandbox one).</li>
          <li>Test thoroughly in Sandbox first, then switch Environment to Production.</li>
        </ol>
      </div>
    </Card>
  );
}

function BackupTab() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      await api.download('/backup', 'backup.sql');
      toast.success('Backup downloaded. Keep it somewhere safe, like a USB drive.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Backup">
      <div className="max-w-2xl space-y-4">
        <p>
          A backup is a copy of everything: customers, items, sales, payments and settings. Download one at the end of every day and keep it on a USB
          drive or another computer.
        </p>
        <Button icon={Download} size="lg" loading={busy} onClick={download}>
          Download database backup
        </Button>
        <p className="text-ink-soft">The file ends in .sql. Your technical helper can restore it if ever needed. See README.md for automatic daily backups.</p>
      </div>
    </Card>
  );
}

function SecurityTab({ settings }) {
  const save = useSaveSettings();
  const { setAdmin, admin } = useAuth();
  const [hours, setHours] = useState(String(settings.idle_timeout_hours));
  return (
    <Card title="Security">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(
            { idle_timeout_hours: hours },
            { onSuccess: () => setAdmin({ ...admin, idle_timeout_ms: Math.round(Number(hours) * 3600 * 1000) }) },
          );
        }}
        className="max-w-2xl space-y-5"
        noValidate
      >
        <NumberInput
          label="Log out automatically after (hours of no use)"
          value={hours}
          onChange={setHours}
          error={save.error?.errors?.idle_timeout_hours}
          hint="If nobody uses the system for this long, it logs out. Default is 8 hours."
        />
        <Button type="submit" icon={Save} size="lg" loading={save.isPending}>
          Save
        </Button>
      </form>
      <div className="mt-6 max-w-2xl border-t border-line pt-6">
        <h3>Password</h3>
        <p className="mb-3 text-ink-soft">Change the password and username used to log in.</p>
        <Button variant="secondary" to="/change-password">
          Change Password
        </Button>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'shop';
  const { data, isLoading, error, refetch } = useSettings();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  return (
    <>
      <PageHeader title="Settings" subtitle="Shop details, prices, tax and backups." />
      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <nav className="flex flex-row flex-wrap gap-2 lg:flex-col" aria-label="Settings sections">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setParams({ tab: key })}
              aria-current={tab === key}
              className={`flex min-h-[38px] items-center gap-3 rounded-xl border px-4 text-left font-semibold transition-colors ${
                tab === key ? 'border-gold-500 bg-gold-50 text-gold-800' : 'border-line bg-white hover:bg-gold-50'
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden /> {label}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {isLoading ? (
            <Loading />
          ) : error ? (
            <ErrorState error={error} onRetry={refetch} />
          ) : (
            <>
              {tab === 'shop' && <ShopTab settings={data} />}
              {tab === 'defaults' && <DefaultsTab settings={data} />}
              {tab === 'tax' && <TaxTab settings={data} />}
              {tab === 'backup' && <BackupTab />}
              {tab === 'security' && <SecurityTab settings={data} />}
            </>
          )}
        </div>
      </div>
    </>
  );
}
