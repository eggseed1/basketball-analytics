/**
 * Award history rows for /awards/[slug].
 * Player awards on identity cards come from live NBA Stats.
 * These lists power the click-through history pages.
 */

import { FRANCHISE_HISTORIES } from "@/data/franchises/history";

export type AwardHistoryRow = {
  /** Canonical season "YYYY-YY" when applicable; calendar year for titles. */
  season: string;
  /** Display name of winner (player or team). */
  winner: string;
  /** Optional player/team route id when known. */
  href?: string;
  note?: string;
};

/** Invert franchise championship years → season history (newest first). */
export function listChampionshipHistory(): AwardHistoryRow[] {
  const rows: AwardHistoryRow[] = [];
  for (const f of FRANCHISE_HISTORIES) {
    for (const year of f.championships) {
      const start = year - 1;
      const season = `${start}-${String(year % 100).padStart(2, "0")}`;
      rows.push({
        season,
        winner: `${f.city} ${f.name}`,
        href: `/franchises/${f.id}`,
        note: String(year),
      });
    }
  }
  return rows.sort((a, b) => b.season.localeCompare(a.season));
}

/**
 * Regular-season MVP winners (season → player).
 * Kept as a curated product list for the history page.
 */
export const MVP_HISTORY: AwardHistoryRow[] = [
  { season: "2024-25", winner: "Shai Gilgeous-Alexander", href: "/players/1628983" },
  { season: "2023-24", winner: "Nikola Jokić", href: "/players/203999" },
  { season: "2022-23", winner: "Joel Embiid", href: "/players/203954" },
  { season: "2021-22", winner: "Nikola Jokić", href: "/players/203999" },
  { season: "2020-21", winner: "Nikola Jokić", href: "/players/203999" },
  { season: "2019-20", winner: "Giannis Antetokounmpo", href: "/players/203507" },
  { season: "2018-19", winner: "Giannis Antetokounmpo", href: "/players/203507" },
  { season: "2017-18", winner: "James Harden", href: "/players/201935" },
  { season: "2016-17", winner: "Russell Westbrook", href: "/players/201566" },
  { season: "2015-16", winner: "Stephen Curry", href: "/players/201939" },
  { season: "2014-15", winner: "Stephen Curry", href: "/players/201939" },
  { season: "2013-14", winner: "Kevin Durant", href: "/players/201142" },
  { season: "2012-13", winner: "LeBron James", href: "/players/2544" },
  { season: "2011-12", winner: "LeBron James", href: "/players/2544" },
  { season: "2010-11", winner: "Derrick Rose", href: "/players/201565" },
  { season: "2009-10", winner: "LeBron James", href: "/players/2544" },
  { season: "2008-09", winner: "LeBron James", href: "/players/2544" },
  { season: "2007-08", winner: "Kobe Bryant", href: "/players/977" },
  { season: "2006-07", winner: "Dirk Nowitzki", href: "/players/1717" },
  { season: "2005-06", winner: "Steve Nash", href: "/players/959" },
  { season: "2004-05", winner: "Steve Nash", href: "/players/959" },
  { season: "2003-04", winner: "Kevin Garnett", href: "/players/1563" },
  { season: "2002-03", winner: "Tim Duncan", href: "/players/1495" },
  { season: "2001-02", winner: "Tim Duncan", href: "/players/1495" },
  { season: "2000-01", winner: "Allen Iverson", href: "/players/947" },
  { season: "1999-00", winner: "Shaquille O’Neal", href: "/players/406" },
  { season: "1998-99", winner: "Karl Malone", href: "/players/252" },
  { season: "1997-98", winner: "Michael Jordan", href: "/players/893" },
  { season: "1996-97", winner: "Karl Malone", href: "/players/252" },
  { season: "1995-96", winner: "Michael Jordan", href: "/players/893" },
  { season: "1994-95", winner: "David Robinson", href: "/players/764" },
  { season: "1993-94", winner: "Hakeem Olajuwon", href: "/players/165" },
  { season: "1992-93", winner: "Charles Barkley", href: "/players/787" },
  { season: "1991-92", winner: "Michael Jordan", href: "/players/893" },
  { season: "1990-91", winner: "Michael Jordan", href: "/players/893" },
  { season: "1989-90", winner: "Magic Johnson", href: "/players/77142" },
  { season: "1988-89", winner: "Magic Johnson", href: "/players/77142" },
  { season: "1987-88", winner: "Michael Jordan", href: "/players/893" },
  { season: "1986-87", winner: "Magic Johnson", href: "/players/77142" },
  { season: "1985-86", winner: "Larry Bird", href: "/players/1449" },
  { season: "1984-85", winner: "Larry Bird", href: "/players/1449" },
  { season: "1983-84", winner: "Larry Bird", href: "/players/1449" },
  { season: "1982-83", winner: "Moses Malone", href: "/players/77449" },
  { season: "1981-82", winner: "Moses Malone", href: "/players/77449" },
  { season: "1980-81", winner: "Julius Erving", href: "/players/76681" },
  { season: "1979-80", winner: "Kareem Abdul-Jabbar", href: "/players/76003" },
  { season: "1978-79", winner: "Moses Malone", href: "/players/77449" },
  { season: "1977-78", winner: "Bill Walton", href: "/players/78497" },
  { season: "1976-77", winner: "Kareem Abdul-Jabbar", href: "/players/76003" },
  { season: "1975-76", winner: "Kareem Abdul-Jabbar", href: "/players/76003" },
  { season: "1974-75", winner: "Bob McAdoo", href: "/players/77420" },
  { season: "1973-74", winner: "Kareem Abdul-Jabbar", href: "/players/76003" },
  { season: "1972-73", winner: "Dave Cowens", href: "/players/76411" },
  { season: "1971-72", winner: "Kareem Abdul-Jabbar", href: "/players/76003" },
  { season: "1970-71", winner: "Kareem Abdul-Jabbar", href: "/players/76003" },
  { season: "1969-70", winner: "Willis Reed", href: "/players/77847" },
  { season: "1968-69", winner: "Wes Unseld", href: "/players/78318" },
  { season: "1967-68", winner: "Wilt Chamberlain", href: "/players/76375" },
  { season: "1966-67", winner: "Wilt Chamberlain", href: "/players/76375" },
  { season: "1965-66", winner: "Wilt Chamberlain", href: "/players/76375" },
  { season: "1964-65", winner: "Bill Russell", href: "/players/78049" },
  { season: "1963-64", winner: "Oscar Robertson", href: "/players/77845" },
  { season: "1962-63", winner: "Bill Russell", href: "/players/78049" },
  { season: "1961-62", winner: "Bill Russell", href: "/players/78049" },
  { season: "1960-61", winner: "Bill Russell", href: "/players/78049" },
  { season: "1959-60", winner: "Wilt Chamberlain", href: "/players/76375" },
  { season: "1958-59", winner: "Bob Pettit", href: "/players/77825" },
  { season: "1957-58", winner: "Bill Russell", href: "/players/78049" },
  { season: "1956-57", winner: "Bob Cousy", href: "/players/76435" },
  { season: "1955-56", winner: "Bob Pettit", href: "/players/77825" },
];

