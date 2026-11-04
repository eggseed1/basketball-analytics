"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Heart, MessageCircle, Repeat2, Sparkles, Users, Radio, Bookmark, TrendingUp } from "lucide-react";
import { GmPlayerPortrait } from "@/gm/ui/gm-player-portrait";
import { TeamLogo } from "@/components/brand/team-logo";
import { useGmStore } from "@/gm/state/gm-store";
import { socialAccount, socialTimeline, socialTrends } from "@/gm/engine/social-timeline";
import type { SocialPost, SocialCategory } from "@/gm/engine/social-timeline";
import type { GmLeagueState } from "@/gm/types";
import { cn } from "@/lib/utils";

type Filter = "for-you" | "team" | "news" | "fans" | "injuries" | "draft" | "following" | "liked";
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "for-you", label: "For you" },
  { key: "team", label: "Your team" },
  { key: "news", label: "Breaking" },
  { key: "fans", label: "The replies" },
  { key: "injuries", label: "Availability" },
  { key: "draft", label: "Draft & deals" },
  { key: "following", label: "Following" },
  { key: "liked", label: "Liked" },
];
function textCount(n: number) {
  return n >= 1000000 ? (n / 1000000).toFixed(1) + "M"
    : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "K" : String(n);
}
function dayLabel(post: SocialPost) {
  return (post.season - 1) + "-" + String(post.season).slice(-2) + " · day " + (post.day + 1);
}
function isReporter(id: string) {
  return ["wire", "injury", "numbers", "film", "cap"].includes(id);
}
function isFun(id: string) {
  return ["bench", "panic", "burner", "sicko", "rings"].includes(id) || id.startsWith("fan:");
}
function eventMatches(posts: SocialPost[], filter: Filter, league: GmLeagueState): boolean {
  if (filter === "team") return posts.some(p => p.teamId === league.userTeamId);
  if (filter === "news") return posts.some(p =>
    isReporter(p.accountId) && ["news", "trade", "draft", "awards", "game"].includes(p.category));
  if (filter === "fans") return posts.some(p => isFun(p.accountId));
  if (filter === "injuries") return posts.some(p => p.category === "injury");
  if (filter === "draft") return posts.some(p => p.category === "draft" || p.category === "trade");
  if (filter === "following") return posts.some(p => (league.socialFollowing ?? []).includes(p.accountId));
  if (filter === "liked") return posts.some(p => (league.socialLikes ?? []).includes(p.id));
  return true;
}
function AccountAvatar({ id, teamId }: { id: string; teamId?: string }) {
  const account = socialAccount(id, teamId);
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 text-[11px] font-black tracking-tight text-white"
      style={{ backgroundColor: account.accent }} aria-hidden="true">
      {account.initials}
    </div>
  );
}
function SocialMessage({ post, league, nested = false }: {
  post: SocialPost; league: GmLeagueState; nested?: boolean;
}) {
  const toggleLike = useGmStore(s => s.toggleSocialLike);
  const toggleFollow = useGmStore(s => s.toggleSocialFollow);
  const liked = (league.socialLikes ?? []).includes(post.id);
  const followed = (league.socialFollowing ?? []).includes(post.accountId);
  const account = socialAccount(post.accountId, post.teamId);
  const player = post.playerId ? league.players.find(p => p.id === post.playerId) : undefined;
  return (
    <article className={cn("relative flex gap-3", nested ? "ml-7 border-l-2 border-border/70 py-3 pl-4" : "py-4")}
      data-social-post={post.id} data-social-voice={account.voice}>
      <AccountAvatar id={post.accountId} teamId={post.teamId} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
          <span className="font-bold text-foreground">{account.name}</span>
          {account.voice === "reporter" || account.voice === "injuries"
            ? <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">REPORT</span>
            : account.parody || account.voice === "burner" || account.voice === "meme"
              ? <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">PARODY</span>
              : null}
          <span className="truncate text-muted-foreground">{account.handle}</span>
          <span className="text-muted-foreground">· {dayLabel(post)}</span>
        </div>
        <p className="mt-1.5 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">{post.text}</p>
        {!nested && (post.teamId || player) ? (
          <div className="mt-2 flex items-center gap-2">
            {post.teamId ? <TeamLogo teamKey={post.teamId} size="xs" /> : null}
            {player ? <GmPlayerPortrait player={player} size="xs" /> : null}
            <Link href={post.href} className="text-xs font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              View league event
            </Link>
          </div>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5" title="Simulated reactions"><Repeat2 size={14} aria-hidden="true" /> {textCount(post.reposts)}</span>
            <button type="button" aria-pressed={liked}
              aria-label={(liked ? "Unlike " : "Like ") + account.name + " post"}
              onClick={() => toggleLike(post.id)}
              className={cn("inline-flex items-center gap-1.5 hover:text-foreground", liked && "text-rose-500")}>
              <Heart size={14} fill={liked ? "currentColor" : "none"} aria-hidden="true" />
              {textCount(post.likes + (liked ? 1 : 0))}
            </button>
          </div>
          <button type="button" onClick={() => toggleFollow(post.accountId)} aria-pressed={followed}
            className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold hover:bg-secondary">
            {followed ? "Following" : "Follow"}
          </button>
        </div>
      </div>
    </article>
  );
}
export function GmSocialTimeline({ compact = false }: { compact?: boolean }) {
  const league = useGmStore(s => s.league);
  const [filter, setFilter] = useState<Filter>("for-you");
  const [sort, setSort] = useState<"latest" | "top">("latest");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [limit, setLimit] = useState(18);
  if (!league) return null;
  const allPosts = socialTimeline(league);
  const byEvent = new Map<string, SocialPost[]>();
  for (const post of allPosts) byEvent.set(post.eventId, [...(byEvent.get(post.eventId) ?? []), post]);
  const groups = [...byEvent.entries()].map(([key, posts]) => ({
    key, posts: [...posts].sort((a, b) => Number(Boolean(a.replyTo)) - Number(Boolean(b.replyTo)) || a.id.localeCompare(b.id)),
    heat: Math.max(...posts.map(p => p.heat)),
    season: posts[0]!.season,
    day: posts[0]!.day,
  })).filter(group => eventMatches(group.posts, filter, league))
    .sort((a, b) => sort === "top"
      ? b.heat - a.heat || b.season - a.season || b.day - a.day
      : b.season - a.season || b.day - a.day || b.heat - a.heat || a.key.localeCompare(b.key));
  if (compact) {
    return (
      <section className="sports-card p-4" aria-label="League social timeline preview">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold"><MessageCircle size={17} aria-hidden="true" /> The Timeline</h2>
          <Link href="/gm/timeline" className="text-xs font-semibold text-muted-foreground hover:underline">See all reactions</Link>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Fictional in-game accounts · based on your league</p>
        <div className="mt-2 divide-y divide-border">
          {groups.slice(0, 2).map(group => (
            <div key={group.key} className="py-3">
              <p className="text-xs font-bold">{socialAccount(group.posts[0]!.accountId, group.posts[0]!.teamId).name}</p>
              <p className="mt-1 text-sm">{group.posts[0]!.text}</p>
              {group.posts.length > 1 ? <span className="mt-1 inline-block text-xs text-muted-foreground">{group.posts.length - 1} replies</span> : null}
            </div>
          ))}
        </div>
      </section>
    );
  }
  const trending = socialTrends(allPosts.slice(0, 140), league.userTeamId);
  return (
    <div className="flex flex-col gap-4" data-testid="gm-social-timeline">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight"><Radio size={22} aria-hidden="true" /> The Timeline</h1>
          <p className="mt-1 text-sm text-muted-foreground">A fictional NBA social feed reacting to your league, not real social media.</p>
        </div>
        <span className="rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-xs font-semibold">
          {allPosts.length} posts · Season {league.season - 1}-{String(league.season).slice(-2)}
        </span>
      </div>
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card" aria-label="Basketball social feed">
          <div className="border-b border-border px-4 py-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter timeline">
              {FILTERS.map(option => (
                <button type="button" key={option.key} onClick={() => { setFilter(option.key); setLimit(18); }}
                  aria-pressed={filter === option.key}
                  className={cn("rounded-full px-3 py-1.5 text-xs font-semibold transition-colors", filter === option.key
                    ? "bg-foreground text-background" : "bg-secondary/50 text-muted-foreground hover:text-foreground")}>
                  {option.label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span><Sparkles size={13} aria-hidden="true" className="mr-1 inline" /> Based on real events inside this save</span>
              <label className="inline-flex items-center gap-2">
                Sort
                <select aria-label="Timeline sort" value={sort} onChange={e => setSort(e.target.value as "latest" | "top")}
                  className="rounded border border-border bg-background px-2 py-1 text-foreground">
                  <option value="latest">Latest</option><option value="top">Trending</option>
                </select>
              </label>
            </div>
          </div>
          <div className="divide-y divide-border px-4">
            {groups.slice(0, limit).map(group => {
              const root = group.posts.find(p => !p.replyTo) ?? group.posts[0]!;
              const replies = group.posts.filter(p => p.id !== root.id);
              const isOpen = expanded.includes(group.key);
              return (
                <div key={group.key} data-social-event={group.key} className="min-w-0">
                  <SocialMessage post={root} league={league} />
                  {replies.length ? (
                    <div className="pb-3">
                      <button type="button" className="ml-12 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                        aria-expanded={isOpen} aria-label={(isOpen ? "Hide" : "Show") + " replies to " + root.id}
                        onClick={() => setExpanded(current => isOpen ? current.filter(x => x !== group.key) : [...current, group.key])}>
                        <MessageCircle size={13} aria-hidden="true" /> {isOpen ? "Hide replies" : "View " + replies.length + " reactions"}
                      </button>
                      {isOpen ? <div className="mt-1">{replies.map(post => <SocialMessage key={post.id} post={post} league={league} nested />)}</div> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!groups.length ? (
              <div className="px-4 py-12 text-center">
                <Users className="mx-auto text-muted-foreground" size={24} aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold">No posts in this view yet.</p>
                <p className="mt-1 text-xs text-muted-foreground">Play games, make moves, or follow accounts to fill your timeline.</p>
                <button onClick={() => setFilter("for-you")} className="mt-3 text-xs font-semibold underline">See the full timeline</button>
              </div>
            ) : null}
          </div>
          {groups.length > limit ? (
            <div className="border-t border-border p-3 text-center">
              <button type="button" className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary"
                onClick={() => setLimit(n => n + 20)}>Load more reactions</button>
            </div>
          ) : null}
        </section>
        <aside className="flex flex-col gap-3 lg:sticky lg:top-4" aria-label="Timeline sidebar">
          <div className="sports-card p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold"><TrendingUp size={16} aria-hidden="true" /> Trending in your league</h2>
            <div className="mt-3 divide-y divide-border">
              {trending.map((entry, index) => {
                const team = league.teams.find(t => t.id === entry.teamId);
                return <button type="button" key={entry.teamId} className="flex w-full items-center gap-2 py-2 text-left"
                  onClick={() => setFilter(entry.teamId === league.userTeamId ? "team" : "for-you")}>
                  <span className="w-3 text-xs text-muted-foreground">{index + 1}</span>
                  <TeamLogo teamKey={entry.teamId} size="xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{team?.city ?? entry.teamId} basketball</span>
                    <span className="block text-[11px] text-muted-foreground">{entry.posts} posts in rotation</span>
                  </span>
                </button>;
              })}
            </div>
          </div>
          <div className="sports-card p-4">
            <h2 className="text-sm font-bold">Who to follow</h2>
            <p className="mt-1 text-xs text-muted-foreground">Original fictional accounts. Reporters share simulated facts; fans and burners are satire.</p>
            <div className="mt-3 grid gap-2">
              {(["wire", "injury", "numbers", "sicko", "bench", "burner"] as const).map(id => {
                const account = socialAccount(id);
                const followed = (league.socialFollowing ?? []).includes(id);
                return (
                  <div key={id} className="flex items-center gap-2">
                    <AccountAvatar id={id} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">{account.name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{account.handle}</p>
                    </div>
                    <button type="button" aria-pressed={followed}
                      onClick={() => useGmStore.getState().toggleSocialFollow(id)}
                      className="rounded-full border border-border px-2 py-1 text-[10px] font-bold hover:bg-secondary">
                      {followed ? "Following" : "Follow"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
            <Bookmark size={12} aria-hidden="true" className="mr-1 inline" />
            Likes and follows stay with this franchise save. Engagement counts are fictional, and no content is sent to social platforms.
          </p>
        </aside>
      </div>
    </div>
  );
}
