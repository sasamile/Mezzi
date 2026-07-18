"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "outline" | "ghost" | "destructive";

const baseClasses =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60";

export const buttonVariants = (props?: { variant?: ButtonVariant }) => {
  const variant = props?.variant ?? "default";
  const variants: Record<ButtonVariant, string> = {
    default:
      "bg-primary text-primary-foreground hover:opacity-90",
    outline:
      "border border-border bg-background text-foreground hover:bg-muted",
    ghost: "bg-transparent text-foreground hover:bg-muted",
    destructive:
      "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  };
  return `${baseClasses} ${variants[variant]}`;
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({
  className,
  variant = "default",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant }), className)}
      {...props}
    />
  );
}
