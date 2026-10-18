/** Turn a model reply into the text a fan sees. The query trace stays beside the answer. */
export function presentAskAnswer(text: string): string {
  return text
    .replace(/【[^】]*】/g, "")
    .replace(/\s*\{[^{}]*"sql"\s*:[^{}]*\}/g, "")
    .replace(/[\u00a0\u202f\u2007\u2009]/g, " ")
    .replace(/[\u2010\u2011]/g, "-")
    .replace(/\s+[–—]\s+/g, ", ")
    .replace(/\]\s+\(\//g, "](/")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
