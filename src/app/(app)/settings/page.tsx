import { headers } from "next/headers";
import { SettingsView } from "@/components/settings-view";
import { listPasskeys, relyingParty } from "@/server/services/passkeys";
import { getSettings } from "@/server/services/settings";
import { listCategories } from "@/server/services/projects";
import { aiStatus, claudeBinary } from "@/server/ai/providers";
import { khalPublicUrl, khalStatus } from "@/server/integrations/khal";
import { ideasConfigured, ideasPublicUrl } from "@/server/integrations/ideas";
import { requireUser } from "@/server/session";
import { apiTokenEnabled } from "@/server/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const { origin } = relyingParty("http://localhost/", await headers());
  const ai = aiStatus(user.id);
  const khal = await khalStatus(user.id);
  return (
    <SettingsView
      origin={origin}
      user={{ name: user.name, role: user.role }}
      prefs={getSettings(user.id)}
      ai={{ ready: ai.ready, reason: ai.reason ?? null, binary: claudeBinary(), hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY) }}
      khal={{ configured: khal.configured, ok: khal.ok, error: khal.error, url: khalPublicUrl() }}
      ideas={{ configured: ideasConfigured(), url: ideasPublicUrl() }}
      categories={listCategories(user.id).map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, color: c.color, total: c.total }))}
      passkeys={listPasskeys(user.id).map((p) => ({ id: p.id, name: p.name ?? "Passkey", lastUsedAt: p.lastUsedAt?.getTime() ?? null, createdAt: p.createdAt.getTime() }))}
      apiTokenRequired={apiTokenEnabled()}
      zones={Intl.supportedValuesOf("timeZone")}
    />
  );
}
