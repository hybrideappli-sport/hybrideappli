import * as React from "react";

import { cn } from "@/lib/utils";

// Champ de formulaire — docs/design-system.md §4.6 : fond `surface-raised`, pas de
// bordure au repos, `radius-md`, anneau accent au focus, bordure danger en erreur.
function Input({ className, type, "aria-invalid": ariaInvalid, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      aria-invalid={ariaInvalid}
      className={cn(
        "flex h-[52px] w-full rounded-md border border-transparent bg-surface-raised px-4 text-body text-foreground placeholder:text-foreground-subtle outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:text-foreground-subtle aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
