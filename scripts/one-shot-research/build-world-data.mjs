/**
 * ONE SHOT research authoring: merge the raw evidence in this folder into the
 * versioned world data the game reads.
 *
 * Inputs (all local, refreshed by hand):
 *   iso3166-1.json            ISO 3166-1 list (Debian iso-codes via pycountry)
 *   worldbank-2023.json       World Bank births, population, region, income
 *   fiba-federations.json     FIBA national federation directory
 *   league-candidates.json    candidate competitions with official URLs
 *   league-source-checks.json HTTP status and page titles for those URLs
 *   ncdrisc-height-1996.json  NCD-RisC mean adult height by country, 1996 cohort
 *   fiba-ranking-men.json     FIBA men's world ranking on the snapshot date
 *
 * Outputs:
 *   src/one-shot/data/world.json            registry, profiles, leagues
 *   src/one-shot/data/research-coverage.json per-country research status
 *
 *   node scripts/one-shot-research/build-world-data.mjs
 *
 * Model parameters (league strength, cost index and so on) are game design
 * values, labelled as such in the output. Nothing here rates talent by
 * birthplace.
 */
import fs from "node:fs";

const R = "scripts/one-shot-research/";
const OUT_DIR = "src/one-shot/data/";
const SNAPSHOT = "2026-10-08";
const read = (f) => JSON.parse(fs.readFileSync(R + f, "utf8"));

const iso = read("iso3166-1.json");
const wb = read("worldbank-2023.json");
const fiba = read("fiba-federations.json");
const candidates = read("league-candidates.json");
const checks = Object.fromEntries(read("league-source-checks.json").results.map((r) => [r.id, r]));
const ncd = read("ncdrisc-height-1996.json");
const fibaRanking = read("fiba-ranking-men.json");
const rankById = Object.fromEntries(fibaRanking.teams.map((t) => [t.id, { rank: t.rank, points: t.points }]));

// NCD-RisC has no estimate for these places. Each borrows a neighbour or the
// administering country, and the UI labels the figure as a proxy.
const HEIGHT_PROXY = {
  AX: "FIN", AI: "KNA", AW: "VEN", VG: "KNA", BQ: "VEN", KY: "JAM", CX: "AUS", CC: "MYS", CW: "VEN", FK: "GBR",
  FO: "DNK", GF: "SUR", GI: "GBR", GP: "LCA", GU: "FSM", GG: "GBR", IM: "GBR", JE: "GBR", XK: "MKD", LI: "CHE",
  MO: "HKG", MC: "FRA", MS: "KNA", NC: "FJI", NF: "AUS", MP: "FSM", PN: "NZL", RE: "MUS", SM: "ITA", SX: "KNA",
  SS: "SDN", BL: "FRA", SH: "GBR", MF: "KNA", PM: "FRA", SJ: "NOR", TC: "BHS", VI: "PRI", VA: "ITA", WF: "TON",
  EH: "MAR", MQ: "LCA", YT: "COM",
};

function heightFor(alpha2, alpha3, inhabited) {
  if (!inhabited) return null;
  const own = ncd.byIso3[alpha3];
  if (own) return { maleCm: own.male, femaleCm: own.female, cohort: ncd.cohort, basis: "measured", proxyIso3: null };
  const proxy = HEIGHT_PROXY[alpha2];
  const p = proxy && ncd.byIso3[proxy];
  if (!p) throw new Error(`No height data or proxy for ${alpha2}`);
  return { maleCm: p.male, femaleCm: p.female, cohort: ncd.cohort, basis: "proxy", proxyIso3: proxy };
}

/* ---------------------------------------------------------------- crosswalk */

