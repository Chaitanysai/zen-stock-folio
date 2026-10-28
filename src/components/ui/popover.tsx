import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";
import { COLLISION_PADDING, PANEL_OFFSET, panel, panelMotion } from "@/components/ui/overlay";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = PANEL_OFFSET, collisionPadding = COLLISION_PADDING, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        panel,
        panelMotion,
        "w-72 max-h-[var(--radix-popover-content-available-height)] max-w-[var(--radix-popover-content-available-width)] origin-[var(--radix-popover-content-transform-origin)] overflow-y-auto p-4",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent };
