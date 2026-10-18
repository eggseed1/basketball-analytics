import { poolFor } from "./names";
import { country } from "./world";

/**
 * Club places. A team takes a city in its country, never the country name.
 * Pools cover countries that do not have their own list. The capital is
 * included when we know it, so a one-city territory still is not "Taiwan Sharks".
 */
const COUNTRY: Record<string, string[]> = {
  US: ["Springfield", "Oakland", "Tulsa", "Boise", "Des Moines", "Madison", "Spokane", "Savannah", "Reno", "Lincoln", "Fort Wayne", "Eugene"],
  CA: ["Toronto", "Montreal", "Vancouver", "Calgary", "Ottawa", "Edmonton", "Winnipeg", "Hamilton", "Halifax", "Quebec City"],
  MX: ["Mexico City", "Guadalajara", "Monterrey", "Puebla", "Tijuana", "León", "Mérida", "Cancún"],
  BR: ["São Paulo", "Rio de Janeiro", "Belo Horizonte", "Brasília", "Salvador", "Fortaleza", "Recife", "Curitiba", "Porto Alegre", "Manaus"],
  AR: ["Buenos Aires", "Córdoba", "Rosario", "Mendoza", "La Plata", "Mar del Plata", "Salta", "Santa Fe"],
  CL: ["Santiago", "Valparaíso", "Concepción", "Antofagasta", "Temuco", "La Serena"],
  CO: ["Bogotá", "Medellín", "Cali", "Barranquilla", "Cartagena", "Bucaramanga"],
  ES: ["Madrid", "Barcelona", "Valencia", "Sevilla", "Bilbao", "Málaga", "Zaragoza", "Vitoria"],
  FR: ["Paris", "Lyon", "Marseille", "Lille", "Toulouse", "Bordeaux", "Nantes", "Strasbourg", "Dijon"],
  DE: ["Berlin", "Munich", "Hamburg", "Cologne", "Frankfurt", "Stuttgart", "Dortmund", "Leipzig", "Bonn"],
  IT: ["Milan", "Rome", "Bologna", "Turin", "Venice", "Florence", "Naples", "Genoa", "Verona"],
  GR: ["Athens", "Thessaloniki", "Patras", "Heraklion", "Larissa", "Volos", "Ioannina"],
  TR: ["Istanbul", "Ankara", "Izmir", "Bursa", "Antalya", "Adana", "Konya", "Trabzon"],
  RS: ["Belgrade", "Novi Sad", "Niš", "Kragujevac", "Subotica"],
  HR: ["Zagreb", "Split", "Rijeka", "Osijek", "Zadar"],
  LT: ["Vilnius", "Kaunas", "Klaipėda", "Šiauliai", "Panevėžys"],
  LV: ["Riga", "Daugavpils", "Liepāja", "Jelgava"],
  PL: ["Warsaw", "Kraków", "Gdańsk", "Wrocław", "Poznań", "Łódź", "Lublin"],
  AU: ["Melbourne", "Sydney", "Brisbane", "Perth", "Adelaide", "Canberra", "Hobart", "Gold Coast"],
  NZ: ["Auckland", "Wellington", "Christchurch", "Hamilton", "Dunedin", "Tauranga"],
  CN: ["Beijing", "Shanghai", "Guangzhou", "Shenzhen", "Chengdu", "Hangzhou", "Nanjing", "Wuhan", "Xi'an", "Qingdao"],
  TW: ["Taipei", "New Taipei", "Taoyuan", "Taichung", "Tainan", "Kaohsiung", "Hsinchu", "Keelung", "Chiayi", "Changhua"],
  HK: ["Kowloon", "Wan Chai", "Sha Tin", "Tsuen Wan", "Tuen Mun", "Yau Tsim Mong"],
  MO: ["Macau", "Taipa", "Cotai"],
  JP: ["Tokyo", "Osaka", "Yokohama", "Nagoya", "Sapporo", "Fukuoka", "Kobe", "Kyoto", "Sendai", "Hiroshima"],
  KR: ["Seoul", "Busan", "Incheon", "Daegu", "Gwangju", "Daejeon", "Suwon", "Ulsan", "Changwon"],
  PH: ["Manila", "Quezon City", "Cebu", "Davao", "Iloilo", "Cagayan de Oro", "Bacolod", "Zamboanga"],
  IN: ["Mumbai", "Delhi", "Bengaluru", "Chennai", "Hyderabad", "Kolkata", "Pune", "Ahmedabad"],
  IL: ["Tel Aviv", "Jerusalem", "Haifa", "Beersheba", "Netanya", "Ashdod", "Raanana"],
  NG: ["Lagos", "Abuja", "Ibadan", "Kano", "Port Harcourt", "Benin City", "Enugu"],
  SN: ["Dakar", "Thiès", "Saint-Louis", "Ziguinchor", "Kaolack"],
  EG: ["Cairo", "Alexandria", "Giza", "Luxor", "Aswan", "Port Said"],
  ZA: ["Johannesburg", "Cape Town", "Durban", "Pretoria", "Port Elizabeth", "Bloemfontein"],
  MA: ["Casablanca", "Rabat", "Marrakesh", "Fès", "Tangier", "Agadir"],
  TN: ["Tunis", "Sfax", "Sousse", "Bizerte"],
  DZ: ["Algiers", "Oran", "Constantine", "Annaba"],
  AO: ["Luanda", "Benguela", "Huambo", "Lobito", "Lubango"],
  CV: ["Praia", "Mindelo", "Santa Maria", "Assomada"],
};