// FIBA three-letter codes are not ISO alpha-3 codes. This table is explicit on
// purpose; build fails if a FIBA member is missing from it.
const FIBA_TO_ISO = {
  AFG: "AF", ALB: "AL", ALG: "DZ", AND: "AD", ANG: "AO", ANT: "AG", ARG: "AR", ARM: "AM", ARU: "AW",
  ASA: "AS", AUS: "AU", AUT: "AT", AZE: "AZ", BAH: "BS", BAN: "BD", BAR: "BB", BDI: "BI", BEL: "BE",
  BEN: "BJ", BER: "BM", BHU: "BT", BIH: "BA", BIZ: "BZ", BLR: "BY", BOL: "BO", BOT: "BW", BRA: "BR",
  BRN: "BH", BRU: "BN", BUL: "BG", BUR: "BF", CAF: "CF", CAL: "NC", CAM: "KH", CAN: "CA", CAY: "KY",
  CGO: "CG", CHA: "TD", CHI: "CL", CHN: "CN", CIV: "CI", CMR: "CM", COD: "CD", COK: "CK", COL: "CO",
  COM: "KM", CPV: "CV", CRC: "CR", CRO: "HR", CUB: "CU", CYP: "CY", CZE: "CZ", DEN: "DK", DJI: "DJ",
  DMA: "DM", DOM: "DO", ECU: "EC", EGY: "EG", ERI: "ER", ESA: "SV", ESP: "ES", EST: "EE", ETH: "ET",
  FIJ: "FJ", FIN: "FI", FRA: "FR", FSM: "FM", GAB: "GA", GAM: "GM", GBR: "GB", GBS: "GW", GEO: "GE",
  GEQ: "GQ", GER: "DE", GHA: "GH", GIB: "GI", GRE: "GR", GRN: "GD", GUA: "GT", GUI: "GN", GUM: "GU",
  GUY: "GY", HAI: "HT", HKG: "HK", HON: "HN", HUN: "HU", INA: "ID", IND: "IN", IRI: "IR", IRL: "IE",
  IRQ: "IQ", ISL: "IS", ISR: "IL", ISV: "VI", ITA: "IT", IVB: "VG", JAM: "JM", JOR: "JO", JPN: "JP",
  KAZ: "KZ", KEN: "KE", KGZ: "KG", KIR: "KI", KOR: "KR", KOS: "XK", KSA: "SA", KUW: "KW", LAO: "LA",
  LAT: "LV", LBA: "LY", LBN: "LB", LBR: "LR", LCA: "LC", LES: "LS", LTU: "LT", LUX: "LU", MAC: "MO",
  MAD: "MG", MAR: "MA", MAS: "MY", MAT: "MS", MAW: "MW", MDA: "MD", MDV: "MV", MEX: "MX", MGL: "MN",
  MHL: "MH", MKD: "MK", MLI: "ML", MLT: "MT", MNE: "ME", MON: "MC", MOZ: "MZ", MRI: "MU", MTN: "MR",
  MYA: "MM", NAM: "NA", NCA: "NI", NED: "NL", NEP: "NP", NGR: "NG", NIG: "NE", NIS: "NF", NMI: "MP",
  NOR: "NO", NRU: "NR", NZL: "NZ", OMA: "OM", PAK: "PK", PAN: "PA", PAR: "PY", PHI: "PH", PLE: "PS",
  PLW: "PW", PNG: "PG", POL: "PL", POR: "PT", PRK: "KP", PUR: "PR", QAT: "QA", ROU: "RO", RSA: "ZA",
  RUS: "RU", RWA: "RW", SAM: "WS", SEN: "SN", SEY: "SC", SGP: "SG", SKN: "KN", SLE: "SL", SLO: "SI",
  SMR: "SM", SOL: "SB", SOM: "SO", SRB: "RS", SRI: "LK", SSD: "SS", STP: "ST", SUD: "SD", SUI: "CH",
  SUR: "SR", SVK: "SK", SWE: "SE", SWZ: "SZ", SYR: "SY", TAH: "PF", TAN: "TZ", TCI: "TC", TGA: "TO",
  THA: "TH", TJK: "TJ", TKM: "TM", TLS: "TL", TOG: "TG", TPE: "TW", TTO: "TT", TUN: "TN", TUR: "TR",
  TUV: "TV", UAE: "AE", UGA: "UG", UKR: "UA", URU: "UY", USA: "US", UZB: "UZ", VAN: "VU", VEN: "VE",
  VIE: "VN", VIN: "VC", YEM: "YE", ZAM: "ZM", ZIM: "ZW",
};

/* ---------------------------------------------------------------- territory */

// Non-sovereign ISO entries and who administers them. Citizenship follows the
// administering state where that is the general rule; it matters for import
// limits and is shown to the player.
const TERRITORY = {
  AS: "US", GU: "US", MP: "US", PR: "US", VI: "US",
  AI: "GB", BM: "GB", FK: "GB", GG: "GB", GI: "GB", IM: "GB", JE: "GB", KY: "GB", MS: "GB", PN: "GB", SH: "GB", TC: "GB", VG: "GB",
  AW: "NL", BQ: "NL", CW: "NL", SX: "NL",
  BL: "FR", GF: "FR", GP: "FR", MF: "FR", MQ: "FR", NC: "FR", PF: "FR", PM: "FR", RE: "FR", WF: "FR", YT: "FR",
  CC: "AU", CX: "AU", NF: "AU",
  CK: "NZ", NU: "NZ", TK: "NZ",
  FO: "DK", GL: "DK",
  AX: "FI", SJ: "NO",
  HK: "CN", MO: "CN",
};
// No permanent population; excluded from the draw and documented.
const UNINHABITED = { AQ: "Antarctica", BV: "NO", HM: "AU", GS: "GB", TF: "FR", UM: "US", IO: "GB" };
// Cook Islands and Niue are self-governing in free association with NZ; NZ
// citizenship applies. Kept with the territory table for citizenship.
const SPECIAL = {
  TW: "Listed in ISO 3166-1 as Taiwan, Province of China; FIBA member as Chinese Taipei (TPE). Treated as its own place of birth with its own competitions.",
  XK: "Not in ISO 3166-1. XK is the user-assigned code in common use (EU, World Bank). FIBA member as Kosovo (KOS).",
  EH: "Disputed territory. No FIBA member found; no competition data.",
  PS: "UN observer state. FIBA member as Palestine (PLE).",
  VA: "Sovereign city-state with a very small resident population. No FIBA member found.",
};

