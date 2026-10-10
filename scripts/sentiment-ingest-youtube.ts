/**
 * Score top comments on the newest uploads of official team channels, team
 * podcast/fan channels and league/show channels via the YouTube Data API, and
 * append hashed ids + scores to data/sentiment/ingest/v1/youtube. Comment
 * text, authors and like counts are not stored.
 *
 *   YOUTUBE_API_KEY=... npm run sentiment:ingest:youtube
 *
 * One quota unit per uploads list and per comment page: at most 21 per team
 * channel and 76 per league channel, about 4,100 of the free 10,000 daily
 * units if every video has that many comments (most don't). Without a key
 * the script prints a notice and exits 0. With CLOUDFLARE_AI_TOKEN and
 * CLOUDFLARE_ACCOUNT_ID set, up to modelPairsPerRun new comment-player pairs
 * also get a tone model rating (scripts/lib/fan-tone.ts) before the text is dropped.
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

import { sampleOutputPath, writeSample } from "./lib/fan-eval-sample";
import { fanPostId, freshFanPosts, legacyFanPostId, requireFanPostKey } from "./lib/fan-post-id";
import { rateNewFanPosts } from "./lib/fan-tone";

type YoutubeConfig = {
  videosPerChannel: number;
  maxVideoAgeDays: number;
  commentsPerVideo: number;
  officialCommentPagesPerVideo?: number;
  teamFanVideosPerChannel: number;
  teamFanCommentPagesPerVideo?: number;
  leagueVideosPerChannel: number;
  leagueCommentPagesPerVideo: number;
  /** Most new comment-player pairs sent to the tone model per run; the rest keep the word-list score. */
  modelPairsPerRun?: number;
  channels: { teamId: string; channelId: string; name: string }[];
  teamFanChannels: { teamId: string; channelId: string; name: string }[];
  leagueChannels: { channelId: string; name: string; multiSport?: boolean }[];
};

type ChannelPlan = {
  channelId: string;
  name: string;
  teamId: string | null;
  videos: number;
  pages: number;
  /** Only videos whose title names a rostered player in full or says NBA. */
  multiSport: boolean;
};

