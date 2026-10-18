"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Settings, X } from "lucide-react";

import { useOwnerTheme } from "@/components/design-system/theme-provider";
import { ScoreDelaySlider } from "@/components/sports/score-delay-control";
import { useScoreDelaySeconds } from "@/components/sports/use-score-delay";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { scoreDelayLabel } from "@/lib/score-delay";
import { cn } from "@/lib/utils";

/** Header and menu button. Opens the site-wide settings. */
export function SiteSettings({ className }: { className?: string }) {
  const delay = useScoreDelaySeconds();
  const title = delay ? `Settings, scores delayed ${scoreDelayLabel(delay)}` : "Settings";
  return (
    <Dialog.Root>
      <Dialog.Trigger
        type="button"
        aria-label={title}
        title={title}
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md text-foreground transition hover:bg-muted",
          className
        )}
      >
        <Settings className="size-4" aria-hidden />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[80] bg-black/40" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-[80] flex max-h-[min(40rem,calc(100dvh-2rem))] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-[8px] border border-border bg-background p-4 text-foreground shadow-[0_24px_60px_-24px_rgb(0_0_0/0.45)] outline-none">
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="type-title">Settings</Dialog.Title>
            <Dialog.Close
              type="button"
              aria-label="Close settings"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </div>
          <SettingsForm />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SettingsForm() {
  const { scheme, surface, motion, setScheme, setSurface, setMotion } = useOwnerTheme();
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <h3 className="type-body-sm font-semibold">Appearance</h3>
        <SegmentedControl
          label="Color"
          value={scheme}
          options={[
            { id: "system", label: "System" },
            { id: "light", label: "Light" },
            { id: "dark", label: "Dark" },
          ]}
          onChange={setScheme}
        />
        <SegmentedControl
          label="Cards"
          value={surface}
          options={[
            { id: "glass", label: "Glass" },
            { id: "solid", label: "Solid" },
          ]}
          onChange={setSurface}
        />
        <p className="type-caption text-muted-foreground">
          Glass keeps the see-through cards. Solid fills them in.
        </p>
      </section>
      <section className="flex flex-col gap-3 border-t border-border pt-5">
        <h3 className="type-body-sm font-semibold">Motion</h3>
        <SegmentedControl
          label="Charts and hovers"
          value={motion}
          options={[
            { id: "system", label: "System" },
            { id: "reduce", label: "Reduced" },
          ]}
          onChange={setMotion}
        />
        <p className="type-caption text-muted-foreground">
          Reduced skips the hover lifts and the chart draws. System follows the device.
        </p>
      </section>
      <section className="border-t border-border pt-5">
        <ScoreDelaySlider />
      </section>
    </div>
  );
}
