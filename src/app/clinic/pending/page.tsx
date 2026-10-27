import { redirect } from "next/navigation";
import { signOutStaff } from "@/app/actions";
import { Notice } from "@/components/ui";
import { currentStaff } from "@/lib/services/clinic-context";
import { getRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Pending() {
  const me = await currentStaff();
  if (!me) redirect("/clinic/sign-in");
  if (me.status === "active") redirect("/clinic");
  const admins = (await getRepository().staff()).filter((s) => s.isAdmin && s.status === "active");
  return (
    <div className="max-w-xl">
      <h1>{me.status === "disabled" ? "Access disabled" : "Waiting for approval"}</h1>
      {me.status === "disabled" ? (
        <Notice kind="red">An administrator disabled this account. Contact {admins.map((a) => a.name).join(" or ") || "the clinic administrator"}.</Notice>
      ) : (
        <>
          <Notice kind="green">
            You are verified{me.identity ? ` through ${me.identity.provider === "clear" ? "CLEAR" : "ID.me"} at ${me.identity.assurance}` : ""}.
          </Notice>
          <p className="mt-4 text-ink-2">
            Before you can see any household, an administrator confirms you work here and sets your role and site. {admins.length ? `That is ${admins.map((a) => a.name).join(" or ")}.` : ""} You will be able to sign in again as soon as they approve you.
          </p>
          <p className="mt-2 text-sm text-ink-3">Recorded as: {me.name}{me.email ? `, ${me.email}` : ""}. Nothing else about you was kept from the verification.</p>
        </>
      )}
      <form action={signOutStaff} className="mt-6">
        <button className="btn btn-secondary">Sign out</button>
      </form>
    </div>
  );
}
