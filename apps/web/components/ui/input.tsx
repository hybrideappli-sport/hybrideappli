import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
