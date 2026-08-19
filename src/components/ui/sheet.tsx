import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/utils"
import { pressOriginOffsetY, useTrackPressOrigin } from "@/lib/motion"

/**
 * The right-hand slide-over — the approved pattern for in-context actions, and
 * so the most-animated surface in the product.
 *
 * Its motion now comes from the vocabulary in `src/index.css` rather than from
 * tailwindcss-animate, for two reasons. It was slow: 500ms to open and 300ms to
 * close, when the whole app's budget for a thing a person does often is 250ms,
 * and a panel that takes longer to arrive than to leave reads as reluctant. And
 * it always came from the same place — the middle of the right edge — no matter
 * which control opened it, which is motion with no meaning in it.
 *
 * Both are transform and opacity throughout, so a panel opening cannot move a
 * single pixel of the page underneath it.
 */

const Sheet = ({
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof SheetPrimitive.Root>) => {
  /* Registered here, on the root, because the press that has to be remembered
     is the one that opens the panel — by the time the content mounts it has
     already happened. Reference-counted, so any number of sheets is one
     passive listener. */
  useTrackPressOrigin()
  return <SheetPrimitive.Root {...props}>{children}</SheetPrimitive.Root>
}
Sheet.displayName = "Sheet"

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "motion-scrim fixed inset-0 z-50 bg-background/80 backdrop-blur-sm",
      className
    )}
    {...props}
    ref={ref}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  "motion-panel fixed z-50 gap-4 bg-background p-6 shadow-lg",
  {
    variants: {
      side: {
        top: "motion-panel-top inset-x-0 top-0 border-b",
        bottom: "motion-panel-bottom inset-x-0 bottom-0 border-t",
        left: "motion-panel-left inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
        right:
          "motion-panel-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
)

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
  VariantProps<typeof sheetVariants> { }

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, ...props }, ref) => {
  /**
   * The panel starts level with the control that opened it and rides to its
   * place, so the movement says "this button opened that panel".
   *
   * Written from the ref callback rather than a layout effect because the
   * opening keyframe is already running by the time an effect would fire. A
   * panel opened from the keyboard, from a toast or from a redirect has no
   * origin, and none is invented — it slides straight in from its edge.
   *
   * Left and right only: for a panel arriving from the top or the bottom, the
   * vertical axis is already the panel's own direction.
   */
  const applyOrigin = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (typeof ref === "function") ref(node)
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
      if (!node || (side !== "left" && side !== "right")) return
      const offset = pressOriginOffsetY()
      if (offset === null) node.style.removeProperty("--motion-panel-from-y")
      else node.style.setProperty("--motion-panel-from-y", `${Math.round(offset)}px`)
    },
    [ref, side]
  )

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={applyOrigin}
        className={cn(sheetVariants({ side }), className)}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="motion-press absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
})
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet, SheetClose,
  SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetOverlay, SheetPortal, SheetTitle, SheetTrigger
}