export const FINALS_MVP_HISTORY: AwardHistoryRow[] = [
  { season: "2024-25", winner: "Shai Gilgeous-Alexander", href: "/players/1628983" },
  { season: "2023-24", winner: "Jaylen Brown", href: "/players/1627759" },
  { season: "2022-23", winner: "Nikola Jokić", href: "/players/203999" },
  { season: "2021-22", winner: "Stephen Curry", href: "/players/201939" },
  { season: "2020-21", winner: "Giannis Antetokounmpo", href: "/players/203507" },
  { season: "2019-20", winner: "LeBron James", href: "/players/2544" },
  { season: "2018-19", winner: "Kawhi Leonard", href: "/players/202695" },
  { season: "2017-18", winner: "Kevin Durant", href: "/players/201142" },
  { season: "2016-17", winner: "Kevin Durant", href: "/players/201142" },
  { season: "2015-16", winner: "LeBron James", href: "/players/2544" },
  { season: "2014-15", winner: "Andre Iguodala", href: "/players/2738" },
  { season: "2013-14", winner: "Kawhi Leonard", href: "/players/202695" },
  { season: "2012-13", winner: "LeBron James", href: "/players/2544" },
  { season: "2011-12", winner: "LeBron James", href: "/players/2544" },
  { season: "2010-11", winner: "Dirk Nowitzki", href: "/players/1717" },
  { season: "2009-10", winner: "Kobe Bryant", href: "/players/977" },
  { season: "2008-09", winner: "Kobe Bryant", href: "/players/977" },
  { season: "2007-08", winner: "Paul Pierce", href: "/players/1718" },
  { season: "2006-07", winner: "Tony Parker", href: "/players/2225" },
  { season: "2005-06", winner: "Dwyane Wade", href: "/players/2548" },
  { season: "2004-05", winner: "Tim Duncan", href: "/players/1495" },
  { season: "2003-04", winner: "Chauncey Billups", href: "/players/1712" },
  { season: "2002-03", winner: "Tim Duncan", href: "/players/1495" },
  { season: "2001-02", winner: "Shaquille O’Neal", href: "/players/406" },
  { season: "2000-01", winner: "Shaquille O’Neal", href: "/players/406" },
  { season: "1999-00", winner: "Shaquille O’Neal", href: "/players/406" },
  { season: "1998-99", winner: "Tim Duncan", href: "/players/1495" },
  { season: "1997-98", winner: "Michael Jordan", href: "/players/893" },
  { season: "1996-97", winner: "Michael Jordan", href: "/players/893" },
  { season: "1995-96", winner: "Michael Jordan", href: "/players/893" },
  { season: "1994-95", winner: "Hakeem Olajuwon", href: "/players/165" },
  { season: "1993-94", winner: "Hakeem Olajuwon", href: "/players/165" },
  { season: "1992-93", winner: "Michael Jordan", href: "/players/893" },
  { season: "1991-92", winner: "Michael Jordan", href: "/players/893" },
  { season: "1990-91", winner: "Michael Jordan", href: "/players/893" },
  { season: "1989-90", winner: "Isiah Thomas" },
  { season: "1988-89", winner: "Joe Dumars" },
  { season: "1987-88", winner: "James Worthy" },
  { season: "1986-87", winner: "Magic Johnson" },
  { season: "1985-86", winner: "Larry Bird", href: "/players/1449" },
  { season: "1984-85", winner: "Kareem Abdul-Jabbar" },
  { season: "1983-84", winner: "Larry Bird", href: "/players/1449" },
  { season: "1982-83", winner: "Moses Malone" },
  { season: "1981-82", winner: "Magic Johnson" },
  { season: "1980-81", winner: "Cedric Maxwell" },
  { season: "1979-80", winner: "Magic Johnson" },
  { season: "1978-79", winner: "Dennis Johnson" },
  { season: "1977-78", winner: "Wes Unseld" },
  { season: "1976-77", winner: "Bill Walton" },
  { season: "1975-76", winner: "Jo Jo White" },
  { season: "1974-75", winner: "Rick Barry" },
  { season: "1973-74", winner: "John Havlicek" },
  { season: "1972-73", winner: "Willis Reed" },
  { season: "1971-72", winner: "Wilt Chamberlain" },
  { season: "1970-71", winner: "Lew Alcindor" },
  { season: "1969-70", winner: "Willis Reed" },
  { season: "1968-69", winner: "Jerry West" },
];