/* ----------------------------------------------------------------- names */

const english = new Intl.DisplayNames(["en"], { type: "region" });
const displayName = (a2) => {
  const n = english.of(a2);
  return n && n !== a2 ? n : null;
};

/* -------------------------------------------------------------- World Bank */

const wbBy2 = Object.fromEntries(wb.countries.filter((c) => c.iso2).map((c) => [c.iso2 === "XK" ? "XK" : c.iso2, c]));
const birthsFor = (a2) => {
  const c = wbBy2[a2];
  if (!c) return null;
  const cbr = wb.crudeBirthRate[c.iso3];
  const pop = wb.population[c.iso3];
  if (!cbr || !pop) return null;
  return { births: Math.round((cbr.value * pop.value) / 1000), year: Number(cbr.date), method: "crude birth rate x population / 1000", source: "World Bank SP.DYN.CBRT.IN, SP.POP.TOTL" };
};
const BIRTHS_OVERRIDE = {
  TW: { births: 135571, year: 2023, method: "registered live births", source: "Taiwan Ministry of the Interior, Demography Quarterly Winter 2024 (ris.gov.tw)" },
};
const BIRTH_FLOOR = 50;

const INCOME_COST = { HIC: 1.0, UMC: 0.55, LMC: 0.32, LIC: 0.2, INX: 0.4 };
const INCOME_LABEL = { HIC: "high income", UMC: "upper-middle income", LMC: "lower-middle income", LIC: "low income", INX: "not classified" };

/* --------------------------------------------------------------- leagues */

