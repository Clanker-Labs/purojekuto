import { z } from "zod";
import { signupAllowed } from "@/server/auth";
import { checkInvite } from "@/server/services/invites";
import { beginRegistration } from "@/server/services/passkeys";
import { countUsers } from "@/server/services/users";
import { currentUser } from "@/server/session";
import { authError, rp, setChallengeCookie } from "../../_shared";

const body = z.object({
  name: z.string().trim().max(60).optional(),
  mode: z.enum(["device", "phone"]).default("device"),
  invite: z.string().max(64).optional(),
});

/** Start creating a passkey: a new account, or an extra passkey for the signed-in user. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return authError(new Error("Invalid request"));
  const user = await currentUser();
  if (!user) {
    const invite = checkInvite(parsed.data.invite);
    if (parsed.data.invite && !invite) return authError(new Error("This invite was already used or has expired. Ask for a new one."), 403);
    if (!invite && !signupAllowed(countUsers())) return authError(new Error("Sign-ups are closed on this purojekuto."), 403);
    if (!parsed.data.name) return authError(new Error("Tell us your name first."));
  }
  try {
    const { challengeId, options } = await beginRegistration(await rp(request), {
      mode: parsed.data.mode,
      name: parsed.data.name,
      user: user ?? undefined,
      invite: user ? undefined : parsed.data.invite,
    });
    await setChallengeCookie(challengeId);
    return Response.json(options);
  } catch (e) {
    return authError(e);
  }
}
