import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--raio-md)] text-sm font-medium ring-offset-background transition-[background,box-shadow,color,border-color,transform,opacity] duration-[120ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /* .btn--primario do DS Vante — laranja sólido (selo de marca, não gradient) */
        default: "bg-primary text-white font-bold shadow-[0_1px_2px_rgba(13,13,13,0.10)] hover:bg-primary/90 hover:shadow-brand",
        /* CTA de marca — gradient Vante. Use 1 por tela (regra do DS). */
        brand: "gradient-primary text-white font-bold shadow-[0_1px_2px_rgba(13,13,13,0.10)] hover:shadow-brand",
        destructive: "bg-destructive text-destructive-foreground font-bold hover:bg-destructive/90",
        /* .btn--secundario do DS — superfície + borda forte */
        outline: "border border-border bg-card text-foreground hover:bg-muted hover:border-muted-foreground/40",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        /* .btn--fantasma do DS */
        ghost: "text-foreground/80 hover:bg-muted hover:text-foreground",
        /* .btn--link do DS — usa primary-ink p/ contraste em fundo neutro */
        link: "text-primary-ink underline-offset-4 hover:underline px-0 h-auto",
      },
      size: {
        /* Tamanhos do DS Vante: sm=32, md=40, lg=48, xl=56 */
        sm: "h-8 px-3 text-xs rounded-[var(--raio-sm)]",
        default: "h-10 px-4 text-sm",
        lg: "h-12 px-5 text-base",
        xl: "h-14 px-6 text-base rounded-[var(--raio-lg)]",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8 rounded-[var(--raio-sm)]",
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
