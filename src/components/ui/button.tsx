import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-[background-color,background-image,border-color,color,box-shadow,transform,opacity] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary bg-[image:var(--grad-primary)] text-primary-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/.22),0_6px_18px_-8px_hsl(var(--primary)/.6)] hover:bg-[image:var(--grad-primary-hover)] hover:shadow-[inset_0_1px_0_hsl(0_0%_100%/.26),0_10px_28px_-8px_hsl(var(--primary)/.7)] active:shadow-[inset_0_1px_2px_hsl(0_0%_0%/.18)]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_6px_18px_-8px_hsl(var(--destructive)/.6)] hover:bg-destructive/90 hover:shadow-[0_10px_26px_-8px_hsl(var(--destructive)/.7)]",
        outline:
          "border border-input bg-background/70 shadow-[var(--glass-highlight)] hover:border-primary/35 hover:bg-accent/70 hover:text-accent-foreground active:bg-accent",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/75 active:bg-secondary/60",
        ghost: "hover:bg-accent/70 hover:text-accent-foreground active:bg-accent",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
