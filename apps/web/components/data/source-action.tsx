"use client";

import { useState } from "react";
import Link from "next/link";

import type { DataSourceView } from "@hybride/domain";

import { Button } from "@/components/ui/button";
import { ConnectSourceButton } from "@/components/data/connect-source-button";
import { DisconnectSheet } from "@/components/data/disconnect-sheet";

/** Sélectionne l'action pertinente selon l'état de la source (§3.3/§3.4 des notes de design). */
export function SourceAction({ source }: { source: DataSourceView }) {
  const [disconnecting, setDisconnecting] = useState(false);

  if (source.kind === "manual") {
    return (
      <Button asChild variant="secondary" className="w-full">
        <Link href="/aujourdhui" data-testid={`manual-entry-${source.code}`}>
          Saisir manuellement
        </Link>
      </Button>
    );
  }

  if (source.status === "needs_reauth") {
    return <ConnectSourceButton provider={source.code} label="Réessayer" />;
  }

  if (source.status === "connected") {
    return (
      <>
        <Button variant="secondary" className="w-full" onClick={() => setDisconnecting(true)} data-testid={`disconnect-trigger-${source.code}`}>
          Déconnecter
        </Button>
        {disconnecting && source.connectionId ? (
          <DisconnectSheet connectionId={source.connectionId} label={source.label} onClose={() => setDisconnecting(false)} />
        ) : null}
      </>
    );
  }

  return <ConnectSourceButton provider={source.code} />;
}