// How each candidate's evidence is judged. `expect` must match the fetched
// page title, og:title or og:site_name. `manual` records evidence gathered
// by hand on the snapshot date when the automated fetch was blocked.
const CURATION = {
  nba: { manual: "nba.com reachable via fetch tool; 2026 early-entry release (April 27, 2026) lists a two-round draft on June 23-24, 2026.", source: "https://www.nba.com/news/2026-nba-draft-early-entry-candidates" },
  "g-league": { expect: /G League/i },
  ncaa: { expect: /NCAA/i },
  nfhs: { expect: /NFHS/i },
  cebl: { expect: /CEBL|Canadian Elite/i },
  usports: { fail: "Candidate URL returned 404 / 405 during the snapshot." },
  acb: { expect: /Liga Endesa|ACB/i },
  "feb-primera": { partial: "FEB federation site reachable; Primera FEB not named on the fetched page." },
  "lnb-elite": { expect: /Betclic|ELITE/i },
  "lnb-elite2": { manual: "lnb.fr home page title names both Betclic ÉLITE and ÉLITE 2; the /elite-2 path itself returned Page Not Found.", source: "https://lnb.fr/fr" },
  bbl: { expect: /BBL|Bundesliga/i },
  proa: { expect: /ProA|2\. Basketball Bundesliga|2basketball/i },
  lba: { expect: /LBA|Lega ?Basket|Serie A/i },
  "lnp-a2": { partial: "LNP site reachable; Serie A2 not named in the page title." },
  gbl: { manual: "esake.gr/en lists Greek Basketball League fixtures for 10-11 October 2026 and current leaders.", source: "https://www.esake.gr/en" },
  bsl: { manual: "tbf.org.tr lists Türkiye Sigorta Basketbol Süper Ligi, Türkiye Basketbol Ligi (TBL) and Türkiye Basketbol 2. Ligi fixtures for October 2026.", source: "https://www.tbf.org.tr/" },
  kls: { expect: /KLS|Košarkaška liga|Meridianbet/i },
  aba: { expect: /ABA/i },
  lkl: { expect: /LKL|krepšinio/i },
  nkl: { expect: /NKL|Nacionalin/i },
  "nbl-au": { manual: "league.nbl.com.au responded 200; page title is generic ('Home').", source: "https://league.nbl.com.au/" },
  "nbl-next-stars": { expect: /Draft pathway|Next Stars/i },
  nbl1: { expect: /NBL1/i },
  "nz-nbl": { expect: /NBL|Sal/i },
  cba: { expect: /CBA/i },
  bleague: { expect: /B\.?LEAGUE/i },
  kbl: { expect: /KBL|Korean Basketball/i },
  pba: { manual: "pba.ph shows games on October 7 and 9-10, 2026 and current group standings.", source: "https://www.pba.ph/" },
  uaap: { fail: "Candidate URL did not respond during the snapshot." },
  nbb: { expect: /Basquete|NBB|LNB/i },
  "liga-nacional-ar": { expect: /Liga Nacional/i },
  "liga-proximo-ar": { expect: /Desarrollo|Próximo|Proximo/i },
  lnbp: { manual: "lnbp.mx page title: 'Sitio Oficial de la LNBP'.", source: "https://www.lnbp.mx/" },
  "npbl-ng": { expect: /Nigeria Premier Basketball League/i },
  bfi: { partialFederation: "Federation site reachable; no professional league identified in the snapshot." },
  bal: { expect: /BAL/i },
  "road-to-bal": { expect: /Road to B\.?A\.?L/i },
  bwb: { manual: "bwb.nba.com: invite-only camps; players selected by the NBA, FIBA and national federations on performance and leadership; regional camps in Africa, Europe, the Americas and Asia-Pacific, usually May-September; BWB Global at All-Star.", source: "https://bwb.nba.com/" },
  euroleague: { partial: "Official site blocked automated access (HTTP 429, browser check) on the snapshot date." },
  eurocup: { partial: "Official site blocked automated access (HTTP 429) on the snapshot date." },
  bcl: { expect: /Champions League/i },
  "bcl-americas": { fail: "Candidate event page returned Page Not Found." },
  bnxt: { expect: /BNXT/i },
  "sl-gb": { expect: /Super League/i },
  "bsn-pr": { expect: /BSN|Baloncesto Superior/i },
  "lnb-do": { fail: "Candidate URL timed out." },
  "spb-ve": { fail: "Candidate URL did not respond." },
  "lub-uy": { partial: "FUBB federation site reachable; league not named in the page title." },
  "lnb-cl": { fail: "Candidate URL did not respond." },
  "ibl-id": { expect: /IBL/i },
  "vba-vn": { expect: /VBA/i },
  "tbl-th": { fail: "Candidate URL did not respond." },
  "tpbl-tw": { expect: /TPBL/i },
  "pleague-tw": { expect: /P\. ?LEAGUE/i, note: "Site reachable; current-season status not checked." },
  "kzs-si": { partial: "KZS federation site reachable; league not named in the page title." },
  "hks-hr": { partial: "HKS federation site reachable; league not named in the page title." },
  "ksm-me": { partial: "KSCG federation site reachable; league not named in the page title." },
  "ksbih-ba": { fail: "Candidate URL did not respond." },
  lebl: { fail: "Candidate URL did not respond." },
  "korisliiga-fi": { expect: /Korisliiga/i },
  "plk-pl": { expect: /PLK|Polska Liga|Basket Liga/i },
  "gbf-ge": { fail: "Candidate URL did not respond." },
  "winner-il": { expect: /מנהלת|ליגת|basket/i },
  "nbl-cz": { expect: /NBL/i },
  vtb: { expect: /VTB|Единая/i, note: "Site reachable. FIBA status of Russian and Belarusian clubs was not checked in this snapshot." },
  "fpb-pt": { partial: "FPB federation site reachable; league not named in the page title." },
  "basketligan-se": { fail: "Candidate URL did not respond." },
  "basketligaen-dk": { expect: /Basketligaen/i },
  "fsbb-sn": { fail: "Candidate URL did not respond (500 via fetch tool)." },
  "nba-academy-africa": { fail: "Candidate URL returned 404; not offered as a route in this snapshot." },
  "ferwaba-rw": { fail: "Candidate URL did not respond (500 via fetch tool)." },
  "fab-ao": { fail: "Candidate URL did not respond." },
  "ebf-eg": { fail: "Candidate URL did not respond." },
  "ftbb-tn": { partial: "FTBB federation site reachable; league not named in the page title." },
  "frmbb-ma": { partial: "FRMBB federation site reachable; league not named in the page title." },
  "bsa-za": { fail: "Candidate URL did not respond (500 via fetch tool)." },
  "kbf-ke": { fail: "Candidate URL did not respond." },
};

const EXTRA_LEAGUES = [
  {
    id: "g-league-ignite",
    country: ["US"],
    name: "NBA G League Ignite",
    class: "pro-development",
    url: "https://gleague.nba.com/news/nba-g-league-ignite-to-conclude-its-final-season",
    inactive: "Program ended after the 2023-24 season (G League release, March 21, 2024).",
  },
];

