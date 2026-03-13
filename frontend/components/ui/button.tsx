import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#ff6b6b] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