type PlaylistItem = {
  snippet?: { title?: string };
  contentDetails: { videoId: string; videoPublishedAt?: string };
};
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
      "sentiment:ingest:youtube skipped: set YOUTUBE_API_KEY (Google Cloud, YouTube Data API v3) to add NBA channel comments to the fan lane."
    );
    return;
  }
  const config = JSON.parse(
    readFileSync(path.join(process.cwd(), "data", "sentiment", "sources", "v1", "youtube.json"), "utf8")
  ) as YoutubeConfig;
  const roster = loadIngestRoster();
  const nameById = new Map(roster.map((p) => [p.playerId, p.name]));
  const resolve = createHeadlineEntityResolver(roster);
  const resolveFullNames = createHeadlineEntityResolver(roster, { fullNamesOnly: true });
  // One nickname like Kings or Heat is ambiguous across sports; two rarely are.
  const isNbaTitle = (title: string) => {
    const entities = resolveFullNames(title);
    return /\bNBA\b/.test(title) || entities.playerIds.length > 0 || entities.teamIds.length >= 2;
  };
  const fetchedAt = new Date().toISOString();
  const oldestVideoMs = Date.now() - config.maxVideoAgeDays * 86_400_000;
  const rows = new Map<string, FanPostIngestItem>();
  const samplePath = sampleOutputPath();
  const textById = new Map<string, string>();
  const legacyIdOf = new Map<string, string>();
  const dryRun = process.argv.includes("--dry-run") || samplePath !== null;
  if (!dryRun) requireFanPostKey();
  let failures = 0;
  const allPlans: ChannelPlan[] = [
    ...config.channels.map((c) => ({
      channelId: c.channelId,
      name: c.name,
      teamId: c.teamId,
      videos: config.videosPerChannel,
      pages: config.officialCommentPagesPerVideo ?? 1,
      multiSport: false,
    })),
    ...(config.teamFanChannels ?? []).map((c) => ({
      channelId: c.channelId,
      name: c.name,
      teamId: c.teamId,
      videos: config.teamFanVideosPerChannel,
      pages: config.teamFanCommentPagesPerVideo ?? 1,
      multiSport: false,
    })),
    ...(config.leagueChannels ?? []).map((c) => ({
      channelId: c.channelId,
      name: c.name,
      teamId: null,
      videos: config.leagueVideosPerChannel,
      pages: config.leagueCommentPagesPerVideo,
      multiSport: Boolean(c.multiSport),
    })),
  ];
  const channelCap = Number(process.argv[process.argv.indexOf("--sample-channels") + 1]);
  const plans =
    samplePath && process.argv.includes("--sample-channels") && channelCap > 0
      ? allPlans.filter((_, i) => i % Math.ceil(allPlans.length / channelCap) === 0)
      : allPlans;

  for (const channel of plans) {
    let kept = 0;
    try {
      const uploads = await api<{ items?: PlaylistItem[] }>(
        "playlistItems",
        {
          part: channel.teamId ? "contentDetails" : "snippet,contentDetails",
          playlistId: `UU${channel.channelId.slice(2)}`,
          maxResults: channel.multiSport ? "50" : String(Math.min(50, Math.max(10, channel.videos * 2))),
        },
        key
      );
      const videos = (uploads.items ?? [])
        .filter((item) => Date.parse(item.contentDetails.videoPublishedAt ?? "") >= oldestVideoMs)
        .filter((item) => !channel.multiSport || isNbaTitle(item.snippet?.title ?? ""))
        .slice(0, channel.videos);
      for (const video of videos) {
        // League channels have no home team, so a comment that names nobody
        // borrows the video title's subject when the title names one player.
        const titleEntities = channel.teamId ? null : resolve(video.snippet?.title ?? "");
        const videoHash = createHash("sha1").update(video.contentDetails.videoId).digest("hex").slice(0, 16);
        const threads: CommentThread[] = [];
        let pageToken: string | undefined;
        try {
          for (let pageIndex = 0; pageIndex < channel.pages; pageIndex += 1) {
            const page = await api<{ items?: CommentThread[]; nextPageToken?: string }>(
              "commentThreads",
              {
                part: "snippet",
                videoId: video.contentDetails.videoId,
                maxResults: String(config.commentsPerVideo),
                order: "relevance",
                textFormat: "plainText",
                ...(pageToken ? { pageToken } : {}),
              },
              key
            );
            threads.push(...(page.items ?? []));
            pageToken = page.nextPageToken;
            if (!pageToken) break;
          }
        } catch (error) {
          if (!(error instanceof YoutubeError && error.reason === "commentsDisabled")) throw error;
        }
        for (const thread of threads) {
          const comment = thread.snippet.topLevelComment.snippet;
          if (comment.authorChannelId?.value === channel.channelId) continue;
          const text = (comment.textOriginal ?? "").slice(0, 300);
          if (text.trim().length < 12 || /https?:\/\/|www\./i.test(text)) continue;
          const entities = resolve(text);
          if (titleEntities && !entities.playerIds.length && !entities.teamIds.length) {
            if (titleEntities.playerIds.length === 1) entities.playerIds = titleEntities.playerIds;
            if (titleEntities.teamIds.length <= 2) entities.teamIds = titleEntities.teamIds;
          }
          if (!channel.teamId && !entities.playerIds.length && !entities.teamIds.length) continue;
          const tone = scoreFanText(
            text,
            entities.playerIds.map((pid) => nameById.get(pid)!).filter(Boolean)
          );
          const id = fanPostId(thread.id);
          legacyIdOf.set(id, legacyFanPostId(thread.id));
          rows.set(id, {
            id,
            platform: "youtube",
            source: channel.channelId,
            thread: videoHash,
            createdAt: new Date(comment.publishedAt).toISOString(),
            fetchedAt,
            score: tone.score,
            topics: tagHeadlineTopics(text),
            playerIds: entities.playerIds,
            teamIds: channel.teamId ? [channel.teamId] : entities.teamIds,
            modelVersion: FAN_LEXICON_VERSION,
          });
          kept += 1;
          textById.set(id, text);
          if (dryRun && !samplePath && kept <= 2) {
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
  if (samplePath) writeSample(samplePath, [...rows.values()], textById, nameById);
  if (dryRun) {
    console.log(`sentiment:ingest:youtube dry run kept=${rows.size}`);
    return;
  }
  const all = freshFanPosts("youtube", [...rows.values()], legacyIdOf, new Date());
  await rateNewFanPosts({
    source: "youtube",
    rows: all,
    textById,
    nameById,
    maxPairs: config.modelPairsPerRun ?? 0,
  });
  const added = appendIngestItems("youtube", all, (row) => row.createdAt);
  console.log(
    `sentiment:ingest:youtube kept=${all.length} new=${added} mentioningPlayers=${all.filter((r) => r.playerIds.length).length}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
