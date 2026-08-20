"use client";

import type { ComponentProps } from "react";

import { AppLink } from "@/components/ui/app-link";
import { textLinkClassName } from "@/lib/design-system";
import { cn } from "@/lib/utils";

type TextLinkProps = ComponentProps<typeof AppLink>;

/**
 * Inline navigation text - underlined + semibold.
 * Use for "See all …", player/team names, and other text links.
 * Nav pills and icon buttons stay on Button / sports-pill.
 */
export function TextLink({ className, ...props }: TextLinkProps) {
  return <AppLink className={cn(textLinkClassName, className)} {...props} />;
}
