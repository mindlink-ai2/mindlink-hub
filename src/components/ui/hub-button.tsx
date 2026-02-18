import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const hubButtonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-xl border text-sm font-semibold transition-all",
    "outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "border-[#2563EB] bg-[#2563EB] text-white shadow-[0_10px_24px_-14px_rgba(37,99,235,0.75)] hover:border-[#1d4ed8] hover:bg-[#1d4ed8]",
        secondary:
          "border-[#dbe5f3] bg-white text-[#0F172A] hover:border-[#c5d4ea] hover:bg-[#f8fbff]",
        ghost: "border-transparent bg-transparent text-[#4B5563] hover:bg-[#eef3fb] hover:text-[#0F172A]",
        danger:
          "border-[#f5c2c7] bg-[#fff5f5] text-[#b42318] hover:border-[#f1aeb5] hover:bg-[#ffe9ea]",
      },
      size: {
        sm: "h-9 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-11 px-5",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  }
);

function HubButton({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof hubButtonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp className={cn(hubButtonVariants({ variant, size, className }))} {...props} />
  );
}

export { HubButton, hubButtonVariants };
