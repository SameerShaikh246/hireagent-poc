// ─────────────────────────────────────────────────────────────────────────
// gatherUntil — keep fetching deeper pages until we have `target` NEW
// candidates (or run out of pages / hit the page cap).
//
// Why this exists: a provider search asks for the same top-N results every
// time. After the first search those N are all "already seen", so a repeat
// search can only ever return nothing (the 15 -> 5 -> 0 pattern). Instead of
// slicing the top N and hoping, this walks page 0, 1, 2... and keeps the
// candidates that survive freshness + recruiter filters.
//
// Pure & provider-agnostic on purpose: all the real work (calling a
// provider, persisting, freshness, filters) is injected, so the paging
// logic itself can be unit-tested with fakes.
// ─────────────────────────────────────────────────────────────────────────

export interface PageFetch<T> {
  items: T[];
  /** Provider has nothing further for this query — stop paging. */
  exhausted?: boolean;
}

export interface PageProcessed<T> {
  /** Items from this page that survived freshness + filters. */
  accepted: T[];
  /** Hidden because already shown within the freshness window. */
  suppressed: number;
  /** Hidden by recruiter-selected filters. */
  filteredOut: number;
}

export interface GatherOptions<T> {
  target: number;
  maxPages: number;
  startPage?: number;
  fetchPage: (page: number) => Promise<PageFetch<T>>;
  processPage: (items: T[], page: number) => Promise<PageProcessed<T>>;
  keyOf: (item: T) => string;
  /** Checked after each page; return true to stop paging (e.g. the DB went down, so freshness can't be judged). */
  stopWhen?: () => boolean;
}

export interface GatherResult<T> {
  items: T[];
  suppressed: number;
  filteredOut: number;
  exhausted: boolean;
  /** Set when paging stopped because a LATER page failed (e.g. rate limit). The results so far are still returned. */
  stoppedEarly?: string;
  pagesFetched: number;
}

export async function gatherUntil<T>(opts: GatherOptions<T>): Promise<GatherResult<T>> {
  const { target, maxPages, fetchPage, processPage, keyOf, stopWhen, startPage = 0 } = opts;

  const collected: T[] = [];
  const have = new Set<string>();
  let suppressed = 0;
  let filteredOut = 0;
  let pagesFetched = 0;
  let exhausted = false;
  let stoppedEarly: string | undefined;

  for (let page = startPage; page < startPage + maxPages && collected.length < target; page++) {
    let fetched: PageFetch<T>;
    let processed: PageProcessed<T>;

    try {
      fetched = await fetchPage(page);
      processed = await processPage(fetched.items, page);
    } catch (error) {
      // The FIRST page failing is a real failure — surface it. A LATER page
      // failing (rate limit, quota) shouldn't throw away candidates we
      // already have, so stop and return what we've got.
      if (page === startPage) throw error;
      stoppedEarly = error instanceof Error ? error.message : String(error);
      break;
    }

    pagesFetched++;
    suppressed += processed.suppressed;
    filteredOut += processed.filteredOut;

    for (const item of processed.accepted) {
      const k = keyOf(item);
      if (!have.has(k)) {
        have.add(k);
        collected.push(item);
      }
    }

    if (fetched.exhausted) {
      exhausted = true;
      break;
    }
    if (stopWhen?.()) break;
  }

  return { items: collected, pagesFetched, suppressed, filteredOut, exhausted, stoppedEarly };
}