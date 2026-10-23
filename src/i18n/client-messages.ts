import type { AbstractIntlMessages } from "next-intl";

/**
 * Namespaces required by Client Components that call useTranslations.
 * Root layout ships these into NextIntlClientProvider.
 *
 * Arcade game packs and deep GM UI stay out of the default root set — those
 * routes nest a provider with pickRouteClientMessages(...).
 */
export const SHELL_MESSAGE_NAMESPACES = [
  "Common",
  "Nav",
  "Search",
  "Settings",
  "Footer",
  "Theme",
  "Errors",
] as const;

/** High-traffic client islands (home, boards, compare, detail chrome). */
export const ROOT_CLIENT_MESSAGE_NAMESPACES = [
  ...SHELL_MESSAGE_NAMESPACES,
  "Home",
  "Standings",
  "Players",
  "Ask",
  "Learn",
  "Scores",
  "Compare",
  "History",
  "Franchises",
  "Explore",
  "PlayerDetail",
  "TeamDetail",
] as const;

/** Full audit list including route-scoped packs (`/games/[gameId]`, `/findings`, arcade, GM). */
export const CLIENT_MESSAGE_NAMESPACES = [
  ...ROOT_CLIENT_MESSAGE_NAMESPACES,
  "Gm",
  "GmUi",
  "Arcade",
  "ArcadeDaily",
  "ArcadeHL",
  "ArcadeZero",
  "ArcadeChain",
  "ArcadeOneShot",
  "Games",
  "Findings",
] as const;

export type ClientMessageNamespace = (typeof CLIENT_MESSAGE_NAMESPACES)[number];

export function pickClientMessages(
  messages: AbstractIntlMessages,
  namespaces: readonly string[] = ROOT_CLIENT_MESSAGE_NAMESPACES
): AbstractIntlMessages {
  const out: AbstractIntlMessages = {};
  for (const ns of namespaces) {
    const value = (messages as Record<string, unknown>)[ns];
    if (value !== undefined) {
      (out as Record<string, unknown>)[ns] = value;
    }
  }
  return out;
}

export function pickRouteClientMessages(
  messages: AbstractIntlMessages,
  extras: readonly string[]
): AbstractIntlMessages {
  return pickClientMessages(messages, [
    ...ROOT_CLIENT_MESSAGE_NAMESPACES,
    ...extras,
  ]);
}
