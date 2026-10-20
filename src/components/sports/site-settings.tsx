"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Settings, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { useOwnerTheme } from "@/components/design-system/theme-provider";
import { LanguageSelect } from "@/components/sports/language-select";
import { ScoreDelaySlider } from "@/components/sports/score-delay-control";
import { useScoreDelaySeconds } from "@/components/sports/use-score-delay";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { scoreDelayLabel } from "@/lib/score-delay";
import { cn } from "@/lib/utils";

/** Header and menu button. Opens the site-wide settings. */
export function SiteSettings({ className }: { className?: string }) {
  const t = useTranslations("Settings");
  const delay = useScoreDelaySeconds();
  const title = delay
    ? t("titleDelayed", { delay: scoreDelayLabel(delay) })
    : t("title");
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
            <Dialog.Title className="type-title">{t("title")}</Dialog.Title>
            <Dialog.Close
              type="button"
              aria-label={t("close")}
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
  const t = useTranslations("Settings");
  const { scheme, surface, motion, setScheme, setSurface, setMotion } =
    useOwnerTheme();
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <h3 className="type-body-sm font-semibold">{t("language")}</h3>
        <LanguageSelect />
      </section>
      <section className="flex flex-col gap-3 border-t border-border pt-5">
        <h3 className="type-body-sm font-semibold">{t("appearance")}</h3>
        <SegmentedControl
          label={t("color")}
          value={scheme}
          options={[
            { id: "system", label: t("system") },
            { id: "light", label: t("light") },
            { id: "dark", label: t("dark") },
          ]}
          onChange={setScheme}
        />
        <SegmentedControl
          label={t("cards")}
          value={surface}
          options={[
            { id: "glass", label: t("glass") },
            { id: "solid", label: t("solid") },
          ]}
          onChange={setSurface}
        />
        <p className="type-caption text-muted-foreground">{t("cardsHint")}</p>
      </section>
      <section className="flex flex-col gap-3 border-t border-border pt-5">
        <h3 className="type-body-sm font-semibold">{t("motion")}</h3>
        <SegmentedControl
          label={t("chartsHovers")}
          value={motion}
          options={[
            { id: "system", label: t("system") },
            { id: "reduce", label: t("reduce") },
          ]}
          onChange={setMotion}
        />
        <p className="type-caption text-muted-foreground">{t("motionHint")}</p>
      </section>
      <section className="border-t border-border pt-5">
        <ScoreDelaySlider />
      </section>
    </div>
  );
}