export const DPOY_HISTORY: AwardHistoryRow[] = [
  { season: "2024-25", winner: "Dyson Daniels", href: "/players/1630700" },
  { season: "2023-24", winner: "Rudy Gobert", href: "/players/203497" },
  { season: "2022-23", winner: "Jaren Jackson Jr.", href: "/players/1628991" },
  { season: "2021-22", winner: "Marcus Smart", href: "/players/203935" },
  { season: "2020-21", winner: "Rudy Gobert", href: "/players/203497" },
  { season: "2019-20", winner: "Giannis Antetokounmpo", href: "/players/203507" },
  { season: "2018-19", winner: "Rudy Gobert", href: "/players/203497" },
  { season: "2017-18", winner: "Rudy Gobert", href: "/players/203497" },
  { season: "2016-17", winner: "Draymond Green", href: "/players/203110" },
  { season: "2015-16", winner: "Kawhi Leonard", href: "/players/202695" },
  { season: "2014-15", winner: "Kawhi Leonard", href: "/players/202695" },
  { season: "2013-14", winner: "Joakim Noah", href: "/players/201149" },
  { season: "2012-13", winner: "Marc Gasol", href: "/players/201188" },
  { season: "2011-12", winner: "Tyson Chandler", href: "/players/2199" },
  { season: "2010-11", winner: "Dwight Howard", href: "/players/2730" },
  { season: "2009-10", winner: "Dwight Howard", href: "/players/2730" },
  { season: "2008-09", winner: "Dwight Howard", href: "/players/2730" },
  { season: "2007-08", winner: "Kevin Garnett", href: "/players/1563" },
  { season: "2006-07", winner: "Marcus Camby", href: "/players/948" },
  { season: "2005-06", winner: "Ben Wallace", href: "/players/1112" },
  { season: "2004-05", winner: "Ben Wallace", href: "/players/1112" },
  { season: "2003-04", winner: "Ron Artest", href: "/players/1897" },
  { season: "2002-03", winner: "Ben Wallace", href: "/players/1112" },
  { season: "2001-02", winner: "Ben Wallace", href: "/players/1112" },
  { season: "2000-01", winner: "Dikembe Mutombo", href: "/players/87" },
  { season: "1999-00", winner: "Alonzo Mourning", href: "/players/297" },
  { season: "1998-99", winner: "Alonzo Mourning", href: "/players/297" },
  { season: "1997-98", winner: "Dikembe Mutombo", href: "/players/87" },
  { season: "1996-97", winner: "Dikembe Mutombo", href: "/players/87" },
  { season: "1995-96", winner: "Gary Payton", href: "/players/56" },
  { season: "1994-95", winner: "Dikembe Mutombo", href: "/players/87" },
  { season: "1993-94", winner: "Hakeem Olajuwon", href: "/players/165" },
  { season: "1992-93", winner: "Hakeem Olajuwon", href: "/players/165" },
  { season: "1991-92", winner: "David Robinson", href: "/players/764" },
  { season: "1990-91", winner: "Dennis Rodman", href: "/players/23" },
  { season: "1989-90", winner: "Dennis Rodman", href: "/players/23" },
  { season: "1988-89", winner: "Mark Eaton", href: "/players/764" },
  { season: "1987-88", winner: "Michael Jordan", href: "/players/893" },
  { season: "1986-87", winner: "Michael Cooper", href: "/players/76421" },
  { season: "1985-86", winner: "Alvin Robertson", href: "/players/779" },
  { season: "1984-85", winner: "Mark Eaton", href: "/players/764" },
  { season: "1983-84", winner: "Sidney Moncrief", href: "/players/77482" },
  { season: "1982-83", winner: "Sidney Moncrief", href: "/players/77482" },
];