// Game parameters, not facts. strength and exposure are 0-100 on the game's
// own scale; salary is an annual USD band used for the money model; season is
// the start month (1-12) and length in months.
const M = (strength, exposure, coaching, salary, games, minutesCap, start, months, minAge = 17) => ({ strength, exposure, coaching, salaryUsd: salary, games, minutesCap, season: { startMonth: start, months }, minAge });
const MODEL = {
  nba: M(100, 100, 92, [1_270_000, 12_000_000], 82, 40, 10, 7, 19),
  "g-league": M(72, 80, 80, [40_500, 90_000], 50, 38, 11, 5, 18),
  ncaa: M(64, 82, 82, [0, 60_000], 32, 36, 11, 5, 17),
  nfhs: M(30, 45, 55, [0, 0], 26, 32, 12, 4, 14),
  cebl: M(52, 40, 62, [15_000, 40_000], 20, 36, 5, 4, 18),
  acb: M(78, 72, 85, [60_000, 1_500_000], 34, 34, 10, 8, 16),
  "feb-primera": M(58, 42, 70, [20_000, 90_000], 34, 34, 10, 7, 16),
  "lnb-elite": M(72, 74, 80, [50_000, 900_000], 34, 34, 10, 8, 16),
  "lnb-elite2": M(57, 46, 70, [25_000, 120_000], 34, 34, 10, 7, 16),
  bbl: M(70, 62, 80, [50_000, 900_000], 34, 34, 10, 8, 16),
  proa: M(55, 38, 66, [20_000, 80_000], 34, 34, 10, 7, 16),
  lba: M(70, 60, 78, [50_000, 1_000_000], 30, 34, 10, 8, 16),
  "lnp-a2": M(54, 34, 64, [20_000, 80_000], 34, 34, 10, 7, 16),
  gbl: M(68, 56, 76, [40_000, 1_200_000], 26, 34, 10, 8, 16),
  bsl: M(72, 60, 76, [60_000, 1_500_000], 30, 34, 10, 8, 16),
  kls: M(58, 42, 74, [15_000, 120_000], 26, 34, 10, 7, 16),
  aba: M(70, 64, 82, [40_000, 900_000], 26, 34, 10, 7, 16),
  lkl: M(64, 54, 78, [30_000, 600_000], 36, 34, 9, 9, 16),
  nkl: M(46, 26, 60, [8_000, 30_000], 30, 34, 10, 7, 16),
  "nbl-au": M(70, 72, 82, [75_000, 1_000_000], 28, 34, 9, 6, 17),
  nbl1: M(42, 26, 60, [0, 20_000], 18, 36, 4, 5, 15),
  "nz-nbl": M(48, 34, 66, [10_000, 60_000], 20, 36, 4, 4, 16),
  cba: M(62, 44, 70, [50_000, 1_500_000], 46, 36, 10, 7, 17),
  bleague: M(62, 42, 72, [40_000, 1_200_000], 60, 34, 10, 8, 17),
  kbl: M(55, 32, 68, [40_000, 600_000], 54, 34, 10, 7, 18),
  pba: M(54, 26, 62, [20_000, 400_000], 40, 36, 1, 12, 21),
  nbb: M(56, 34, 66, [15_000, 250_000], 36, 34, 10, 8, 16),
  "liga-nacional-ar": M(58, 40, 70, [12_000, 200_000], 38, 34, 10, 8, 16),
  "liga-proximo-ar": M(38, 28, 62, [0, 6_000], 20, 32, 10, 6, 16),
  lnbp: M(52, 30, 60, [15_000, 150_000], 40, 36, 8, 5, 18),
  "npbl-ng": M(40, 26, 50, [3_000, 25_000], 20, 36, 3, 4, 17),
  bal: M(56, 56, 62, [20_000, 120_000], 8, 36, 4, 3, 18),
  "road-to-bal": M(42, 34, 52, [0, 0], 6, 36, 10, 3, 17),
  euroleague: M(84, 90, 90, [150_000, 4_000_000], 38, 32, 10, 8, 16),
  eurocup: M(74, 70, 82, [80_000, 1_200_000], 18, 34, 10, 6, 16),
  bcl: M(70, 64, 78, [0, 0], 14, 34, 10, 6, 16),
  bnxt: M(58, 42, 70, [20_000, 150_000], 30, 34, 9, 8, 16),
  "sl-gb": M(50, 32, 62, [15_000, 80_000], 32, 36, 9, 8, 17),
  "bsn-pr": M(56, 36, 64, [10_000, 200_000], 34, 36, 4, 5, 17),
  "ibl-id": M(42, 20, 54, [5_000, 60_000], 24, 36, 1, 5, 17),
  "vba-vn": M(38, 18, 50, [5_000, 40_000], 16, 36, 6, 4, 17),
  "tpbl-tw": M(50, 26, 60, [30_000, 300_000], 36, 36, 10, 7, 17),
  "pleague-tw": M(48, 24, 58, [25_000, 250_000], 24, 36, 11, 6, 17),
  "korisliiga-fi": M(52, 34, 66, [15_000, 70_000], 36, 34, 9, 8, 16),
  "plk-pl": M(60, 42, 70, [30_000, 300_000], 30, 34, 9, 8, 16),
  "winner-il": M(64, 46, 72, [40_000, 900_000], 30, 34, 10, 8, 16),
  "nbl-cz": M(52, 32, 66, [12_000, 80_000], 30, 34, 9, 8, 16),
  vtb: M(70, 42, 76, [50_000, 1_500_000], 40, 34, 9, 9, 16),
  "basketligaen-dk": M(46, 28, 60, [8_000, 40_000], 30, 36, 9, 7, 16),
};
// Sub-pro level used for clubs where the snapshot has no verified competition.
const LOCAL_SENIOR = M(30, 10, 40, [0, 3_000], 18, 36, 10, 6, 16);

const SELECTIVE = new Set(["nbl-next-stars", "bwb"]);
const CROSS_BORDER = new Set(["euroleague", "eurocup", "bcl", "bcl-americas", "bal", "road-to-bal"]);

