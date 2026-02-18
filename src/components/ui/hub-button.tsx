import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const hubButtonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-xl border text-sm font-semibold transition-all duration-200",
    "outline-none focus-visible:ring-2 focus-visible:ring-[#b6ccff]",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "border-[#1f5eff] bg-gradient-to-r from-[#1f5eff] via-[#2f70ff] to-[#1254ec] text-white shadow-[0_14px_28px_-18px_rgba(31,94,255,0.9)] hover:-translate-y-[1px] hover:border-[#134ae0]",
        secondary:
          "border-[#d2e1f4] bg-white text-[#0b1c33] shadow-[0_8px_18px_-18px_rgba(18,43,86,0.8)] hover:-translate-y-[1px] hover:border-[#b8cdee] hover:bg-[#f7fbff]",
        ghost:
          "border-transparent bg-transparent text-[#51627b] hover:bg-[#eaf1ff] hover:text-[#0b1c33]",
        danger:
          "border-[#fecdc7] bg-[#fff7f5] text-[#b93828] hover:border-[#fdb6ad] hover:bg-[#ffe9e6]",
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
