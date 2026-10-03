/**
 * Analytics desk vetting: Google News items need a trusted source domain and a
 * real headline.
 * Run: npx tsx scripts/test-analytics-news.ts
 */
import assert from "node:assert/strict";

import {
  isTrustedGoogleSource,
  looksLikeJunkTitle,
} from "../src/data/providers/insights/analytics-news";

for (const url of [
  "https://www.bball-index.com",
  "https://www.nytimes.com",
  "https://sports.yahoo.com",
  "https://basketball.realgm.com",
  "https://thef5.substack.com",
]) {
  assert.equal(isTrustedGoogleSource(url), true, url);
}

for (const url of [
  "https://czechinvest.gov.cz",
  "https://www.basketballnetwork.net",
  "https://fadeawayworld.net",
  "https://vsin.com",
  "https://random.substack.com",
  "https://notespn.com",
  undefined,
  "not a url",
]) {
  assert.equal(isTrustedGoogleSource(url), false, String(url));
}

for (const title of [
  "新浪体育nba (NBA analytics) [38i9b2au]",
  "NBA analytics",
  "Статистика НБА advanced stats explained today",
  "Net rating leaders [x9k2mq7z] full list here",
]) {
  assert.equal(looksLikeJunkTitle(title), true, title);
}

for (const title of [
  "Forecasting Four Factor Impact: What Actually Predicts Next Season",
  "How Did the NBA Analytics Discourse Get So Stupid?",
  "Nikola Jokić and the passing numbers behind Denver's offense",
]) {
  assert.equal(looksLikeJunkTitle(title), false, title);
}

console.log("test-analytics-news: ok");
