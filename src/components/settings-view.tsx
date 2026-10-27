"use client";

import { useEffect, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import clsx from "clsx";
import { DateTime } from "luxon";
import { Bot, CalendarDays, Check, Copy, KeyRound, Lightbulb, Link2, Loader2, Monitor, Moon, Plus, RefreshCw, Sparkles, Sun, Tags, Trash2, User, UserPlus, Users } from "lucide-react";
import {
  createCategoryAction,
  createInviteAction,
  deleteCategoryAction,
  linkKhalAction,
  passkeyAction,
  removePersonAction,
  revokeInviteAction,
  resyncKhalAction,
  saveSettingsAction,
  testAiAction,
  updateCategoryAction,
} from "@/app/actions";
import type { Settings } from "@/server/services/settings";
import { CATEGORY_COLORS } from "@/lib/projects";
import { duration } from "@/lib/format";
import { AddPasskey, SignOutButton } from "./passkey-auth";
import { Avatar } from "./bits";
import { Button, Field, Input, Select, Switch } from "./ui";

interface Props {
  origin: string;
  user: { id: string; name: string; role: string };
  people: {
    list: { id: string; name: string; role: "owner" | "member"; khalUserId: string | null; createdAt: number }[];
    invites: { code: string; name: string | null; expiresAt: number }[];
    /** khal's people, to link accounts to (owner only; null = not available). */
    khal: { id: string; name: string }[] | null;
    khalError: string | null;
  };
  prefs: Settings;
  ai: { ready: boolean; reason: string | null; binary: string; hasApiKey: boolean };
  khal: { configured: boolean; ok: boolean; linked: boolean; error?: string; url: string | null };
  ideas: { configured: boolean; url: string | null };
  categories: { id: string; name: string; emoji: string; color: string; total: number }[];
  passkeys: { id: string; name: string; lastUsedAt: number | null; createdAt: number }[];
  apiTokenRequired: boolean;
  zones: string[];
}

function Section({ id, icon, title, subtitle, children }: { id: string; icon: ReactNode; title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-text">{icon}</span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} aria-label={label} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
      <Button
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
        aria-label={`Copy ${label}`}
      >
        {done ? <Check size={15} /> : <Copy size={15} />}
      </Button>
    </div>
  );
}

const Status = ({ ok, children }: { ok: boolean; children: ReactNode }) => (
  <span className={clsx("inline-flex items-center gap-1.5 text-sm", ok ? "text-accent-text" : "text-critical-text")}>
    <span className={clsx("h-2 w-2 rounded-full", ok ? "bg-accent" : "bg-critical")} />
    {children}
  </span>
);

export function SettingsView({ origin, user, people, prefs: initial, ai, khal, ideas, categories, passkeys, apiTokenRequired, zones: serverZones }: Props) {
  const [prefs, setPrefs] = useState(initial);
  const [name, setName] = useState(user.name);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const [test, setTest] = useState<{ text: string; ok: boolean } | null>(null);
  const [sync, setSync] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const zones = serverZones.includes(prefs.timezone) ? serverZones : [prefs.timezone, ...serverZones];

  useEffect(() => {
    try {
      const t = localStorage.getItem("puro-theme");
      if (t === "light" || t === "dark") setTheme(t);
    } catch {
      /* private mode */
    }
  }, []);

  const save = (patch: Partial<Settings> & { name?: string }) =>
    start(async () => {
      setError(null);
      const r = await saveSettingsAction(patch);
      if (!r.ok) return setError(r.error);
      setPrefs(r.settings);
      setSaved("Saved");
      setTimeout(() => setSaved(null), 1600);
    });

  const applyTheme = (t: "system" | "light" | "dark") => {
    setTheme(t);
    try {
      if (t === "system") localStorage.removeItem("puro-theme");
      else localStorage.setItem("puro-theme", t);
    } catch {
      /* ignore */
    }
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Settings</h1>
        {saved && <span className="text-xs font-medium text-accent-text">{saved} ✓</span>}
      </div>
      {error && <p className="rounded-xl bg-surface px-4 py-3 text-sm text-critical-text">{error}</p>}

      <Section id="general" icon={<User size={16} />} title="You">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== user.name && save({ name })} maxLength={60} />
          </Field>
          <Field label="Time zone" hint="Sessions and khal events use it.">
            <Select value={prefs.timezone} onChange={(e) => save({ timezone: e.target.value })}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Currency" hint="For budgets and new purchases.">
            <Input defaultValue={prefs.currency} maxLength={3} onBlur={(e) => e.target.value.toUpperCase() !== prefs.currency && save({ currency: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Working session length">
            <Select value={prefs.sessionMinutes} onChange={(e) => save({ sessionMinutes: Number(e.target.value) })}>
              {[30, 45, 60, 90, 120, 180, 240].map((m) => (
                <option key={m} value={m}>
                  {duration(m)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-4">
          <span className="mb-1 block text-xs font-medium text-ink-2">Theme</span>
          <div className="inline-flex rounded-xl border border-border bg-page p-0.5">
            {(
              [
                ["system", Monitor, "System"],
                ["light", Sun, "Light"],
                ["dark", Moon, "Dark"],
              ] as const
            ).map(([t, Icon, label]) => (
              <button key={t} type="button" onClick={() => applyTheme(t)} className={clsx("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm", theme === t ? "bg-surface font-medium shadow-card" : "text-muted hover:text-ink")}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section
        id="people"
        icon={<Users size={16} />}
        title="People"
        subtitle={user.role === "owner" ? "Everyone with an account here. Projects stay private until their owner shares them; each person's sessions go to their own khal calendar." : "Everyone with an account here: who you can share your projects with."}
      >
        <People me={user.id} isOwner={user.role === "owner"} origin={origin} people={people} khalConfigured={khal.configured} />
      </Section>

      <Section id="ai" icon={<Sparkles size={16} />} title="AI specs" subtitle="Who writes the lean project specs. Claude Code uses the subscription already signed in on this machine, like alfred.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Provider">
            <Select value={prefs.aiProvider} onChange={(e) => save({ aiProvider: e.target.value as Settings["aiProvider"] })}>
              <option value="claude-code">Claude Code (local CLI)</option>
              <option value="anthropic">Anthropic API{ai.hasApiKey ? "" : " (no key set)"}</option>
              <option value="none">Off</option>
            </Select>
          </Field>
          <Field label="Model" hint="opus, sonnet, haiku, or a full model id.">
            <Input defaultValue={prefs.aiModel} onBlur={(e) => e.target.value.trim() && e.target.value !== prefs.aiModel && save({ aiModel: e.target.value.trim() })} />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Status ok={ai.ready}>{ai.ready ? "Ready" : ai.reason}</Status>
          {ai.ready && (
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setTest({ text: "Asking Claude…", ok: true });
                  const r = await testAiAction();
                  setTest(r.ok ? { text: `Answered in ${(r.ms / 1000).toFixed(1)} s (${r.model})`, ok: true } : { text: r.error, ok: false });
                })
              }
            >
              {pending && test?.text.startsWith("Asking") ? <Loader2 size={13} className="animate-spin" /> : <Bot size={13} />} Test
            </Button>
          )}
        </div>
        {test && <p className={clsx("mt-2 text-sm", test.ok ? "text-ink-2" : "text-critical-text")}>{test.text}</p>}
        {prefs.aiProvider === "claude-code" && <p className="mt-3 text-xs text-muted">CLI: <code>{ai.binary}</code>. Every tool is denied to it: it only writes text.</p>}
      </Section>

      <Section id="khal" icon={<CalendarDays size={16} />} title="khal calendar" subtitle='Working sessions and dated milestones go into a "Projects" calendar in khal, next to the rest of your week.'>
        {khal.configured ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Status ok={khal.ok}>{khal.ok ? "Connected to your own calendar" : khal.error}</Status>
              {khal.url && (
                <a href={khal.url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent-text hover:underline">
                  Open khal
                </a>
              )}
            </div>
            <Switch checked={prefs.khalSync} onChange={(v) => save({ khalSync: v })} label="Mirror sessions and milestones into khal" />
            <div>
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await resyncKhalAction();
                    setSync(r.ok ? (r.synced || r.failed ? `${r.synced} synced, ${r.failed} failed` : "Everything is already in khal.") : r.error);
                  })
                }
              >
                <RefreshCw size={13} /> Retry unsynced sessions
              </Button>
              {sync && <span className="ml-3 text-sm text-ink-2">{sync}</span>}
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-2">
            Not connected. Set <code className="rounded bg-surface-2 px-1 text-xs">PUROJEKUTO_KHAL_URL</code> and <code className="rounded bg-surface-2 px-1 text-xs">PUROJEKUTO_KHAL_TOKEN</code> (chezmoi does it).
          </p>
        )}
      </Section>

      <Section id="ideas" icon={<Lightbulb size={16} />} title="Ideas inbox" subtitle="jinsen-ideas: turn a researched idea into a project.">
        {ideas.configured ? <Status ok>Connected{ideas.url ? ` · ${ideas.url}` : ""}</Status> : <p className="text-sm text-ink-2">Not connected (PUROJEKUTO_IDEAS_URL).</p>}
      </Section>

      <Section id="categories" icon={<Tags size={16} />} title="Categories" subtitle="The shelves you browse projects by.">
        <Categories categories={categories} />
      </Section>

      <Section id="agents" icon={<Bot size={16} />} title="Agents (MCP)" subtitle="LeClanker, Claude Code or any MCP client can create projects, write specs, move tasks, schedule sessions and read analytics.">
        <CopyField value={`${origin}/api/mcp`} label="MCP URL" />
        <p className="mt-2 text-sm text-ink-2">
          {apiTokenRequired ? (
            <>
              Send <code className="rounded bg-surface-2 px-1 text-xs">Authorization: Bearer $PUROJEKUTO_API_TOKEN</code>.
            </>
          ) : (
            "No token is set, so only clients on this machine can connect."
          )}
        </p>
        <p className="mt-1 text-xs text-muted">Try: “start a project to repaint the bedroom, about 200 €, done by Christmas” or “what should I work on this weekend?”</p>
      </Section>

      <Section id="security" icon={<KeyRound size={16} />} title="Passkeys" subtitle="No passwords. Each device you sign in with holds a passkey.">
        <ul className="mb-4 divide-y divide-border rounded-xl border border-border">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <KeyRound size={15} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="block text-xs text-muted">
                  Added {DateTime.fromMillis(p.createdAt, { zone: prefs.timezone }).toFormat("d LLL yyyy")}
                  {p.lastUsedAt && ` · last used ${DateTime.fromMillis(p.lastUsedAt, { zone: prefs.timezone }).toFormat("d LLL yyyy")}`}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const n = prompt("Name this passkey", p.name);
                  if (n?.trim()) start(async () => void (await passkeyAction({ rename: { id: p.id, name: n.trim() } })));
                }}
              >
                Rename
              </Button>
              {passkeys.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => confirm(`Remove "${p.name}"? That device won't be able to sign in any more.`) && start(async () => void (await passkeyAction({ remove: p.id })))}
                >
                  <Trash2 size={14} />
                </Button>
              )}
            </li>
          ))}
        </ul>
        <AddPasskey />
        <div className="mt-5 border-t border-border pt-4">
          <SignOutButton className="text-sm font-medium text-critical-text hover:underline" />
        </div>
      </Section>

      <p className="pb-6 text-center text-xs text-faint">purojekuto · your projects, on your own machine</p>
    </div>
  );
}