function judge(c) {
  const ev = checks[c.id];
  const cur = CURATION[c.id] ?? {};
  const base = { checkedAt: SNAPSHOT, url: c.url };
  if (c.inactive) return { ...base, status: "inactive", evidence: c.inactive, source: c.url };
  if (cur.manual) return { ...base, status: "verified", evidence: cur.manual, source: cur.source ?? c.url };
  if (cur.expect && ev && ev.status === 200) {
    const hay = [ev.title, ev.ogTitle, ev.ogSiteName].filter(Boolean).join(" | ");
    if (cur.expect.test(hay)) return { ...base, status: "verified", evidence: `Official site responded; title: "${hay.slice(0, 120)}".${cur.note ? " " + cur.note : ""}`, source: ev.finalUrl ?? c.url };
    return { ...base, status: "partial", evidence: `Site responded but the title did not name the competition ("${hay.slice(0, 80)}").`, source: c.url };
  }
  if (cur.partial || cur.partialFederation) return { ...base, status: "partial", evidence: cur.partial ?? cur.partialFederation, source: c.url };
  return { ...base, status: "unknown", evidence: cur.fail ?? `Automated check failed (${ev?.status ?? "no response"}).`, source: c.url };
}

const leagues = [...candidates, ...EXTRA_LEAGUES].map((c) => {
  const research = judge(c);
  const model = MODEL[c.id] ?? null;
  return {
    id: c.id,
    name: c.name,
    countries: c.country,
    category: c.class,
    selective: SELECTIVE.has(c.id),
    crossBorder: CROSS_BORDER.has(c.id),
    research,
    model,
  };
});

/* ------------------------------------------------------- route notes */

// Country-specific development systems. "confirmed" cites a league record
// above; everything else is labelled a model assumption.
const ROUTE_NOTES = {
  US: [
    ["school", "High school basketball under NFHS member state associations.", "confirmed", ["nfhs"]],
    ["university", "NCAA college basketball; players can enter the draft early and withdraw under NCAA rules.", "confirmed", ["ncaa", "nba"]],
    ["pro-development", "NBA G League, including direct entry for draft-eligible players.", "confirmed", ["g-league"]],
    ["inactive", "G League Ignite ended after 2023-24 and is not offered.", "confirmed", ["g-league-ignite"]],
  ],
  CA: [
    ["pro", "CEBL summer professional league.", "confirmed", ["cebl"]],
    ["university", "U SPORTS university basketball (not verified in this snapshot).", "model", []],
    ["cross-border", "US high school and NCAA routes via scholarship offers.", "model", ["ncaa"]],
  ],
  AU: [
    ["pro", "NBL, including the Next Stars program for draft prospects.", "confirmed", ["nbl-au", "nbl-next-stars"]],
    ["semi-pro", "NBL1 state-based leagues.", "confirmed", ["nbl1"]],
  ],
  NZ: [
    ["pro", "New Zealand NBL (winter) and the shared Australian NBL through the New Zealand Breakers.", "confirmed", ["nz-nbl", "nbl-au"]],
  ],
  ES: [["pro", "Liga Endesa (ACB) with Primera FEB below it.", "confirmed", ["acb"]], ["youth", "Club youth teams feeding senior clubs.", "model", []]],
  FR: [["pro", "Betclic ÉLITE and ÉLITE 2 under the LNB.", "confirmed", ["lnb-elite", "lnb-elite2"]], ["youth", "Club youth and espoirs teams.", "model", []]],
  DE: [["pro", "BBL with ProA below it.", "confirmed", ["bbl", "proa"]]],
  IT: [["pro", "LBA Serie A with Serie A2 (LNP) below it.", "confirmed", ["lba"]]],
  GR: [["pro", "Greek Basketball League.", "confirmed", ["gbl"]]],
  TR: [["pro", "Basketbol Süper Ligi with TBL and TB2L below it.", "confirmed", ["bsl"]]],
  RS: [["pro", "KLS domestic league; top clubs play in the cross-border ABA League.", "confirmed", ["kls", "aba"]]],
  LT: [["pro", "LKL with NKL below it.", "confirmed", ["lkl", "nkl"]]],
  CN: [["pro", "CBA.", "confirmed", ["cba"]]],
  JP: [["pro", "B.LEAGUE.", "confirmed", ["bleague"]], ["school", "School and university basketball (structure not verified).", "model", []]],
  KR: [["pro", "KBL.", "confirmed", ["kbl"]], ["school", "School and university basketball (structure not verified).", "model", []]],
  PH: [["pro", "PBA.", "confirmed", ["pba"]], ["university", "UAAP and other collegiate leagues (not verified in this snapshot).", "model", []]],
  BR: [["pro", "NBB.", "confirmed", ["nbb"]]],
  AR: [["pro", "Liga Nacional with the under-23 Liga de Desarrollo.", "confirmed", ["liga-nacional-ar", "liga-proximo-ar"]]],
  MX: [["pro", "LNBP.", "confirmed", ["lnbp"]], ["pro-development", "Mexico City has a G League team (not verified in this snapshot).", "model", []]],
  NG: [["pro", "Nigeria Premier Basketball League; the 2026 champion qualified for the BAL.", "confirmed", ["npbl-ng", "bal"]]],
  IN: [["federation", "Basketball Federation of India competitions; no professional league identified.", "confirmed", ["bfi"]]],
  SN: [["academy", "NBA Academy Africa could not be verified in this snapshot and is not offered.", "model", ["nba-academy-africa"]]],
};

