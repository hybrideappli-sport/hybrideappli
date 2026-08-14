import type { Metadata } from "next";
import Link from "next/link";

import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { addDaysIso } from "@/lib/dates";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Détail par source — Hybride Club" };
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

/**
 * `/donnees/detail` — AC6 (« Détail → »). Vue MINIMALE, non maquettée (`plans/US-02-...md` §0.2,
 * question ouverte n°13 relayée à `designer`) : liste chronologique des 30 derniers jours,
 * provenance par ligne. À reprendre une fois l'écran conçu.
 */
export default async function DataDetailPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");
  const from = addDaysIso(now, -(WINDOW_DAYS - 1));

  const admin = createSupabaseServiceRoleClient();
  const { data: activities } = await admin
    .from("session_logs_counted")
    .select("id, logged_date, session_type, load_units, distance_m, source")
    .eq("user_id", user.id)
    .gte("logged_date", from)
    .lte("logged_date", now)
    .order("logged_date", { ascending: false });

  return (
    <main className="mx-auto flex max-w-md flex-col">
      <header className="flex h-14 items-center justify-between bg-surface-sunken px-5">
        <p className="text-label text-foreground-muted">DÉTAIL PAR SOURCE</p>
        <Link href="/dashboard" aria-label="Fermer" className="flex size-11 items-center justify-center text-foreground-muted hover:text-foreground">
          <span aria-hidden="true">✕</span>
        </Link>
      </header>

      <div className="flex flex-col gap-3 px-5 py-8">
        <p className="text-body text-foreground-muted">30 derniers jours, provenance par séance.</p>
        {!activities || activities.length === 0 ? (
          <p className="text-body text-foreground-subtle">Aucune séance sur cette période.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {activities.map((activity) => (
              <li key={activity.id} className="flex items-center justify-between rounded-md bg-surface p-3">
                <div>
                  <p className="text-body text-foreground">{activity.logged_date}</p>
                  <p className="text-small text-foreground-muted">
                    {activity.session_type ?? "—"} · {activity.load_units ?? 0} UA
                  </p>
                </div>
                <span className="text-small text-foreground-subtle" aria-hidden="true">
                  {activity.source === "connected" ? "↻" : "✎"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
