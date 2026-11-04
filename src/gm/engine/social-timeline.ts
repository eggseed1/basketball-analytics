import type { GmBoxScore, GmLeagueState, GmNewsItem, GmPlayer, GmTradeProposal } from "@/gm/types";

/** Fictional, self-contained posts. No X/Twitter API, scraping, or LLM charges. */
export type SocialCategory = "news" | "game" | "injury" | "trade" | "draft" | "awards" | "fans";
export type SocialVoice = "reporter" | "analyst" | "injuries" | "fan" | "meme" | "burner";
export type SocialPost = {
  id: string; eventId: string; accountId: string;
  season: number; day: number; category: SocialCategory;
  teamId?: string; playerId?: string;
  text: string; replyTo?: string; href: string;
  heat: number; likes: number; reposts: number;
};
export type SocialAccount = {
  id: string; name: string; handle: string; voice: SocialVoice;
  bio: string; initials: string; accent: string; parody?: boolean;
};
export const SOCIAL_ACCOUNTS: readonly SocialAccount[] = [
  { id: "wire", name: "Full Court Wire", handle: "@FullCourtWire", voice: "reporter", bio: "Facts from around your league.", initials: "FW", accent: "#2474a6" },
  { id: "injury", name: "Availability Report", handle: "@AvailabilityDesk", voice: "injuries", bio: "Medical status, never rumors.", initials: "AR", accent: "#64748b" },
  { id: "numbers", name: "The Number Enjoyer", handle: "@TrueShootingDept", voice: "analyst", bio: "There is a spreadsheet for this.", initials: "TS", accent: "#218a75" },
  { id: "film", name: "Possession Police", handle: "@WatchTheWeakside", voice: "analyst", bio: "Unfortunately, I watched the whole game.", initials: "PP", accent: "#736eb6" },
  { id: "sicko", name: "Second Round Sicko", handle: "@Pick58Believer", voice: "fan", bio: "I know a sleeper when I see one. Maybe.", initials: "58", accent: "#b78024" },
  { id: "bench", name: "Deep Bench Hours", handle: "@DeepBenchHours", voice: "meme", bio: "The eighth man is my franchise player.", initials: "DB", accent: "#dc6445", parody: true },
  { id: "panic", name: "Panic in 4K", handle: "@PanicIn4K", voice: "meme", bio: "Every game is a referendum.", initials: "4K", accent: "#bc4c75", parody: true },
  { id: "burner", name: "Definitely Not The GM", handle: "@NotAnAltAccount", voice: "burner", bio: "Independent basketball opinions. Don't check my bookmarks.", initials: "ALT", accent: "#756c8e", parody: true },
  { id: "cap", name: "Luxury Tax Enthusiast", handle: "@ApronSicko", voice: "analyst", bio: "Cap sheets and emotional damage.", initials: "$", accent: "#2f886d" },
  { id: "rings", name: "Ring Culture Court", handle: "@RingsAreThePoint", voice: "fan", bio: "The championship discourse never sleeps.", initials: "RC", accent: "#a07934" },
] as const;
const SOCIAL_BY_ID = new Map(SOCIAL_ACCOUNTS.map(a => [a.id, a]));
export function socialAccount(id: string, teamId?: string): SocialAccount {
  if (id.startsWith("fan:")) {
    const tag = teamId?.toUpperCase() ?? id.slice(4).toUpperCase();
    return { id, name: tag + " Stress Department", handle: "@" + tag + "StressDept",
      voice: "fan", bio: "Local team support, with varying success.", initials: tag.slice(0, 3),
      accent: "#b46d48", parody: true };
  }
  return SOCIAL_BY_ID.get(id) ?? SOCIAL_ACCOUNTS[0]!;
}
type Event = {
  key: string; category: SocialCategory; season: number; day: number;
  teamId?: string; playerId?: string; href: string; heat: number;
  topic: string; detail: string; account: string;
  fan?: string; analyst?: string;
};
function hash(value: string): number {
  let n = 2166136261;
  for (let i = 0; i < value.length; i++) n = Math.imul(n ^ value.charCodeAt(i), 16777619);
  return n >>> 0;
}
function pick<T>(key: string, options: readonly T[]): T {
  return options[hash(key) % options.length]!;
}
function teamLabel(league: GmLeagueState, id: string): string {
  const team = league.teams.find(t => t.id === id);
  return team ? team.city + " " + team.name : id.toUpperCase();
}
function abbr(league: GmLeagueState, id: string): string {
  return league.teams.find(t => t.id === id)?.abbr ?? id.toUpperCase();
}
function playerName(league: GmLeagueState, id: string): string {
  return league.players.find(p => p.id === id)?.name ?? "a player";
}
function gameEvents(league: GmLeagueState): Event[] {
  const events: Event[] = [];
  // Old saves include up to 400 compact boxes. Keep scanning bounded.
  const boxes = league.boxScores.slice(0, 135).filter(box => box.season === league.season);
  const calendar = new Map(league.schedule.map(game => [game.id, game]));
  for (const box of boxes) {
    const p = [...box.players].sort((a, b) => b.points - a.points || b.gameScore - a.gameScore)[0];
    const margin = Math.abs(box.homeScore - box.awayScore);
    const userGame = box.homeTeamId === league.userTeamId || box.awayTeamId === league.userTeamId;
    const playoff = Boolean(box.postseason);
    const monster = p && (p.points >= 36 || (p.points >= 24 && p.assists >= 13) ||
      (p.points >= 20 && p.rebounds >= 10 && p.assists >= 10));
    const clutch = margin <= 4;
    const runaway = margin >= 24;
    if (!userGame && !playoff && !monster && !(clutch && hash(box.id) % 5 === 0) && !runaway) continue;
    const winnerId = box.homeScore > box.awayScore ? box.homeTeamId : box.awayTeamId;
    const loserId = winnerId === box.homeTeamId ? box.awayTeamId : box.homeTeamId;
    const winning = teamLabel(league, winnerId), losing = teamLabel(league, loserId);
    const high = Math.max(box.homeScore, box.awayScore), low = Math.min(box.homeScore, box.awayScore);
    const date = calendar.get(box.gameId)?.gameDate;
    const hero = p && monster ? p.playerName : undefined;
    const heroLost = Boolean(p && p.teamId !== winnerId);
    const tripleDouble = Boolean(p && p.points >= 10 && p.assists >= 10 && p.rebounds >= 10);
    const rookie = hero ? league.players.find(player => player.id === p!.playerId &&
      player.draftYear === league.season && player.draftPick != null) : undefined;
    const decisive = league.playoffBracket?.find(series =>
      series.done && series.games?.at(-1)?.gameId === box.gameId);
    const special = decisive ? "Series-clinching night. " :
      tripleDouble ? "Triple-double alert. " :
      p && p.tpm >= 9 ? "Nine-plus made threes. " : "";
    const key = "game:" + box.id;
    const context = (playoff ? "Playoff result: " : "") + winning + " " + high + ", " + losing + " " + low + ".";
    const performance = hero ? " " + hero + ": " + p!.points + " PTS, " +
      p!.rebounds + " REB, " + p!.assists + " AST" + (p!.tpm >= 5 ? ", " + p!.tpm + " threes" : "") + "." : "";
    const topic = special + context + performance +
      (rookie ? " Rookie " + rookie.name + " was selected at pick #" + rookie.draftPick + "." : "");
    const fan = heroLost && p!.points >= 40
      ? pick(key + "sad", [
          p!.points + " points and a loss. He brought the entire offense and they brought emotional damage.",
          "Someone check whether one person is legally allowed to score all those points and still lose.",
          "The plus-minus discourse is going to be unbearable after this.",
          "Box score looked like a one-person group project. Result looked like the group project.",
        ])
      : rookie && p!.points >= 30
      ? pick(key + "rookie", [
          "I am buying imaginary rookie stock at a deeply irresponsible valuation.",
          "Draft night takes are being deleted as we speak.",
          "If this is a fluke, please let me enjoy it until tomorrow.",
          "We need to have a conversation about that draft position immediately.",
        ])
      : decisive
      ? pick(key + "series", [
          "Someone is going to screenshot all of our predictions and we deserve it.",
          "We have entered the part of the playoffs where every possession becomes family history.",
          "The words 'legacy game' have been typed approximately twelve thousand times tonight.",
        ])
      : clutch
      ? pick(key + "close", [
          "My heart rate does not need to be tied to a basketball team. And yet.",
          "I aged a calendar year in the last four minutes.",
          "There are easier hobbies than watching this particular sport.",
          "That fourth quarter is going in the group chat evidence folder.",
        ])
      : runaway
      ? pick(key + "blow", [
          "This was a basketball game for approximately nine minutes.",
          "The fourth quarter was a paid vacation for the starters.",
          "At some point somebody has to tell the scoreboard to stop.",
        ])
      : pick(key + "normal", [
          "We are so back. I am not taking questions about yesterday.",
          "The discourse will be completely normal about this, surely.",
          "My team's record is a personality trait now.",
          "I have already made a wildly irresponsible playoff prediction.",
          "My agenda is winning and all opposing data is being sent to the shadow realm.",
          "Putting this performance in a 38-tweet thread about why I know ball.",
        ]);
    const analyst = hero
      ? pick(key + "hero", [
          hero + " just turned the box score into a warning label.",
          "You can argue the eye test all night. " + p!.points + " points is a fairly large eye.",
          "Film session tomorrow: everyone else figuring out what to do about " + hero + ".",
          "One person was clearly operating on a different difficulty setting tonight.",
          tripleDouble ? "A triple-double is a story. Doing it efficiently is a completely different story." :
            "The play-by-play matters, but the final line will be in every argument tomorrow.",
          heroLost ? "Individual offense was not the problem. The rest of that box score needs a meeting." :
            "A performance worthy of a scouting report that just says 'do not let him get comfortable.'",
        ])
      : clutch ? "You can make a tactical case for either side. The last possession made the case louder."
      : "The final margin is not a substitute for watching the actual possessions. But it is persuasive.";
    events.push({
      key, season: box.season, day: box.day,
      category: "game", teamId: winnerId, playerId: hero ? p!.playerId : undefined,
      href: "/gm/schedule" + (date ? "?date=" + encodeURIComponent(date) : ""),
      heat: Math.min(100, 30 + (hero ? Math.min(30, p!.points - 20) : 0) +
        (clutch ? 24 : 0) + (playoff ? 20 : 0) + (decisive ? 20 : 0)),
      account: "wire", topic, detail: playoff ? "Playoff basketball is not for the faint of heart." : "",
      fan, analyst,
    });
  }
  // Short streaks build recurring team storylines from ACTUAL played games.
  const chronological = [...boxes].filter(b => !b.postseason).sort((a, b) => a.day - b.day || a.id.localeCompare(b.id));
  const streaks = new Map<string, { signed: number; lastId: string; season: number; day: number }>();
  for (const box of chronological) {
    const winnerId = box.homeScore > box.awayScore ? box.homeTeamId : box.awayTeamId;
    for (const id of [box.homeTeamId, box.awayTeamId]) {
      const signed = id === winnerId ? 1 : -1;
      const previous = streaks.get(id)?.signed ?? 0;
      const next = Math.sign(previous) === signed ? previous + signed : signed;
      streaks.set(id, { signed: next, lastId: box.id, season: box.season, day: box.day });
      if (![5, -5, 8, -8].includes(next)) continue;
      const winning = next > 0;
      events.push({ key: "streak:" + id + ":" + box.id, season: box.season, day: box.day,
        category: "fans", teamId: id, href: "/gm/standings", heat: 47 + Math.abs(next) * 3,
        topic: teamLabel(league, id) + " have " + (winning ? "won " : "lost ") + Math.abs(next) + " straight.",
        detail: winning ? "Every team has a fan who now thinks a title run is inevitable."
          : "The film room is going to have a long week.",
        account: "numbers",
        fan: winning
          ? "Delete the rebuilding threads. Hang the hypothetical banner."
          : "Just checking whether the draft lottery has a loyalty program.",
        analyst: winning ? "Form matters. It is not the same thing as inevitability."
          : "There is no such thing as one quick fix for five consecutive losses.",
      });
    }
  }
  return events;
}
function newsEvents(league: GmLeagueState): Event[] {
  const events: Event[] = [];
  for (const item of league.news.slice(0, 60)) {
    if (!item.headline || !item.id) continue;
    const draft = /\bselects\b|draft pick|rookie/i.test(item.headline);
    const trade = item.tone === "trade" || /\btrade\b|extension|signs|signing|free agent|waived|agreed/i.test(item.headline);
    const awards = /\bMVP\b|award|all.nba|champion|finals|all.star/i.test(item.headline);
    const injury = /\binjur|out for|sidelined/i.test(item.headline);
    const category: SocialCategory = injury ? "injury" : draft ? "draft" :
      trade ? "trade" : awards ? "awards" : "news";
    // Omit generic trade news if actual detailed trade assets already exist.
    if (item.headline === "Trade completed" && league.tradeLog.some(t => t.status === "accepted")) continue;
    const teamId = league.teams.find(t =>
      item.headline.toUpperCase().includes(t.abbr + " ") ||
      item.headline.toLowerCase().includes(t.city.toLowerCase())
    )?.id;
    const topic = item.headline.replace(/\s+/g, " ").trim() + ".";
    const detail = item.body.replace(/\s+/g, " ").trim().slice(0, 225);
    const fan = category === "draft" ? pick(item.id, [
      "I have watched exactly four clips and I would now like to announce a future Hall of Famer.",
      "Pick analysis: I love it until someone else tells me not to.",
      "This rookie's first bad summer-league possession will cause forty-seven podcasts.",
    ]) : category === "trade" ? pick(item.id, [
      "The trade machine tab is now smoking.",
      "One side is getting cooked. We will decide which side in three years.",
      "I need a spreadsheet and a support group.",
    ]) : category === "awards" ? pick(item.id, [
      "Legacy discourse officially reopened for business.",
      "Need the voting spreadsheet posted immediately.",
      "Somebody's group chat is about to become unbearable.",
    ]) : "My carefully considered response is that I am overreacting.";
    events.push({
      key: "news:" + item.id, season: item.season, day: item.day, category, teamId,
      href: category === "draft" ? "/gm/draft" : category === "awards" ? "/gm/awards" :
        category === "injury" ? "/gm/medical" : category === "trade" ? "/gm/transactions" : "/gm",
      heat: draft ? 74 : trade ? 79 : awards ? 88 : injury ? 65 : 32,
      topic, detail, account: injury ? "injury" : "wire", fan,
      analyst: draft ? "The real question is what role he will get, and when."
        : trade ? "Context matters: incoming assets, outgoing assets, and cap consequences."
        : undefined,
    });
  }
  return events;
}
function tradeEvents(league: GmLeagueState): Event[] {
  const events: Event[] = [];
  function label(asset: GmTradeProposal["fromAssets"][number]): string {
    if (asset.type === "player") return playerName(league, asset.id);
    if (asset.type === "pick") return "draft pick " + asset.id;
    return "$" + (asset.cashM ?? 0) + "M cash";
  }
  for (const trade of league.tradeLog.slice(0, 40)) {
    if (trade.status !== "accepted") continue;
    const assetsA = trade.fromAssets.map(label).join(", ") || "cap considerations";
    const assetsB = trade.toAssets.map(label).join(", ") || "cap considerations";
    events.push({ key: "trade:" + trade.id, season: league.season, day: league.day,
      category: "trade", teamId: trade.fromTeamId, href: "/gm/transactions", heat: 82,
      topic: abbr(league, trade.fromTeamId) + " and " + abbr(league, trade.toTeamId) + " complete a trade.",
      detail: abbr(league, trade.fromTeamId) + " sends " + assetsA + "; " +
        abbr(league, trade.toTeamId) + " sends " + assetsB + ".",
      account: "wire", fan: pick(trade.id, [
        "Two teams have looked at the same collection of assets and both said yes. Incredible sport.",
        "Delete your old trade-machine screenshots. The professionals did something.",
        "The replies have already crowned a winner. Neither new roster has played yet.",
      ]),
      analyst: "Salary matching and roster fit will decide a lot more than the initial reaction.",
    });
  }
  return events;
}
function injuryEvents(league: GmLeagueState): Event[] {
  return league.players.filter(p => p.teamId && p.injury && p.injury.gamesRemaining > 0)
    .slice(0, 50).map((p: GmPlayer) => ({
      key: "injury:" + league.season + ":" + p.id + ":" + p.injury!.type,
      category: "injury" as const, season: league.season, day: league.day,
      teamId: p.teamId!, playerId: p.id, href: "/gm/medical", heat: 53,
      topic: p.name + " (" + abbr(league, p.teamId!) + ") is unavailable with " + p.injury!.type + ".",
      detail: "Current estimate: " + p.injury!.gamesRemaining + " game(s) remaining. Estimates may change.",
      account: "injury",
      fan: "Hoping for a clean recovery. The rotation gets a lot more complicated.",
    }));
}
function awardEvents(league: GmLeagueState): Event[] {
  const events: Event[] = [];
  if (league.awards?.season === league.season) {
    for (const race of league.awards.races.filter(r => ["mvp", "dpoy", "roy", "mip"].includes(r.id))) {
      const winner = race.candidates[0];
      if (!winner) continue;
      const name = league.players.find(p => p.id === winner.id)?.name ?? winner.name;
      events.push({ key: "award:" + league.season + ":" + race.id,
        season: league.season, day: league.day, category: "awards",
        teamId: winner.teamId, playerId: winner.id, href: "/gm/awards", heat: 92,
        topic: name + " wins " + race.title + ".",
        detail: "The " + league.season + " award race is official.",
        account: "wire", fan: pick(race.id + league.season, [
          "My agenda has been validated by the official voters. No further analysis required.",
          "Congratulations to the winner and condolences to the discourse.",
          "I have prepared eighteen slides about why the voters were either geniuses or criminals.",
        ]) });
    }
  }
  if (league.champion?.season === league.season) {
    const champion = league.champion;
    events.push({ key: "champion:" + champion.season, season: league.season, day: league.day,
      category: "awards", teamId: champion.teamId, playerId: champion.finalsMvpId,
      href: "/gm/awards", heat: 100, account: "wire",
      topic: teamLabel(league, champion.teamId) + " are NBA champions.",
      detail: "Finals MVP: " + playerName(league, champion.finalsMvpId) + ".",
      fan: "Someone is about to spend the entire offseason reminding us this happened.",
      analyst: "The banner is real. The legacy debates can start tomorrow.",
    });
  }
  return events;
}
function renderEvent(event: Event): SocialPost[] {
  const topicId = "social:" + event.key;
  const baseText = (event.topic + (event.detail ? " " + event.detail : "")).slice(0, 420);
  const entries: Array<{ account: string; text: string; reply: boolean }> = [
    { account: event.account, text: baseText, reply: false },
  ];
  const voice = event.category === "injury" ? "injury" : event.category === "draft" ? "sicko" :
    event.category === "trade" ? "cap" : event.category === "awards" ? "rings" :
    event.category === "fans" ? "panic" : "bench";
  if (event.fan) entries.push({ account: event.category === "game" || event.category === "fans" ?
    "fan:" + (event.teamId ?? "nba") : voice, text: event.fan, reply: true });
  if (event.analyst && (event.heat >= 70 || event.category === "trade"))
    entries.push({ account: event.category === "trade" ? "cap" : "film", text: event.analyst, reply: true });
  if (event.heat >= 80 && event.category !== "injury") {
    entries.push({ account: "burner", text: pick(event.key + ":alt", [
      "I'm not saying I called this. I'm saying scroll up.",
      "The group chat knew. The group chat was also wrong about the previous fourteen things.",
      "According to my completely independent sources (me), the timeline is in shambles.",
      "Deleting eight extremely confident old takes as we speak.",
    ]), reply: true });
  }
  return entries.map((entry, index) => {
    const id = topicId + ":" + index;
    const engagement = 1 + hash(id) % 40;
    return { id, eventId: topicId, accountId: entry.account,
      season: event.season, day: event.day, category: event.category,
      ...(event.teamId ? { teamId: event.teamId } : {}),
      ...(event.playerId ? { playerId: event.playerId } : {}),
      text: entry.text, href: event.href, ...(entry.reply ? { replyTo: topicId + ":0" } : {}),
      heat: event.heat, likes: Math.round((event.heat + 10) * (engagement + 5) / (entry.reply ? 7 : 3)),
      reposts: Math.round((event.heat + 10) * (engagement + 5) / (entry.reply ? 40 : 15)),
    };
  });
}
function allEvents(league: GmLeagueState): Event[] {
  const events: Event[] = [
    {
      key: "season:" + league.season, season: league.season, day: 0,
      category: "news", teamId: league.userTeamId, href: "/gm/standings",
      heat: 38, account: "wire",
      topic: "New season, new arguments. The " + (league.season - 1) + "-" +
        String(league.season).slice(-2) + " league calendar is open.",
      detail: "Every record starts at zero. Every fan has already penciled in a championship.",
      fan: "Annual optimism is a renewable energy source. We are so back before a ball has been tipped.",
    },
    ...gameEvents(league), ...newsEvents(league), ...tradeEvents(league),
    ...injuryEvents(league), ...awardEvents(league),
  ];
  const unique = new Map<string, Event>();
  for (const event of events) if (!unique.has(event.key)) unique.set(event.key, event);
  return [...unique.values()].sort((a, b) =>
    b.season - a.season || b.day - a.day || b.heat - a.heat || a.key.localeCompare(b.key));
}
/** Deterministically append factual event threads, keep old arcs across seasons. */
export function syncSocialTimeline(league: GmLeagueState): GmLeagueState {
  // Franchise saves are importable JSON. Treat stored posts as untrusted:
  // never expose arbitrary hrefs via Next Link or unbounded input strings.
  const existing = (Array.isArray(league.socialPosts) ? league.socialPosts : []).filter(p =>
    p && typeof p.id === "string" && p.id.startsWith("social:") && p.id.length < 190 &&
    typeof p.eventId === "string" && p.eventId.length < 180 &&
    typeof p.accountId === "string" && (SOCIAL_BY_ID.has(p.accountId) || /^fan:[a-z]{2,4}$/.test(p.accountId)) &&
    typeof p.text === "string" && p.text.length > 0 && p.text.length <= 420 &&
    typeof p.href === "string" && /^\/gm(?:\/|\?|$)/.test(p.href) && p.href.length < 200 &&
    Number.isInteger(p.season) && p.season > 2000 && p.season < 2200 &&
    Number.isInteger(p.day) && p.day >= 0 && p.day < 400 &&
    typeof p.heat === "number" && Number.isFinite(p.heat) &&
    typeof p.likes === "number" && Number.isFinite(p.likes) &&
    typeof p.reposts === "number" && Number.isFinite(p.reposts)
  ).slice(0, 1050);
  const seen = new Set(existing.map(p => p.id));
  const fresh = allEvents(league).flatMap(renderEvent).filter(p => !seen.has(p.id));
  if (!fresh.length && Array.isArray(league.socialPosts) && existing.length === league.socialPosts.length) return league;
  const posts = [...fresh, ...existing].sort((a, b) =>
    b.season - a.season || b.day - a.day ||
    b.heat - a.heat || a.id.localeCompare(b.id)).slice(0, 900);
  return { ...league, socialPosts: posts };
}
/** Covers old saves and the first home render before a league has been saved. */
export function socialTimeline(league: GmLeagueState): SocialPost[] {
  return syncSocialTimeline(league).socialPosts ?? [];
}
export function socialTrends(posts: SocialPost[], teamId: string) {
  const topics = new Map<string, { teamId: string; posts: number; heat: number }>();
  for (const post of posts) {
    if (!post.teamId) continue;
    const prev = topics.get(post.teamId) ?? { teamId: post.teamId, posts: 0, heat: 0 };
    topics.set(post.teamId, { ...prev, posts: prev.posts + 1, heat: Math.max(prev.heat, post.heat) });
  }
  return [...topics.values()].sort((a, b) =>
    b.posts * 3 + b.heat - a.posts * 3 - a.heat ||
    Number(b.teamId === teamId) - Number(a.teamId === teamId)).slice(0, 5);
}
