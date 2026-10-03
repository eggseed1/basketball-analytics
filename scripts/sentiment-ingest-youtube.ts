/**
 * Score top comments on each team channel's newest uploads via the YouTube
 * Data API and append hashed ids + scores to data/sentiment/ingest/v1/youtube.
 * Comment text, authors and like counts are not stored.
 *
 *   YOUTUBE_API_KEY=... npm run sentiment:ingest:youtube
 *
 * About 6 quota units per team per run (one uploads list, five comment
 * pages), roughly 180 of the free 10,000 daily units.
 * Without a key the script prints a notice and exits 0.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { createHeadlineEntityResolver } from "@/sentiment/headline-entities";
import {
  FAN_LEXICON_VERSION,
  scoreFanText,
  tagHeadlineTopics,
} from "@/sentiment/headline-lexicon";
import { loadIngestRoster } from "@/sentiment/ingest-roster";
import { appendIngestItems, type FanPostIngestItem } from "@/sentiment/ingest-store";

type YoutubeConfig = {
  videosPerChannel: number;
  maxVideoAgeDays: number;
  commentsPerVideo: number;
  channels: { teamId: string; channelId: string; name: string }[];
};

type PlaylistItem = { contentDetails: { videoId: string; videoPublishedAt?: string } };
type CommentThread = {
  id: string;
  snippet: {
    topLevelComment: {
      snippet: {
        textOriginal?: string;
        publishedAt: string;
        authorChannelId?: { value: string };
      };
    };
  };
};

const API = "https://www.googleapis.com/youtube/v3";

class YoutubeError extends Error {
  constructor(
    message: string,
    readonly reason: string | null
  ) {
    super(message);
  }
}

async function api<T>(endpoint: string, params: Record<string, string>, key: string): Promise<T> {
  const query = new URLSearchParams({ ...params, key });
  const response = await fetch(`${API}/${endpoint}?${query}`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { errors?: { reason?: string }[] };
    } | null;
    const reason = body?.error?.errors?.[0]?.reason ?? null;
    throw new YoutubeError(`HTTP ${response.status}${reason ? ` ${reason}` : ""}`, reason);
  }
  return (await response.json()) as T;
}

async function main() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    console.log(
      "sentiment:ingest:youtube skipped: set YOUTUBE_API_KEY (Google Cloud, YouTube Data API v3) to add team-channel comments to the fan lane."
    );
    return;
  }
  const config = JSON.parse(
    readFileSync(path.join(process.cwd(), "data", "sentiment", "sources", "v1", "youtube.json"), "utf8")
  ) as YoutubeConfig;
  const roster = loadIngestRoster();
  const nameById = new Map(roster.map((p) => [p.playerId, p.name]));
  const resolve = createHeadlineEntityResolver(roster);
  const fetchedAt = new Date().toISOString();
  const oldestVideoMs = Date.now() - config.maxVideoAgeDays * 86_400_000;
  const rows = new Map<string, FanPostIngestItem>();
  const dryRun = process.argv.includes("--dry-run");
  let failures = 0;

  for (const channel of config.channels) {
    let kept = 0;
    try {
      const uploads = await api<{ items?: PlaylistItem[] }>(
        "playlistItems",
        { part: "contentDetails", playlistId: `UU${channel.channelId.slice(2)}`, maxResults: "10" },
        key
      );
      const videos = (uploads.items ?? [])
        .filter((item) => Date.parse(item.contentDetails.videoPublishedAt ?? "") >= oldestVideoMs)
        .slice(0, config.videosPerChannel);
      for (const video of videos) {
        let threads: CommentThread[] = [];
        try {
          const page = await api<{ items?: CommentThread[] }>(
            "commentThreads",
            {
              part: "snippet",
              videoId: video.contentDetails.videoId,
              maxResults: String(config.commentsPerVideo),
              order: "relevance",
              textFormat: "plainText",
            },
            key
          );
          threads = page.items ?? [];
        } catch (error) {
          if (error instanceof YoutubeError && error.reason === "commentsDisabled") continue;
          throw error;
        }
        for (const thread of threads) {
          const comment = thread.snippet.topLevelComment.snippet;
          if (comment.authorChannelId?.value === channel.channelId) continue;
          const text = (comment.textOriginal ?? "").slice(0, 300);
          if (text.trim().length < 12 || /https?:\/\/|www\./i.test(text)) continue;
          const entities = resolve(text);
          const tone = scoreFanText(
            text,
            entities.playerIds.map((pid) => nameById.get(pid)!).filter(Boolean)
          );
          const id = createHash("sha1").update(thread.id).digest("hex").slice(0, 16);
          rows.set(id, {
            id,
            platform: "youtube",
            source: channel.channelId,
            createdAt: new Date(comment.publishedAt).toISOString(),
            fetchedAt,
            score: tone.score,
            topics: tagHeadlineTopics(text),
            playerIds: entities.playerIds,
            teamIds: [channel.teamId],
            modelVersion: FAN_LEXICON_VERSION,
          });
          kept += 1;
          if (dryRun && kept <= 2) {
            console.log(`    ${tone.score.toFixed(2).padStart(5)} ${text.replace(/\s+/g, " ").slice(0, 110)}`);
          }
        }
      }
      console.log(`  ${channel.name}: ${videos.length} recent videos, kept ${kept} comments`);
    } catch (error) {
      failures += 1;
      console.warn(`  ${channel.name}: skipped (${(error as Error).message})`);
      if (error instanceof YoutubeError && /quota|keyInvalid|forbidden/i.test(error.reason ?? "")) break;
    }
  }

  if (failures && !rows.size) throw new Error("YouTube ingest kept no comments");
  const all = [...rows.values()];
  if (dryRun) {
    console.log(`sentiment:ingest:youtube dry run kept=${all.length}`);
    return;
  }
  const added = appendIngestItems("youtube", all, (row) => row.createdAt);
  console.log(
    `sentiment:ingest:youtube kept=${all.length} new=${added} mentioningPlayers=${all.filter((r) => r.playerIds.length).length}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