/* --------------------------------------------------------------- regions */

const fibaRegionByIso = {};
const fibaByIso = {};
for (const m of fiba.members) {
  const a2 = FIBA_TO_ISO[m.fibaCode];
  if (!a2) throw new Error(`FIBA code ${m.fibaCode} missing from crosswalk`);
  if (fibaByIso[a2]) throw new Error(`Duplicate crosswalk target ${a2}`);
  fibaByIso[a2] = m;
  fibaRegionByIso[a2] = m.fibaRegion;
}
for (const [code, a2] of Object.entries(FIBA_TO_ISO)) {
  if (!fiba.members.some((m) => m.fibaCode === code)) throw new Error(`Crosswalk code ${code} not in FIBA directory`);
  if (a2 !== "XK" && !iso.entries.some((e) => e.alpha2 === a2)) throw new Error(`Crosswalk target ${a2} not in ISO list`);
}

// Region for entries without FIBA membership, from the administering state or
// the World Bank region.
const WB_REGION_TO_FIBA = {
  "Sub-Saharan Africa": "africa",
  "Europe & Central Asia": "europe",
  "Latin America & Caribbean": "americas",
  "North America": "americas",
  "East Asia & Pacific": "asia",
  "South Asia": "asia",
  "Middle East & North Africa": "asia",
  "Middle East, North Africa, Afghanistan & Pakistan": "asia",
};
const PACIFIC = new Set(["AS", "CK", "FJ", "FM", "GU", "KI", "MH", "MP", "NC", "NF", "NR", "NU", "PF", "PG", "PN", "PW", "SB", "TK", "TO", "TV", "VU", "WF", "WS", "AU", "NZ", "CC", "CX"]);
const NORTH_AFRICA = new Set(["DZ", "EG", "LY", "MA", "TN", "EH"]);

/* --------------------------------------------------------------- build */