const POOL: Record<string, string[]> = {
  us: ["Springfield", "Oakland", "Tulsa", "Boise", "Madison", "Savannah"],
  anglo: ["Manchester", "Birmingham", "Glasgow", "Cardiff", "Belfast", "Leeds", "Bristol", "Dublin"],
  aunz: ["Melbourne", "Sydney", "Auckland", "Wellington", "Brisbane", "Christchurch"],
  ca: ["Toronto", "Montreal", "Vancouver", "Calgary", "Ottawa", "Halifax"],
  es: ["Madrid", "Barcelona", "Valencia", "Sevilla", "Bilbao", "Málaga"],
  latam: ["Guadalajara", "Monterrey", "Córdoba", "Rosario", "Medellín", "Cali", "Lima", "Quito", "Montevideo", "Asunción"],
  caribbean_es: ["San Juan", "Santo Domingo", "Santiago", "Ponce", "Bayamón", "La Vega"],
  br: ["São Paulo", "Rio de Janeiro", "Belo Horizonte", "Salvador", "Recife", "Curitiba"],
  pt: ["Lisbon", "Porto", "Braga", "Coimbra", "Faro", "Setúbal"],
  fr: ["Lyon", "Marseille", "Lille", "Toulouse", "Bordeaux", "Nantes"],
  it: ["Milan", "Bologna", "Turin", "Florence", "Naples", "Verona"],
  de: ["Munich", "Hamburg", "Cologne", "Frankfurt", "Leipzig", "Vienna", "Salzburg", "Zurich"],
  nl: ["Amsterdam", "Rotterdam", "Utrecht", "The Hague", "Antwerp", "Ghent"],
  nordic: ["Stockholm", "Gothenburg", "Oslo", "Bergen", "Copenhagen", "Aarhus", "Reykjavík"],
  fi: ["Helsinki", "Tampere", "Turku", "Oulu", "Espoo"],
  lt: ["Vilnius", "Kaunas", "Klaipėda", "Šiauliai"],
  lv_ee: ["Riga", "Tallinn", "Tartu", "Daugavpils", "Liepāja"],
  pl: ["Warsaw", "Kraków", "Gdańsk", "Wrocław", "Poznań"],
  cz_sk: ["Prague", "Brno", "Ostrava", "Bratislava", "Košice"],
  hu: ["Budapest", "Debrecen", "Szeged", "Pécs", "Győr"],
  ro: ["Bucharest", "Cluj-Napoca", "Timișoara", "Iași", "Constanța"],
  balkan: ["Belgrade", "Novi Sad", "Zagreb", "Split", "Sarajevo", "Ljubljana"],
  bg_mk: ["Sofia", "Plovdiv", "Varna", "Skopje", "Bitola"],
  gr: ["Athens", "Thessaloniki", "Patras", "Heraklion", "Nicosia", "Limassol"],
  tr_az: ["Istanbul", "Ankara", "Izmir", "Bursa", "Baku", "Ganja"],
  al_xk: ["Tirana", "Durrës", "Vlorë", "Pristina", "Prizren"],
  east_slavic: ["Moscow", "Saint Petersburg", "Kazan", "Kyiv", "Lviv", "Odesa", "Minsk"],
  caucasus: ["Tbilisi", "Batumi", "Kutaisi", "Yerevan", "Gyumri"],
  central_asia: ["Almaty", "Astana", "Shymkent", "Tashkent", "Samarkand", "Bishkek"],
  mn: ["Ulaanbaatar", "Erdenet", "Darkhan", "Choibalsan"],
  cn: ["Shanghai", "Guangzhou", "Shenzhen", "Chengdu", "Hangzhou", "Nanjing"],
  tw: ["Taipei", "Taichung", "Tainan", "Kaohsiung", "Hsinchu", "Taoyuan"],
  hk: ["Kowloon", "Sha Tin", "Tsuen Wan", "Tuen Mun"],
  jp: ["Tokyo", "Osaka", "Yokohama", "Nagoya", "Sapporo", "Fukuoka"],
  kr: ["Seoul", "Busan", "Incheon", "Daegu", "Gwangju", "Daejeon"],
  ph: ["Manila", "Quezon City", "Cebu", "Davao", "Iloilo"],
  malay: ["Jakarta", "Bandung", "Surabaya", "Kuala Lumpur", "George Town", "Johor Bahru"],
  vn: ["Hanoi", "Ho Chi Minh City", "Da Nang", "Hai Phong", "Can Tho"],
  th: ["Bangkok", "Chiang Mai", "Phuket", "Khon Kaen", "Pattaya"],
  mainland_sea: ["Phnom Penh", "Siem Reap", "Vientiane", "Yangon", "Mandalay"],
  south_asia: ["Mumbai", "Delhi", "Bengaluru", "Chennai", "Hyderabad", "Kolkata"],
  pk_af: ["Karachi", "Lahore", "Islamabad", "Peshawar", "Kabul", "Herat"],
  bd_np_lk: ["Dhaka", "Chittagong", "Kathmandu", "Pokhara", "Colombo", "Kandy"],
  arab: ["Cairo", "Alexandria", "Riyadh", "Jeddah", "Dubai", "Doha", "Amman", "Beirut", "Baghdad"],
  maghreb: ["Casablanca", "Rabat", "Algiers", "Oran", "Tunis", "Sfax"],
  ir: ["Tehran", "Isfahan", "Shiraz", "Tabriz", "Mashhad"],
  il: ["Tel Aviv", "Jerusalem", "Haifa", "Beersheba", "Netanya"],
  ng: ["Lagos", "Abuja", "Ibadan", "Kano", "Port Harcourt"],
  west_africa_en: ["Accra", "Kumasi", "Tamale", "Freetown", "Monrovia", "Banjul"],
  sahel_fr: ["Dakar", "Thiès", "Bamako", "Ouagadougou", "Abidjan", "Conakry"],
  central_africa_fr: ["Douala", "Yaoundé", "Kinshasa", "Lubumbashi", "Brazzaville", "Libreville"],
  east_africa: ["Nairobi", "Mombasa", "Dar es Salaam", "Kampala", "Arusha"],
  horn: ["Addis Ababa", "Dire Dawa", "Asmara", "Mogadishu", "Hargeisa"],
  sudan: ["Khartoum", "Omdurman", "Port Sudan", "Juba", "Wau"],
  southern_africa: ["Johannesburg", "Cape Town", "Durban", "Harare", "Lusaka", "Gaborone", "Windhoek"],
  lusophone_africa: ["Luanda", "Benguela", "Maputo", "Beira", "Praia", "Mindelo"],
  mg: ["Antananarivo", "Toamasina", "Antsirabe", "Mahajanga"],
  caribbean_en: ["Kingston", "Montego Bay", "Port of Spain", "Nassau", "Bridgetown", "Georgetown"],
  haiti_fr_caribbean: ["Port-au-Prince", "Cap-Haïtien", "Les Cayes", "Fort-de-France", "Pointe-à-Pitre"],
  pacific: ["Suva", "Nadi", "Apia", "Nukuʻalofa", "Port Moresby", "Honiara"],
  greenland: ["Nuuk", "Sisimiut", "Ilulissat", "Qaqortoq"],
};

/** Cities a club, school, or university in this country can be named for. */
export function citiesFor(countryId: string): string[] {
  const own = COUNTRY[countryId];
  if (own && own.length >= 3) return own;
  const c = country(countryId);
  const pool = POOL[poolFor(countryId)] ?? [];
  const list = [...(own ?? []), ...(c.capital && c.capital !== c.name ? [c.capital] : []), ...pool];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of list) {
    if (!name || name === c.name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out.length ? out : ["Harbor", "Northside", "Riverside", "Hill", "Market"];
}
