import { useEffect, useMemo, useState } from 'react';
import { generateCSS } from '@gamut-all/core';
import type { TokenRegistry, VisionMode } from '@gamut-all/core';
import { TokenProvider, useTokenContext } from '@gamut-all/react';
import { Tooltip } from '@base-ui/react/tooltip';
import { Dialog } from '@base-ui/react/dialog';
import { Button } from '@base-ui/react/button';
import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { Separator } from '@base-ui/react/separator';

// ── Types ─────────────────────────────────────────────────────────────────────

type ThemeMode = 'light' | 'dark' | 'ambient' | 'system';
type ContrastPreference = 'auto' | 'aa' | 'aaa';
type ComplianceEngineId = 'wcag' | 'apca';
type ResolvedBg = 'light' | 'dark' | 'ambient';
type NavPage = 'Dashboard' | 'Reports' | 'Users' | 'Settings';
type Coordinates = { latitude: number; longitude: number };

const RAD = Math.PI / 180;
const J1970 = 2440588;
const J2000 = 2451545;
const J0 = 0.0009;

// ── Solar math (ambient mode) ─────────────────────────────────────────────────

function toJulian(date: Date): number {
  return (date.getTime() / 86400000) - 0.5 + J1970;
}
function fromJulian(j: number): Date {
  return new Date((j + 0.5 - J1970) * 86400000);
}
function toDays(date: Date): number {
  return toJulian(date) - J2000;
}
function solarMeanAnomaly(days: number): number {
  return RAD * (357.5291 + 0.98560028 * days);
}
function eclipticLongitude(M: number): number {
  const c = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  return M + c + RAD * 102.9372 + Math.PI;
}
function declination(lambda: number): number {
  return Math.asin(Math.sin(lambda) * Math.sin(RAD * 23.4397));
}
function julianCycle(days: number, lw: number): number {
  return Math.round(days - J0 - lw / (2 * Math.PI));
}
function approxTransit(ht: number, lw: number, n: number): number {
  return J0 + (ht + lw) / (2 * Math.PI) + n;
}
function solarTransitJ(ds: number, M: number, lambda: number): number {
  return J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * lambda);
}
function hourAngle(h: number, lat: number, decl: number): number | null {
  const cosH = (Math.sin(h) - Math.sin(lat) * Math.sin(decl)) / (Math.cos(lat) * Math.cos(decl));
  return (cosH < -1 || cosH > 1) ? null : Math.acos(cosH);
}
function getSunriseSunset(now: Date, coords: Coordinates): { sunrise: Date; sunset: Date } | null {
  const lw = -coords.longitude * RAD;
  const lat = coords.latitude * RAD;
  const days = toDays(now);
  const n = julianCycle(days, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const lambda = eclipticLongitude(M);
  const decl = declination(lambda);
  const noonJ = solarTransitJ(ds, M, lambda);
  const w = hourAngle(-0.833 * RAD, lat, decl);
  if (w === null) return null;
  const setJ = solarTransitJ(approxTransit(w, lw, n), M, lambda);
  return { sunrise: fromJulian(noonJ - (setJ - noonJ)), sunset: fromJulian(setJ) };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
function fallbackAmbientMix(now: Date): number {
  const h = now.getHours() + now.getMinutes() / 60;
  return clamp(Math.sin(((h - 6) / 12) * Math.PI), 0, 1);
}
function resolveAmbientMix(now: Date, coords: Coordinates | null): number {
  if (!coords) return fallbackAmbientMix(now);
  const sun = getSunriseSunset(now, coords);
  if (!sun) return fallbackAmbientMix(now);
  const tw = 90 * 60 * 1000;
  const t = now.getTime();
  const rise = sun.sunrise.getTime();
  const set = sun.sunset.getTime();
  if (t <= rise - tw || t >= set + tw) return 0;
  if (t >= rise + tw && t <= set - tw) return 1;
  if (t < rise + tw) return clamp((t - (rise - tw)) / (2 * tw), 0, 1);
  return clamp(((set + tw) - t) / (2 * tw), 0, 1);
}
function mixToTokenBg(mix: number): ResolvedBg {
  if (mix >= 0.66) return 'light';
  if (mix <= 0.33) return 'dark';
  return 'ambient';
}

// ── OS/preference hooks ───────────────────────────────────────────────────────

function useSystemBg(): 'light' | 'dark' {
  const [bg, setBg] = useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setBg(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return bg;
}

function usePrefersHighContrast(): boolean {
  const [hc, setHc] = useState(() =>
    window.matchMedia('(prefers-contrast: more)').matches ||
    window.matchMedia('(forced-colors: active)').matches
  );
  useEffect(() => {
    const more = window.matchMedia('(prefers-contrast: more)');
    const forced = window.matchMedia('(forced-colors: active)');
    const update = () => setHc(more.matches || forced.matches);
    more.addEventListener('change', update);
    forced.addEventListener('change', update);
    return () => { more.removeEventListener('change', update); forced.removeEventListener('change', update); };
  }, []);
  return hc;
}

function useSolarMix(enabled: boolean): number {
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [mix, setMix] = useState(() => fallbackAmbientMix(new Date()));
  useEffect(() => {
    if (!enabled || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, maximumAge: 3_600_000, timeout: 10_000 },
    );
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const update = () => setMix(resolveAmbientMix(new Date(), coords));
    update();
    const id = window.setInterval(update, 60_000);
    return () => window.clearInterval(id);
  }, [enabled, coords]);
  return mix;
}

function useAmbientBg(enabled: boolean): ResolvedBg {
  const mix = useSolarMix(enabled);
  return mixToTokenBg(mix);
}

function useRootBg(theme: ThemeMode): ResolvedBg {
  const sys = useSystemBg();
  const amb = useAmbientBg(theme === 'ambient');
  if (theme === 'system') return sys;
  if (theme === 'ambient') return amb;
  return theme;
}


// ── Icons ─────────────────────────────────────────────────────────────────────

function SunIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
function MonitorIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

// ── Shared Toggle className helpers (receive base-ui Toggle state) ────────────

const segToggle = ({ pressed }: { pressed: boolean }) =>
  [
    'flex items-center gap-[5px] py-1 px-2.5 rounded border cursor-pointer text-[12px] transition-all duration-150 hover:bg-[var(--bg-main-hover)]',
    pressed
      ? 'border-[var(--border-brand)] bg-[var(--bg-main-hover)] text-[var(--fg-main)] font-semibold'
      : 'border-transparent bg-transparent text-[var(--fg-alt)]',
  ].join(' ');

const smallToggle = ({ pressed }: { pressed: boolean }) =>
  [
    'py-[3px] px-2 rounded border cursor-pointer text-[11px] transition-all duration-150 hover:bg-[var(--bg-main-hover)]',
    pressed
      ? 'border-[var(--border-brand)] bg-[var(--bg-main-hover)] text-[var(--fg-main)] font-semibold'
      : 'border-transparent bg-transparent text-[var(--fg-alt)]',
  ].join(' ');

const pillToggle = ({ pressed }: { pressed: boolean }) =>
  [
    'py-[3px] px-[9px] rounded-full border text-[11px] cursor-pointer transition-all duration-150 hover:bg-[var(--bg-main-hover)]',
    pressed
      ? 'border-[var(--border-brand)] bg-[var(--bg-main-hover)] text-[var(--fg-brand)]'
      : 'border-[var(--border-muted)] bg-transparent text-[var(--fg-alt)]',
  ].join(' ');

// ── Theme toggle ──────────────────────────────────────────────────────────────

const THEME_OPTIONS: { value: ThemeMode; label: string; Icon: () => JSX.Element }[] = [
  { value: 'light',  label: 'Light',  Icon: SunIcon },
  { value: 'dark',   label: 'Dark',   Icon: MoonIcon },
  { value: 'system', label: 'System', Icon: MonitorIcon },
];

function ThemeToggle({ theme, onChange }: { theme: ThemeMode; onChange: (t: ThemeMode) => void }) {
  return (
    <ToggleGroup
      value={[theme]}
      onValueChange={(vals) => { const next = vals[0] as ThemeMode; if (next) onChange(next); }}
      className="flex bg-[var(--bg-main)] rounded-lg p-[3px] gap-0.5 border border-[var(--border-muted)]"
    >
      {THEME_OPTIONS.map(({ value, label, Icon }) => (
        <Toggle key={value} value={value} title={label} className={segToggle}>
          <Icon />{label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

// ── Engine toggle ─────────────────────────────────────────────────────────────

function EngineToggle({ engineId, onChange }: { engineId: ComplianceEngineId; onChange: (e: ComplianceEngineId) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[var(--fg-nav-decorative)] text-[11px]">Engine:</span>
      <ToggleGroup
        value={[engineId]}
        onValueChange={(vals) => { const next = vals[0] as ComplianceEngineId; if (next) onChange(next); }}
        className="flex bg-[var(--bg-main)] rounded-[7px] p-0.5 gap-0.5 border border-[var(--border-muted)]"
      >
        {(['wcag', 'apca'] as ComplianceEngineId[]).map((opt) => (
          <Toggle key={opt} value={opt} className={smallToggle}>
            {opt.toUpperCase()}
          </Toggle>
        ))}
      </ToggleGroup>
    </div>
  );
}

// ── Contrast toggle ───────────────────────────────────────────────────────────

function ContrastToggle({ preference, onChange }: { preference: ContrastPreference; onChange: (p: ContrastPreference) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[var(--fg-nav-decorative)] text-[11px]">Contrast:</span>
      <ToggleGroup
        value={[preference]}
        onValueChange={(vals) => { const next = vals[0] as ContrastPreference; if (next) onChange(next); }}
        className="flex bg-[var(--bg-main)] rounded-[7px] p-0.5 gap-0.5 border border-[var(--border-muted)]"
      >
        {(['aa', 'aaa'] as ContrastPreference[]).map((opt) => (
          <Toggle key={opt} value={opt} className={smallToggle}>
            {opt.toUpperCase()}
          </Toggle>
        ))}
      </ToggleGroup>
    </div>
  );
}

// ── Vision toggle ─────────────────────────────────────────────────────────────

const CVD_VISION_OPTIONS: Array<{ value: VisionMode; label: string }> = [
  { value: 'default',              label: 'Trichromacy / Normal' },
  { value: 'blueConeMonochromacy', label: 'Blue Cone Monochromacy' },
  { value: 'achromatopsia',        label: 'Monochromacy / Achromatopsia' },
  { value: 'deuteranomaly',        label: 'Green-Weak / Deuteranomaly' },
  { value: 'deuteranopia',         label: 'Green-Blind / Deuteranopia' },
  { value: 'protanomaly',          label: 'Red-Weak / Protanomaly' },
  { value: 'protanopia',           label: 'Red-Blind / Protanopia' },
  { value: 'tritanomaly',          label: 'Blue-Weak / Tritanomaly' },
  { value: 'tritanopia',           label: 'Blue-Blind / Tritanopia' },
];

function VisionToggle() {
  const { visionMode, setVisionMode } = useTokenContext();
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[var(--fg-nav-decorative)] text-[11px]">Vision:</span>
      <select
        value={visionMode}
        onChange={(e) => setVisionMode(e.target.value as VisionMode)}
        className="bg-[var(--bg-main)] border border-[var(--border-muted)] text-[var(--fg-main)] text-[11px] rounded-[7px] py-[3px] px-2 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[var(--focus-brand)]"
      >
        {CVD_VISION_OPTIONS.map(({ value, label }) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

const NAV_ITEMS: { page: NavPage }[] = [
  { page: 'Dashboard' },
  { page: 'Reports' },
  { page: 'Users' },
  { page: 'Settings' },
];

const navToggle = ({ pressed }: { pressed: boolean }) =>
  [
    'flex w-full text-left py-2 px-2.5 rounded-[7px] border text-[13px] cursor-pointer transition-all duration-150 hover:bg-[var(--bg-main-hover)]',
    pressed
      ? 'border-[var(--border-muted)] bg-[var(--bg-main-hover)] text-[var(--fg-nav-main)] font-semibold'
      : 'border-transparent bg-transparent text-[var(--fg-nav-decorative)]',
  ].join(' ');

function Sidebar({
  activePage,
  onNavChange,
}: {
  activePage: NavPage;
  onNavChange: (p: NavPage) => void;
}) {
  return (
    <nav
      data-stack="nav"
      className="bg-[var(--bg-surface)] w-48 shrink-0 py-5 px-2.5 flex flex-col border-r border-[var(--border-muted)]"
    >
      <div className="text-[var(--fg-nav-accent)] font-extrabold text-[15px] tracking-[-0.02em] px-2 pb-4">
        ACME Co.
      </div>
      <Separator className="h-px bg-[var(--border-muted)] mb-2" />

      <ToggleGroup
        value={[activePage]}
        onValueChange={(vals) => { const next = vals[0] as NavPage; if (next) onNavChange(next); }}
        orientation="vertical"
        className="flex flex-col gap-0.5"
      >
        {NAV_ITEMS.map(({ page }) => (
          <Toggle key={page} value={page} className={navToggle}>
            {page}
          </Toggle>
        ))}
      </ToggleGroup>
    </nav>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function TokenSwatch({ varName, label }: { varName: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-[7px]">
      <div
        className="w-[26px] h-[26px] rounded border border-[var(--border-main)] shrink-0"
        style={{ background: `var(${varName})` }}
      />
      <div>
        <div className="text-[var(--fg-main)] text-[12px] font-medium">{label}</div>
        <div className="text-[var(--fg-decorative)] text-[10px] font-mono">{varName}</div>
      </div>
    </div>
  );
}

// ── Tooltip (base-ui) ─────────────────────────────────────────────────────────

function AppTooltip({ children, content }: { children: React.ReactNode; content: React.ReactNode }) {
  const { visionMode } = useTokenContext();
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={<span className="inline-block" />}>
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner className="z-[200]" data-vision={visionMode}>
          <Tooltip.Popup
            data-stack="tooltip"
            className="bg-[var(--bg-surface)] border border-[var(--border-muted)] rounded-lg px-3 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.15)] whitespace-nowrap text-sm"
          >
            {content}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

// ── Shared panel class ────────────────────────────────────────────────────────

const PANEL = 'bg-[var(--bg-surface)] rounded-[10px] p-[18px] border border-[var(--border-muted)]';

function textOn(surfaceHex: string): string {
  const r = parseInt(surfaceHex.slice(1, 3), 16);
  const g = parseInt(surfaceHex.slice(3, 5), 16);
  const b = parseInt(surfaceHex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? '#f8fafc' : '#0f172a';
}

// ── Alert row ─────────────────────────────────────────────────────────────────

function AlertRow({ type, message }: { type: 'success' | 'error' | 'info'; message: string }) {
  const dotCls = { success: 'text-[var(--fg-success)]', error: 'text-[var(--fg-danger)]', info: 'text-[var(--fg-info)]' }[type];
  const borderCls = { success: 'border-l-[var(--border-success)]', error: 'border-l-[var(--border-danger)]', info: 'border-l-[var(--border-info)]' }[type];
  const bgCls = { success: 'bg-[var(--bg-success-muted)]', error: 'bg-[var(--bg-danger-muted)]', info: 'bg-[var(--bg-info-muted)]' }[type];
  return (
    <div className={`flex items-start gap-2.5 py-[9px] px-3 rounded-[7px] border border-[var(--border-muted)] border-l-4 ${borderCls} ${bgCls} mb-[7px]`}>
      <span className={`${dotCls} text-[10px] mt-0.5`}>●</span>
      <span className="text-[var(--fg-main)] text-[13px]">{message}</span>
    </div>
  );
}

// ── Size contrast panel ───────────────────────────────────────────────────────

function SizeContrastPanel({ registry, bg, engineId }: { registry: TokenRegistry; bg: ResolvedBg; engineId: ComplianceEngineId }) {
  const surfaceHex = registry.themes.get(bg)?.surfaces.get('root')?.hex ?? '#f1f5f9';
  const labelColor = textOn(surfaceHex);

  const sizes: Array<{ key: string; label: string; note: string }> = [
    {
      key: `fgDecorative__20px__${bg}__root__default`,
      label: '20px',
      note: engineId === 'apca' ? 'normal text · Lc ≥ 60 (AA)' : 'normal text · needs 4.5:1',
    },
    {
      key: `fgDecorative__24px__${bg}__root__default`,
      label: '24px',
      note: engineId === 'apca' ? 'large text  · Lc ≥ 45 (AA)' : 'large text  · needs 3:1',
    },
  ];

  const variants = sizes.map(({ key, label, note }) => ({
    label,
    note,
    variant: registry.variantMap.get(key as Parameters<typeof registry.variantMap.get>[0]),
  }));

  return (
    <div className={`${PANEL} mb-[14px]`}>
      <div className="text-[var(--fg-main)] font-semibold text-[13px] mb-1">
        Size-Dependent Contrast
      </div>
      <div className="text-[var(--fg-decorative)] text-[11px] leading-relaxed mb-[14px]">
        {engineId === 'apca'
          ? <>APCA uses perceptual Lc scores — ≥ 60 for normal text (&lt;24px), ≥ 45 for large text (≥24px) at AA.
             The same token (<code className="text-[var(--fg-brand)] font-mono">fgDecorative</code>) auto-selects
             a different step per size to meet each threshold.</>
          : <>WCAG 2.1 requires 4.5:1 for text under 24px but only 3:1 at 24px and above.
             The same token (<code className="text-[var(--fg-brand)] font-mono">fgDecorative</code>, step 5 preferred)
             resolves to a different color depending on font size — automatically.</>
        }
      </div>

      <div className="flex gap-2">
        {variants.map(({ label, note, variant }) => {
          if (!variant) return null;
          const { hex, step, compliance: { value, pass, metric } } = variant;
          const complianceText = metric === 'apca-lc'
            ? `Lc ${value.toFixed(1)}`
            : `${value.toFixed(2)}:1`;
          return (
            <div key={label} className="rounded-lg p-[14px] px-4 border border-[var(--border-muted)]" style={{ background: surfaceHex }}>
              <div className="font-mono text-[9px] opacity-55 mb-2.5" style={{ color: labelColor }}>{note}</div>
              <div className="leading-none mb-2.5 font-medium" style={{ color: hex, fontSize: parseInt(label) }}>
                Ag
              </div>
              <div className="flex flex-col gap-0.5">
                <code className="font-mono text-[9px] opacity-60" style={{ color: labelColor }}>{hex} · step {step}</code>
                <code className={`font-mono text-[9px] ${pass ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>{complianceText} {pass ? '✓' : '✗'}</code>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Pages ─────────────────────────────────────────────────────────────────────

function DashboardPage({ registry, bg, engineId }: { registry: TokenRegistry; bg: ResolvedBg; engineId: ComplianceEngineId }) {
  const [modalOpen, setModalOpen] = useState(false);
  const { visionMode } = useTokenContext();
  return (
    <>
      <div className="mb-6">
        <h1 className="text-[var(--fg-main)] text-[22px] font-bold mb-1">Dashboard</h1>
        <p className="text-[var(--fg-alt)] text-[13px]">
          Welcome back. Here's what's happening at ACME Co.
        </p>
      </div>

      <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))' }}>
        {[
          { label: 'Revenue',      value: '$84.2k', change: '↑ 12%', positive: true,  tip: 'vs $75.1k last month' },
          { label: 'Active Users', value: '2,841',  change: '↑ 5%',  positive: true,  tip: 'vs 2,706 last month' },
          { label: 'Churn Rate',   value: '1.4%',   change: '↑ 0.2%', positive: false, tip: 'vs 1.2% last month' },
          { label: 'NPS',          value: '72',     change: '↑ 3pts', positive: true,  tip: 'vs 69 last month' },
        ].map((s) => (
          <div key={s.label} className={`${PANEL} !p-[14px] hover:bg-bgSuccess`}>
            <div className="text-[var(--fg-alt)] text-[11px] mb-1.5">{s.label}</div>
            <AppTooltip content={
              <div>
                <div className="text-[var(--fg-decorative)] text-[10px] mb-0.5">{s.label}</div>
                <div className={`${s.positive ? 'text-[var(--fg-success)]' : 'text-[var(--fg-danger)]'} text-[13px] font-semibold`}>{s.tip}</div>
              </div>
            }>
              <div className="text-[var(--fg-main)] text-xl font-bold mb-1 cursor-default">{s.value}</div>
            </AppTooltip>
            <div className={`${s.positive ? 'text-[var(--fg-success)]' : 'text-[var(--fg-danger)]'} text-[11px] font-medium`}>{s.change}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-[14px] mb-[14px]">
        <div className={PANEL}>
          <div className="text-[var(--fg-main)] font-semibold text-[13px] mb-3">Recent Alerts</div>
          <AlertRow type="success" message="Deployment to production succeeded" />
          <AlertRow type="error"   message="API latency spike — P95 > 800ms" />
          <AlertRow type="info"    message="New milestone: 3,000 signups" />
        </div>
        <div className={`${PANEL} flex flex-wrap gap-2`}>
          <div className="text-[var(--fg-main)] font-semibold text-[13px] mb-3 w-full">Active Tokens</div>
          <TokenSwatch varName="--fg-main"   label="fgMain" />
          <TokenSwatch varName="--fg-alt" label="fgAlt" />
          <TokenSwatch varName="--fg-brand"    label="fgBrand" />
          <TokenSwatch varName="--fg-nav-accent" label="fgNavAccent" />
          <TokenSwatch varName="--fg-nav-main" label="fgNavMain" />
          <TokenSwatch varName="--fg-nav-decorative" label="fgNavDecorative" />
          <TokenSwatch varName="--fg-decorative" label="fgDecorative" />
          <TokenSwatch varName="--fg-success"   label="fgSuccess" />
          <TokenSwatch varName="--fg-danger"    label="fgDanger" />
          <TokenSwatch varName="--fg-info"     label="fgInfo" />
          <TokenSwatch varName="--border-main" label="borderMain" />
          <TokenSwatch varName="--border-muted" label="borderMuted" />
          <TokenSwatch varName="--border-success" label="borderSuccess" />
          <TokenSwatch varName="--border-danger" label="borderDanger" />
          <TokenSwatch varName="--border-info" label="borderInfo" />
          <TokenSwatch varName="--focus-brand" label="focusBrand" />
          <TokenSwatch varName="--focus-danger" label="focusDanger" />
          <TokenSwatch varName="--focus-neutral" label="focusNeutral" />
          <TokenSwatch varName="--fg-brand-alt" label="fgBrandAlt" />
          <TokenSwatch varName="--fg-info-alt" label="fgInfoAlt" />
          <TokenSwatch varName="--fg-warning" label="fgWarning" />
          <TokenSwatch varName="--fg-disabled" label="fgDisabled" />
          <TokenSwatch varName="--fg-inverse" label="fgInverse" />
          <TokenSwatch varName="--border-warning" label="borderWarning" />
          <TokenSwatch varName="--border-disabled" label="borderDisabled" />
          <TokenSwatch varName="--bg-main"   label="bgMuted" />
        </div>
      </div>

      <SizeContrastPanel registry={registry} bg={bg} engineId={engineId} />

      <div className={`${PANEL} mb-[14px]`}>
        <div className="text-[var(--fg-main)] font-semibold text-[13px] mb-2.5">Interaction States</div>
        <div className="flex gap-5">
          {['View report →', 'Export CSV →', 'Open docs →'].map((label) => (
            <a
              key={label}
              href="#"
              onClick={(e) => e.preventDefault()}
              className="text-[var(--fg-brand)] text-[13px] underline transition-colors duration-150 hover:text-[var(--fg-brand-hover)] active:text-[var(--fg-brand-active)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-brand)] rounded"
            >
              {label}
            </a>
          ))}
        </div>
        <div className="text-[var(--fg-decorative)] text-[10px] mt-2 font-mono">--fg-brand · --fg-brand-hover · --fg-brand-active</div>
      </div>

      <div className={PANEL}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[var(--fg-main)] font-semibold text-[13px]">Elevation Demo</div>
          <Button
            onClick={() => setModalOpen(true)}
            className="py-1.5 px-3.5 rounded-[7px] border bg-[var(--bg-brand)] border-[var(--border-brand)] text-[var(--fg-inverse)] cursor-pointer text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--focus-brand)]"
          >
            Open modal
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-3 py-2.5 px-3 rounded-[7px] bg-[var(--bg-main)] border border-[var(--border-muted)]">
          <span className="text-[var(--fg-alt)] text-[11px]">Hover a token to see its tooltip:</span>
          {(['--fg-main', '--fg-brand', '--fg-success', '--fg-danger'] as const).map((v) => (
            <AppTooltip key={v} content={
              <div>
                <div className="text-[var(--fg-main)] text-[12px] font-semibold font-mono">{v}</div>
                <div className="text-[var(--fg-alt)] text-[10px] mt-0.5">data-stack="tooltip"</div>
              </div>
            }>
              <div
                className="w-[22px] h-[22px] rounded border border-[var(--border-main)] cursor-default"
                style={{ background: `var(${v})` }}
              />
            </AppTooltip>
          ))}
        </div>

        <div className="text-[var(--fg-decorative)] text-[11px] leading-relaxed">
          The nav sidebar uses <code className="text-[var(--fg-brand)] font-mono">data-stack="nav"</code>.
          Tooltips use <code className="text-[var(--fg-brand)] font-mono">data-stack="tooltip"</code>.
          The modal uses <code className="text-[var(--fg-brand)] font-mono">data-stack="modal"</code>.
          No <code className="text-[var(--fg-brand)] font-mono">data-theme</code> needed on any of them.
        </div>
      </div>

      {/* Modal — base-ui Dialog */}
      <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/20" />
          <Dialog.Popup
            data-stack="modal"
            data-vision={visionMode}
            className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--bg-surface)] rounded-[14px] p-7 w-[420px] max-w-[90vw] shadow-[0_20px_40px_rgba(0,0,0,0.4)]"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="text-[var(--fg-main)] text-[17px] font-bold">Revenue Details</div>
              <AppTooltip content={
                <div>
                  <div className="text-[var(--fg-main)] text-[12px] font-semibold">data-stack="tooltip"</div>
                  <div className="text-[var(--fg-alt)] text-[10px] mt-0.5">inside a modal — one step higher</div>
                </div>
              }>
                <div className="w-4 h-4 rounded-full border border-[var(--border-main)] text-[var(--fg-decorative)] text-[10px] flex items-center justify-center cursor-default shrink-0">?</div>
              </AppTooltip>
            </div>
            <div className="text-[var(--fg-alt)] text-[13px] leading-relaxed mb-4">
              This panel has <code className="text-[var(--fg-brand)] text-[12px] font-mono">data-stack="modal"</code> and inherits the
              page theme. Its surface and tokens resolve to the modal elevation step automatically.
            </div>
            <div className="grid grid-cols-2 gap-2 mb-5">
              <TokenSwatch varName="--fg-main"   label="fgMain" />
              <TokenSwatch varName="--fg-alt" label="fgAlt" />
              <TokenSwatch varName="--fg-brand"    label="fgBrand" />
              <TokenSwatch varName="--fg-success"   label="fgSuccess" />
            </div>
            <Dialog.Close className="py-[7px] px-[18px] rounded-[7px] border border-[var(--border-brand)] bg-transparent text-[var(--fg-brand)] cursor-pointer text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--focus-brand)]">
              Close
            </Dialog.Close>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function GenericPage({ page }: { page: NavPage }) {
  const descriptions: Partial<Record<NavPage, string>> = {
    Dashboard: '',
    Reports: 'Follows the global theme. Token values update automatically when the theme changes.',
    Users: 'Follows the global theme. Token values update automatically when the theme changes.',
    Settings: 'Follows the global theme. Use the theme toggle above to change it.',
  };
  return (
    <>
      <div className="mb-6">
        <h1 className="text-[var(--fg-main)] text-[22px] font-bold mb-1.5">{page}</h1>
        <p className="text-[var(--fg-alt)] text-[13px]">{descriptions[page]}</p>
      </div>
      <div className={PANEL}>
        <div className="text-[var(--fg-main)] font-semibold text-[13px] mb-3">Tokens in this context</div>
        <div className="grid grid-cols-2 gap-2">
          {(['--fg-main','--fg-alt','--fg-decorative','--fg-brand','--fg-success','--fg-danger'].map((v) => (
            <TokenSwatch key={v} varName={v} label={v.replace('--fg-', 'fg').replace(/-([a-z])/g, (_, c) => c.toUpperCase())} />
          )))}
        </div>
      </div>
    </>
  );
}


// ── Root ──────────────────────────────────────────────────────────────────────

function Inner({
  registry,
  contrastPreference,
  onContrastPreferenceChange,
  engineId,
  onEngineChange,
}: {
  registry: TokenRegistry;
  contrastPreference: ContrastPreference;
  onContrastPreferenceChange: (p: ContrastPreference) => void;
  engineId: ComplianceEngineId;
  onEngineChange: (e: ComplianceEngineId) => void;
}) {
  const [theme, setTheme] = useState<ThemeMode>('system');
  const [activePage, setActivePage] = useState<NavPage>('Dashboard');
  const rootBg = useRootBg(theme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', rootBg);
  }, [rootBg]);

  return (
    <Tooltip.Provider>
      <div
        className="min-h-screen bg-[var(--bg-surface)] flex flex-col transition-[background] duration-[100ms] ease-[ease]"
      >
        {/* Header */}
        <header className="border-b border-[var(--border-muted)] py-[9px] px-[18px] flex items-center justify-between bg-[var(--bg-surface)] sticky top-0 z-20 transition-[background] duration-[180ms] ease-[ease]">
          <ThemeToggle theme={theme} onChange={setTheme} />
          <div className="flex items-center gap-[14px]">
            <EngineToggle engineId={engineId} onChange={onEngineChange} />
            <ContrastToggle preference={contrastPreference} onChange={onContrastPreferenceChange} />
            <VisionToggle />
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <Sidebar activePage={activePage} onNavChange={setActivePage} />

          <div className="flex-1 p-6 px-7 overflow-y-auto bg-[var(--bg-surface)] transition-[background] duration-[180ms] ease-[ease]">
            {activePage === 'Dashboard' && <DashboardPage registry={registry} bg={rootBg} engineId={engineId} />}
            {(activePage === 'Reports' || activePage === 'Users' || activePage === 'Settings') && (
              <GenericPage page={activePage} />
            )}
          </div>
        </div>
      </div>
    </Tooltip.Provider>
  );
}

export default function App({
  registries,
}: {
  registries: Record<'wcag' | 'apca', Record<'AA' | 'AAA', TokenRegistry>>;
}) {
  const systemHighContrast = usePrefersHighContrast();
  const [contrastPreference, setContrastPreference] = useState<ContrastPreference>('aa');
  const [engineId, setEngineId] = useState<ComplianceEngineId>('wcag');

  const effectiveTarget: 'AA' | 'AAA' = contrastPreference === 'aaa' || (contrastPreference === 'auto' && systemHighContrast) ? 'AAA' : 'AA';
  const registry = registries[engineId][effectiveTarget];
  const runtimeCss = useMemo(() => generateCSS(registry), [registry]);

  return (
    <TokenProvider registry={registry}>
      <style>{runtimeCss}</style>
      <Inner
        registry={registry}
        contrastPreference={contrastPreference}
        onContrastPreferenceChange={setContrastPreference}
        engineId={engineId}
        onEngineChange={setEngineId}
      />
    </TokenProvider>
  );
}
