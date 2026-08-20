import {
  LOCAL_SAMPLE_PLAYER_COUNT,
  describeProvider,
} from "@/data/diagnostics/provider-meta";
import { getDataProvider } from "@/data/providers";

/**
 * Development-only provider chip. No board network calls.
 */
export function DataProviderDevBadge() {
  if (process.env.NODE_ENV === "production") return null;

  const provider = getDataProvider();
  const meta = describeProvider(provider.name);
  const text = meta.isSample
    ? `Data: Local sample · ${LOCAL_SAMPLE_PLAYER_COUNT} players`
    : meta.isLive
      ? "Data: Live NBA"
      : `Data: ${meta.name}`;

  return (
    <div
      className="border-b border-border/60 bg-secondary/40 px-3 py-1.5 text-center text-[12px] font-semibold tracking-wide text-muted-foreground"
      role="status"
    >
      {text}
      <span className="mx-2 text-border">·</span>
      <span className="font-normal">
        {meta.description}
        {meta.isSample
          ? " - not the full NBA board"
          : " - player boards load from ESPN"}
      </span>
    </div>
  );
}
