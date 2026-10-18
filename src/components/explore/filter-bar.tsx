"use client";

import type { CSSProperties, ReactNode } from "react";

import { GlassSurface } from "@/components/brand/glass-surface";
import { ChoiceTrack } from "@/components/ui/choice-chip";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const subtleStyle = {
  background: "var(--material-subtle-bg)",
  backdropFilter: "blur(12px) saturate(140%)",
  WebkitBackdropFilter: "blur(12px) saturate(140%)",
  "--lit-hairline": "rgb(0 0 0 / 0.05)",
  "--lit-drop-shadow": "0 1px 2px rgb(0 0 0 / 0.03)",
} as CSSProperties;

export const filterSelectTriggerClass =
  "h-7 border-0 bg-transparent shadow-none hover:bg-foreground/10 dark:bg-transparent dark:hover:bg-foreground/10 data-[size=default]:h-7 px-2.5 text-[12px] font-semibold";

/** Glass filter bar used by the player and team boards. */
export function FilterBar({
  label,
  pending,
  children,
  className,
}: {
  label: string;
  pending?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <GlassSurface
      effect="css"
      overflowVisible
      className={cn(
        "relative z-40 w-full min-w-0 max-w-full p-2 sm:p-3",
        pending && "opacity-70",
        className
      )}
      style={subtleStyle}
    >
      <div
        className="flex w-full min-w-0 max-w-full flex-col gap-2"
        aria-label={label}
        data-pending={pending ? "true" : "false"}
      >
        {children}
      </div>
    </GlassSurface>
  );
}

export type FilterOption = { value: string; label: string; group?: string };

/** Borderless select sitting in a choice track, matching the board filters. */
export function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  className,
  icon,
  trackClassName,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  placeholder?: string;
  className?: string;
  icon?: ReactNode;
  trackClassName?: string;
}) {
  const selected = options.find((option) => option.value === value);
  const groups: Array<{ name: string; options: FilterOption[] }> = [];
  const loose: FilterOption[] = [];
  for (const option of options) {
    if (!option.group) {
      loose.push(option);
      continue;
    }
    const existing = groups.find((group) => group.name === option.group);
    if (existing) existing.options.push(option);
    else groups.push({ name: option.group, options: [option] });
  }

  return (
    <ChoiceTrack className={trackClassName}>
      <Select
        value={value || null}
        onValueChange={(next) => {
          if (next != null) onChange(String(next));
        }}
      >
        <SelectTrigger
          id={id}
          aria-label={label}
          className={cn(filterSelectTriggerClass, "max-w-[16rem]", className)}
        >
          {icon}
          <SelectValue placeholder={placeholder ?? label}>
            {selected?.label ?? placeholder ?? label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="start" side="bottom" alignItemWithTrigger={false}>
          {loose.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
          {groups.map((group) => (
            <SelectGroup key={group.name}>
              <SelectLabel className="px-2 pt-2 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                {group.name}
              </SelectLabel>
              {group.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </ChoiceTrack>
  );
}
