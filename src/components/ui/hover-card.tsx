import * as React from "react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";

import { cn } from "@/lib/utils";
import { COLLISION_PADDING, PANEL_OFFSET, panel, panelMotion } from "@/components/ui/overlay";

const HoverCard = HoverCardPrimitive.Root;

const HoverCardTrigger = HoverCardPrimitive.Trigger;

const HoverCardContent = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = "center", sideOffset = PANEL_OFFSET, ...props }, ref) => (
  <HoverCardPrimitive.Content
    ref={ref}
    align={align}
    sideOffset={sideOffset}
    collisionPadding={COLLISION_PADDING}
    className={cn(
      panel, panelMotion, "w-64 p-4",
      className,
    )}
    {...props}
  />
));
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName;

export { HoverCard, HoverCardTrigger, HoverCardContent };
