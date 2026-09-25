import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-ink text-canvas",
        secondary: "bg-sunken text-ink",
        destructive: "bg-surface text-danger shadow-[inset_0_0_0_1px_theme(colors.line.DEFAULT)]",
        outline: "text-ink shadow-[inset_0_0_0_1px_theme(colors.line.DEFAULT)]",
        // Coral = atención: lo pendiente, lo lleno (spec §3.2 regla 3).
        attention: "bg-accent text-ink",
        success: "bg-surface text-success shadow-[inset_0_0_0_1px_theme(colors.line.DEFAULT)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
