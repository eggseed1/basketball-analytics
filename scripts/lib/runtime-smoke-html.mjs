/** Read server-rendered content without counting messages serialized for hydration. */
export function serverPageText(html) {
  return html
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function requireHealthyPage(route, result) {
  if (result.status !== 200) throw new Error(`${route} returned ${result.status}`);
  const text = serverPageText(result.body);
  for (const marker of ["Internal Server Error", "Application interrupted", "This page could not finish loading"]) {
    if (text.includes(marker)) throw new Error(`${route} rendered ${marker}`);
  }
  return text;
}