function People({ me, isOwner, origin, people, khalConfigured }: { me: string; isOwner: boolean; origin: string; people: Props["people"]; khalConfigured: boolean }) {
  const [inviteName, setInviteName] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.error ?? "Failed"));
    });
  const khalName = (id: string | null) => (id ? (people.khal?.find((k) => k.id === id)?.name ?? "someone khal no longer has") : null);

  return (
    <div>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {people.list.map((p) => {
          const sameName = people.khal?.find((k) => k.name.trim().toLowerCase() === p.name.trim().toLowerCase());
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-sm">
              <Avatar person={p} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {p.name}
                  {p.id === me && <span className="font-normal text-muted"> (you)</span>}
                </span>
                <span className="block text-xs text-muted">
                  {p.role === "owner" ? "Owner" : "Member"}
                  {!isOwner && khalConfigured && p.id === me && ` · khal: ${p.khalUserId || p.role === "owner" ? "linked" : "not linked yet"}`}
                </span>
              </span>
              {isOwner && khalConfigured && people.khal && (
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  <Link2 size={13} aria-hidden />
                  <span className="sr-only">khal account for {p.name}</span>
                  <Select
                    value={p.khalUserId ?? ""}
                    onChange={(e) => run(() => linkKhalAction(p.id, e.target.value || null))}
                    className="h-8 w-48 text-xs"
                    aria-label={`khal account for ${p.name}`}
                  >
                    <option value="">{p.role === "owner" ? "khal's default user" : "Not linked: no khal sync"}</option>
                    {people.khal.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                        {k.id === sameName?.id && k.id !== p.khalUserId ? " (same name)" : ""}
                      </option>
                    ))}
                    {p.khalUserId && !people.khal.some((k) => k.id === p.khalUserId) && <option value={p.khalUserId}>{khalName(p.khalUserId)}</option>}
                  </Select>
                </label>
              )}
              {isOwner && p.role !== "owner" && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  aria-label={`Remove ${p.name}`}
                  onClick={() =>
                    confirm(
                      `Remove ${p.name}'s account? Their own projects are deleted with it. What they added to projects shared with them stays, handed to each project's owner.`,
                    ) && run(() => removePersonAction(p.id))
                  }
                >
                  <Trash2 size={14} />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {isOwner && khalConfigured && !people.khal && <p className="mt-2 text-xs text-critical-text">Can't list khal's people to link accounts: {people.khalError}</p>}
      {isOwner && khalConfigured && people.khal && people.list.some((p) => p.role !== "owner" && !p.khalUserId) && (
        <p className="mt-2 text-xs text-ink-2">
          Pick each person's khal account so their sessions go to their own calendar. Not in khal yet? Invite them there first.
        </p>
      )}

      {isOwner ? (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold">Invite someone</h3>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await createInviteAction(inviteName, origin);
                if (!r.ok) return setError(r.error);
                setError(null);
                setLink(r.url);
                setInviteName("");
              });
            }}
          >
            <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Their name (optional)" maxLength={60} />
            <Button type="submit" disabled={pending}>
              <UserPlus size={15} /> Create link
            </Button>
          </form>
          {link && (
            <div className="mt-3">
              <CopyField value={link} label="Invite link" />
              <p className="mt-1 text-xs text-muted">Send it yourself. It works once, for 7 days, and needs this purojekuto's address (on the tailnet).</p>
            </div>
          )}
          {people.invites.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {people.invites.map((i) => (
                <li key={i.code} className="flex items-center gap-2 text-sm text-ink-2">
                  <span className="min-w-0 flex-1 truncate">
                    Waiting: {i.name ?? "unnamed invite"} <span className="text-xs text-muted">· until {DateTime.fromMillis(i.expiresAt).toFormat("d LLL")}</span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setLink(`${origin}/signup?invite=${i.code}`)}>
                    Show link
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => revokeInviteAction(i.code))}>
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">Only the owner invites people.</p>
      )}
      {error && <p className="mt-2 text-sm text-critical-text">{error}</p>}
    </div>
  );
}

