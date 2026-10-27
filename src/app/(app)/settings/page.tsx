import { headers } from "next/headers";
import { SettingsView } from "@/components/settings-view";
import { listPasskeys, relyingParty } from "@/server/services/passkeys";
import { getSettings } from "@/server/services/settings";
import { listCategories } from "@/server/services/projects";
import { aiStatus, claudeBinary } from "@/server/ai/providers";
import { khalConfigured, khalPublicUrl, khalStatus, listKhalPeople } from "@/server/integrations/khal";
import { listPeopleDetailed } from "@/server/services/people";
import { listInvites } from "@/server/services/invites";
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
  const isOwner = user.role === "owner";
  let khalPeople: { id: string; name: string }[] | null = null;
  let khalPeopleError: string | null = null;
  if (isOwner && khalConfigured()) {
    try {
      khalPeople = await listKhalPeople();
    } catch (e) {
      khalPeopleError = e instanceof Error ? e.message : String(e);
    }
  }
  return (
    <SettingsView
      origin={origin}
      user={{ id: user.id, name: user.name, role: user.role }}
      people={{
        list: listPeopleDetailed().map((p) => ({ id: p.id, name: p.name, role: p.role, khalUserId: p.khalUserId, createdAt: p.createdAt.getTime() })),
        invites: isOwner ? listInvites(user.id).map((i) => ({ code: i.code, name: i.name, expiresAt: i.expiresAt.getTime() })) : [],
        khal: khalPeople,
        khalError: khalPeopleError,
      }}
      prefs={getSettings(user.id)}
      ai={{ ready: ai.ready, reason: ai.reason ?? null, binary: claudeBinary(), hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY) }}
      khal={{ configured: khal.configured, ok: khal.ok, linked: khal.linked, error: khal.error, url: khalPublicUrl() }}
      ideas={{ configured: ideasConfigured(), url: ideasPublicUrl() }}
      categories={listCategories(user.id).map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, color: c.color, total: c.total }))}
      passkeys={listPasskeys(user.id).map((p) => ({ id: p.id, name: p.name ?? "Passkey", lastUsedAt: p.lastUsedAt?.getTime() ?? null, createdAt: p.createdAt.getTime() }))}
      apiTokenRequired={apiTokenEnabled()}
      zones={Intl.supportedValuesOf("timeZone")}
    />
  );
}
