import Image from "next/image";

import type { EntitlementView } from "@hybride/domain";

import { Badge } from "@/components/ui/badge";

/**
 * `D-header` — en-tête du Dashboard, jamais implémenté jusqu'ici. Le code rendait à la place un
 * `<h1>Dashboard</h1>` accompagné d'un lien « Mon compte » et d'un bouton « Se déconnecter ».
 *
 * La maquette (`jSZB0`) pose autre chose : l'identité de marque à gauche, l'état de quota à
 * droite. Le lien « Mon compte » disparaît — la tab bar y mène désormais — et « Se déconnecter »
 * a été déplacé vers `/compte`, qui n'en portait aucune : le bouton du Dashboard était l'unique
 * sortie de l'application.
 *
 * Le badge de quota ne s'affiche qu'en `free`. Un abonné n'a pas de compteur à surveiller, et la
 * maquette `Yf6zY` traite l'abonnement comme une levée de contrainte, jamais comme un statut à
 * afficher en permanence.
 */
export function DashboardHeader({ entitlement }: { entitlement: EntitlementView }) {
  const { tier, freeAccess } = entitlement;
  const total = freeAccess.used + freeAccess.remaining;

  return (
    <header className="flex items-center justify-between gap-3" data-testid="dashboard-header">
      <div className="flex items-center gap-2.5">
        <Image
          src="/assets/brand/logo-mark-white.png"
          alt="Hybride Club"
          width={28}
          height={28}
          priority
          className="h-7 w-7"
        />
        <span className="text-label whitespace-nowrap text-foreground-muted">Hybride Club</span>
      </div>

      {/* Libellé raccourci par rapport à la maquette (« 2 / 3 accès cette semaine ») : en
          majuscules trackées, imposées aux badges par la charte §4.5, la version longue faisait
          225 px sur 350 et repoussait le wordmark à la ligne. Le sens reste porté par
          `aria-label`, qui n'a pas cette contrainte de place. */}
      {tier === "free" ? (
        <Badge
          tone="neutral"
          className="whitespace-nowrap"
          aria-label={`${freeAccess.used} accès utilisés sur ${total} cette semaine`}
          data-testid="free-access-badge"
        >
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-accent" />
          <span aria-hidden="true">
            {freeAccess.used} / {total} cette semaine
          </span>
        </Badge>
      ) : null}
    </header>
  );
}