function Categories({ categories }: { categories: Props["categories"] }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.error ?? "Failed"));
    });
  return (
    <div>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-2 px-3 py-2">
            <input
              defaultValue={c.emoji}
              maxLength={8}
              onBlur={(e) => e.target.value !== c.emoji && run(() => updateCategoryAction(c.id, { emoji: e.target.value }))}
              className="tint h-8 w-10 rounded-lg text-center"
              style={{ "--c": c.color } as CSSProperties}
              aria-label={`${c.name} emoji`}
            />
            <input
              defaultValue={c.name}
              maxLength={40}
              onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && run(() => updateCategoryAction(c.id, { name: e.target.value }))}
              className="h-8 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm hover:border-border focus:border-accent focus:outline-none"
              aria-label="Category name"
            />
            <span className="hidden text-xs text-muted sm:inline">{c.total || ""}</span>
            <div className="flex gap-1">
              {CATEGORY_COLORS.slice(0, 7).map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => run(() => updateCategoryAction(c.id, { color: col }))}
                  className={clsx("h-4 w-4 rounded-full", c.color === col && "ring-2 ring-ink ring-offset-1 ring-offset-surface")}
                  style={{ background: col }}
                  aria-label={`Colour ${col}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => confirm(`Delete “${c.name}”? Its ${c.total} project(s) stay, uncategorized.`) && run(() => deleteCategoryAction(c.id))}
              className="rounded p-1 text-muted hover:text-critical-text"
              aria-label={`Delete ${c.name}`}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          run(async () => {
            const r = await createCategoryAction({ name, emoji: emoji || undefined });
            if (r.ok) {
              setName("");
              setEmoji("");
            }
            return r;
          });
        }}
      >
        <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="🧶" className="w-14 text-center" maxLength={8} />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" maxLength={40} />
        <Button type="submit" disabled={!name.trim()}>
          <Plus size={15} /> Add
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-critical-text">{error}</p>}
    </div>
  );
}