export const ROY_HISTORY: AwardHistoryRow[] = [
  { season: "2024-25", winner: "Stephon Castle", href: "/players/1642264" },
  { season: "2023-24", winner: "Victor Wembanyama", href: "/players/1641705" },
  { season: "2022-23", winner: "Paolo Banchero", href: "/players/1631094" },
  { season: "2021-22", winner: "Scottie Barnes", href: "/players/1630567" },
  { season: "2020-21", winner: "LaMelo Ball", href: "/players/1630163" },
  { season: "2019-20", winner: "Ja Morant", href: "/players/1629630" },
  { season: "2018-19", winner: "Luka Dončić", href: "/players/1629029" },
  { season: "2017-18", winner: "Ben Simmons", href: "/players/1627732" },
  { season: "2016-17", winner: "Malcolm Brogdon", href: "/players/1627763" },
  { season: "2015-16", winner: "Karl-Anthony Towns", href: "/players/1626157" },
  { season: "2014-15", winner: "Andrew Wiggins", href: "/players/203952" },
  { season: "2013-14", winner: "Michael Carter-Williams", href: "/players/203487" },
  { season: "2012-13", winner: "Damian Lillard", href: "/players/203081" },
  { season: "2011-12", winner: "Kyrie Irving", href: "/players/202681" },
  { season: "2010-11", winner: "Blake Griffin", href: "/players/201933" },
  { season: "2009-10", winner: "Tyreke Evans", href: "/players/201936" },
  { season: "2008-09", winner: "Derrick Rose", href: "/players/201565" },
  { season: "2007-08", winner: "Kevin Durant", href: "/players/201142" },
  { season: "2006-07", winner: "Brandon Roy", href: "/players/200750" },
  { season: "2005-06", winner: "Chris Paul", href: "/players/101108" },
  { season: "2004-05", winner: "Emeka Okafor", href: "/players/2731" },
  { season: "2003-04", winner: "LeBron James", href: "/players/2544" },
  { season: "2002-03", winner: "Amar’e Stoudemire", href: "/players/2405" },
  { season: "2001-02", winner: "Pau Gasol", href: "/players/2200" },
  { season: "2000-01", winner: "Mike Miller", href: "/players/2034" },
  { season: "1999-00", winner: "Elton Brand", href: "/players/1882" },
  { season: "1998-99", winner: "Vince Carter", href: "/players/1713" },
  { season: "1997-98", winner: "Tim Duncan", href: "/players/1495" },
  { season: "1996-97", winner: "Allen Iverson", href: "/players/947" },
  { season: "1995-96", winner: "Damon Stoudamire", href: "/players/317" },
  { season: "1994-95", winner: "Jason Kidd / Grant Hill", note: "Co-winners" },
  { season: "1993-94", winner: "Chris Webber", href: "/players/185" },
  { season: "1992-93", winner: "Shaquille O’Neal", href: "/players/406" },
  { season: "1991-92", winner: "Larry Johnson", href: "/players/913" },
  { season: "1990-91", winner: "Derrick Coleman", href: "/players/221" },
  { season: "1989-90", winner: "David Robinson", href: "/players/764" },
  { season: "1988-89", winner: "Mitch Richmond", href: "/players/782" },
  { season: "1987-88", winner: "Mark Jackson", href: "/players/349" },
  { season: "1986-87", winner: "Chuck Person", href: "/players/23" },
  { season: "1985-86", winner: "Patrick Ewing", href: "/players/121" },
  { season: "1984-85", winner: "Michael Jordan", href: "/players/893" },
];

export function getAwardHistory(slug: string): AwardHistoryRow[] {
  switch (slug) {
    case "championships":
      return listChampionshipHistory();
    case "mvp":
      return MVP_HISTORY;
    case "finals-mvp":
      return FINALS_MVP_HISTORY;
    case "dpoy":
      return DPOY_HISTORY;
    case "roy":
      return ROY_HISTORY;
    default:
      return [];
  }
}
