"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "@/lib/utils";

// Label de champ — docs/design-system.md §4.6 : `--text-small`, `--color-foreground-muted`.
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "text-small font-medium leading-none text-foreground-muted peer-disabled:cursor-not-allowed peer-disabled:text-foreground-subtle",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
