import * as React from "react";

import { cn } from "@/lib/utils";

// Carte — docs/design-system.md §4.3 : fond `surface`, `radius-lg`, pas de bordure ni d'ombre.
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("rounded-lg bg-surface text-foreground", className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1.5 p-5", className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn("text-heading font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-small text-foreground-muted", className)}
      {...props}
    />
  );
}

// Label de section — docs/design-system.md §2.2 `--text-label` et §4.3 (structure
// canonique d'une carte : label → titre → méta → contenu → CTA). `tone="accent"` pour
// qualifier une sortie du coach IA, `tone="muted"` (défaut) pour un simple repère de section.
function CardLabel({
  className,
  tone = "muted",
  ...props
}: React.ComponentProps<"p"> & { tone?: "muted" | "accent" }) {
  return (
    <p
      data-slot="card-label"
      className={cn(
        "text-label",
        tone === "accent" ? "text-accent" : "text-foreground-subtle",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("p-5 pt-0", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center p-5 pt-0", className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardLabel, CardContent, CardFooter };
