import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90",
        className,
      )}
      {...props}
    />
  );
}