const entries = [...iso.entries, { alpha2: "XK", alpha3: "XKX", numeric: null, name: "Kosovo" }];
const countries = [];
for (const e of entries) {
  const a2 = e.alpha2;
  const kind = UNINHABITED[a2] ? "uninhabited" : SPECIAL[a2] ? "special" : TERRITORY[a2] ? "territory" : "sovereign";
  const administeredBy = TERRITORY[a2] ?? (UNINHABITED[a2] && UNINHABITED[a2].length === 2 ? UNINHABITED[a2] : null);
  const fed = fibaByIso[a2] ?? null;
  const wbc = wbBy2[a2] ?? (administeredBy ? null : null);
  const births = BIRTHS_OVERRIDE[a2] ?? birthsFor(a2);
  const parentWb = administeredBy ? wbBy2[administeredBy] : null;
  const income = wbc?.incomeLevel ?? parentWb?.incomeLevel ?? (a2 === "TW" ? "HIC" : "INX");
  const incomeSource = wbc?.incomeLevel ? "World Bank" : parentWb ? `administering state (${administeredBy}), World Bank` : a2 === "TW" ? "model assumption (no World Bank classification)" : "not available";
  let region = kind === "uninhabited" ? "none" : fibaRegionByIso[a2] ?? (administeredBy && PACIFIC.has(a2) ? "oceania" : null) ?? WB_REGION_TO_FIBA[wbc?.region] ?? null;
  if (!region) region = PACIFIC.has(a2) ? "oceania" : NORTH_AFRICA.has(a2) ? "africa" : administeredBy ? fibaRegionByIso[administeredBy] ?? "europe" : "europe";

  const domestic = leagues.filter((l) => l.countries.includes(a2) && !l.crossBorder && !l.selective && l.research.status !== "inactive");
  const verifiedDomestic = domestic.filter((l) => l.research.status === "verified" && l.model);
  const crossBorder = [];
  if (region === "europe" && verifiedDomestic.length) crossBorder.push("bcl", "eurocup", "euroleague");
  if (region === "africa" && fed) crossBorder.push("road-to-bal", "bal");

  let status;
  let statusReason;
  if (kind === "uninhabited") {
    status = "inactive";
    statusReason = "No permanent population; not a place of birth in the game.";
  } else if (!fed) {
    status = "unknown";
    statusReason = "No FIBA member federation found in the directory on the snapshot date.";
  } else if (verifiedDomestic.length) {
    status = "verified";
    statusReason = `FIBA federation and ${verifiedDomestic.map((l) => l.name).join(", ")} confirmed on official sources.`;
  } else {
    status = "partial";
    statusReason = domestic.length
      ? `FIBA federation confirmed; ${domestic.map((l) => `${l.name} (${l.research.status})`).join(", ")} not confirmed.`
      : "FIBA federation confirmed; domestic competition structure not researched in this snapshot.";
  }

  const weight = kind === "uninhabited" ? 0 : births?.births ?? BIRTH_FLOOR;
  countries.push({
    id: a2,
    iso3: e.alpha3,
    isoNumeric: e.numeric,
    isoListed: a2 !== "XK",
    name: displayName(a2) ?? e.commonName ?? e.name,
    isoName: (displayName(a2) ?? e.commonName ?? e.name) === e.name ? undefined : e.name,
    kind,
    administeredBy,
    note: SPECIAL[a2] ?? null,
    inhabited: kind !== "uninhabited",
    citizenship: kind === "territory" ? administeredBy : a2,
    capital: wbc?.capital || null,
    region,
    income: { level: income, label: INCOME_LABEL[income], source: incomeSource },
    draw: {
      weight,
      births: births?.births ?? null,
      year: births?.year ?? null,
      source: births?.source ?? null,
      method: births ? births.method : kind === "uninhabited" ? "excluded" : `floor of ${BIRTH_FLOOR}; no births figure available`,
      estimated: !births,
    },
    federation: fed
      ? { fibaCode: fed.fibaCode, fibaName: fed.fibaName, name: fed.federationName, fibaRegion: fed.fibaRegion, website: fed.officialWebsite, source: fed.sourceUrl }
      : null,
    competitions: {
      domestic: domestic.map((l) => l.id),
      crossBorder,
      selective: [...(region === "oceania" && ["AU", "NZ"].includes(a2) ? ["nbl-next-stars"] : []), ...(a2 !== "US" ? ["bwb"] : [])],
    },
    routeNotes: (ROUTE_NOTES[a2] ?? []).map(([system, text, basis, sources]) => ({ system, text, basis, sources })),
    model: {
      costIndex: INCOME_COST[income],
      coachingAccess: Math.round(30 + 40 * INCOME_COST[income] + (verifiedDomestic.length ? Math.max(...verifiedDomestic.map((l) => l.model.coaching)) * 0.25 : 0)),
      exposureBase: verifiedDomestic.length ? Math.max(...verifiedDomestic.map((l) => l.model.exposure)) : 8,
      verifiedPro: verifiedDomestic.length > 0,
    },
    height: heightFor(a2, e.alpha3, kind !== "uninhabited"),
    fibaRank: rankById[a2] ?? null,
    research: { status, reason: statusReason, checkedAt: SNAPSHOT },
  });
}

countries.sort((a, b) => a.name.localeCompare(b.name, "en"));
const counts = countries.reduce((acc, c) => ((acc[c.research.status] = (acc[c.research.status] ?? 0) + 1), acc), {});
const leagueCounts = leagues.reduce((acc, l) => ((acc[l.research.status] = (acc[l.research.status] ?? 0) + 1), acc), {});

const meta = {
  worldSnapshotVersion: SNAPSHOT,
  disclaimer: "ONE SHOT is a fictional simulation. Real federations, leagues and programs are named as context only; players, offers, contracts and outcomes are invented. Unverified details are marked as unknown.",
  sources: {
    iso: iso.source,
    worldBank: wb.source,
    fiba: fiba.source ?? "https://about.fiba.basketball/en/national-federations",
    leagues: "Official league, federation and program sites checked on the snapshot date; see each league's research record.",
    height: `${ncd.source}. ${ncd.note} ${ncd.url}`,
    fibaRanking: `${fibaRanking.source}, retrieved ${fibaRanking.retrieved}. ${fibaRanking.url}`,
  },
  draftRule: "Game rule simplified from the NBA collective bargaining agreement: a player must be 19 during the draft year and one season past high school; players outside the US system are automatically eligible at 22. Not re-verified in this snapshot.",
  modelNote: "Fields under `model` are game design parameters, not measured facts.",
  localSeniorModel: LOCAL_SENIOR,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_DIR + "world.json", JSON.stringify({ meta, countries, leagues }) + "\n");
fs.writeFileSync(
  OUT_DIR + "research-coverage.json",
  JSON.stringify(
    {
      worldSnapshotVersion: SNAPSHOT,
      countryCounts: counts,
      leagueCounts,
      countries: countries.map((c) => ({ id: c.id, name: c.name, kind: c.kind, status: c.research.status, reason: c.research.reason })),
      leagues: leagues.map((l) => ({ id: l.id, name: l.name, status: l.research.status, evidence: l.research.evidence, source: l.research.source })),
    },
    null,
    1,
  ) + "\n",
);
console.log("countries", countries.length, counts);
console.log("leagues", leagues.length, leagueCounts);
console.log("draw-eligible", countries.filter((c) => c.draw.weight > 0).length, "estimated", countries.filter((c) => c.inhabited && c.draw.estimated).map((c) => c.id).join(" "));
