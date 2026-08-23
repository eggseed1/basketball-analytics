/** Empty / synthetic NBA fallbacks like "Player 1628983". */
export function isSyntheticPlayerDisplayName(
  name: string | null | undefined
): boolean {
  const trimmed = name?.trim();
  if (!trimmed) return true;
  if (/^Player \d+$/i.test(trimmed)) return true;
  if (/^\d+$/.test(trimmed)) return true;
  return false;
}

export function usablePlayerDisplayName(
  name: string | null | undefined
): string | undefined {
  if (isSyntheticPlayerDisplayName(name)) return undefined;
  return name!.trim();
}

export function firstUsablePlayerDisplayName(
  ...names: Array<string | null | undefined>
): string | undefined {
  for (const name of names) {
    const usable = usablePlayerDisplayName(name);
    if (usable) return usable;
  }
  return undefined;
}
