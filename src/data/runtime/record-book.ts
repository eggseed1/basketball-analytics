import snapshot from "./record-book-snapshot.json";

import type { RecordBook } from "@/lib/record-book";

export function getRecordBook(): RecordBook {
  return snapshot as RecordBook;
}
