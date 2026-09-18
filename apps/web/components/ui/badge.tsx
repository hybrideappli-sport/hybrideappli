import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Badge / pill d'information — `docs/design-system.md` §4.5 : contour fin 1 px, fond transparent,
 * texte `--text-label` (11 px majuscule tracké), `--radius-full`, padding 4 / 10.
 *
 * Écart assumé sur la variante `neutral`. La charte dit « texte de la même couleur que le
 * contour » ; appliqué littéralement au contour neutre, cela donnerait du `#3A3A3A` sur
 * `#1A1A1A`, soit **2,0:1** — la charte échouerait à sa propre §5, qui plancher les textes à
 * `#8B8B94`. Le contour reste `--color-border-strong`, le texte passe à
 * `--color-foreground-muted` (6,8:1). Les variantes colorées, elles, suivent la règle à la
 * lettre : contour et texte de la même teinte.
 */
const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-label",
  {
    variants: {
      tone: {
        neutral: "border-border-strong text-foreground-muted",
        accent: "border-accent text-accent-text",
        warning: "border-warning text-warning",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

function Badge({ className, tone, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone, className }))} {...props} />;
}

export { Badge, badgeVariants };
