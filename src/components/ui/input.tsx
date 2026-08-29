import * as React from "react"

import { cn } from "@/lib/utils"

/*
 * NO HAIRLINE. The field is found by its FILL.
 *
 * This was `border border-input bg-background`, and in dark mode `--input` is
 * 220 6% 17%, which draws a visible 1px line measured at rgb(41, 42, 46) on the
 * sign-in and sign-up forms. Design law 2: "I absolutely hate hard border
 * lines", depth comes from surface tint.
 *
 * The border could not simply be deleted, because `bg-background` is the page's
 * own colour and a field the same shade as the page behind it is a field nobody
 * can see. That is why the line was there. So the same contrast is spent as
 * fill: `--field` sits one clear step above every surface a form is placed on.
 * The border stays in the box model as `border-transparent` so nothing shifts
 * by a pixel, and so a caller that wants a coloured edge for a validity state
 * still has one to colour.
 */

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-transparent bg-field px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
