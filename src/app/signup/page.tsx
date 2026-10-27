import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { PasskeySignUp } from "@/components/passkey-auth";
import { signupAllowed } from "@/server/auth";
import { checkInvite } from "@/server/services/invites";
import { countUsers, defaultUser } from "@/server/services/users";
import { currentUser } from "@/server/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create your account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  if (await currentUser()) redirect("/");
  const users = countUsers();
  const first = users === 0;
  const code = (await searchParams).invite;
  const invite = checkInvite(code);
  if (code && !invite) {
    return (
      <AuthShell title="This invite has expired" subtitle="Invites work once and last a week. Ask for a new link.">
        <Link href="/login" className="block text-center text-sm font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      </AuthShell>
    );
  }
  if (invite) {
    return (
      <AuthShell
        title="You're invited"
        subtitle={`${ownerName()} invited you to their purojekuto. Your projects stay private to you. Sign-in is a passkey — Face ID, Touch ID or your phone.`}
      >
        <PasskeySignUp invite={invite.code} suggestedName={invite.name ?? undefined} />
      </AuthShell>
    );
  }
  if (!signupAllowed(users)) {
    return (
      <AuthShell title="Sign-ups are closed" subtitle="Ask the owner of this purojekuto for an invite link.">
        <Link href="/login" className="block text-center text-sm font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title={first ? "Set up purojekuto" : "Create your account"}
      subtitle={
        first
          ? "You'll be the owner. Your sign-in is a passkey — Face ID, Touch ID or your phone. No password to remember."
          : "Your own private projects on this server, secured with a passkey."
      }
      footer={
        first ? null : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-accent hover:underline">
              Sign in
            </Link>
          </>
        )
      }
    >
      <PasskeySignUp />
    </AuthShell>
  );
}

function ownerName(): string {
  try {
    return defaultUser().name;
  } catch {
    return "Someone";
  }
}
