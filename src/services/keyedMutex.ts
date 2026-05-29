// Serializes async work per key. The bot runs as a single process, so pool
// accounting mutations (deposit credit, withdrawal request/cancel, NAV update)
// only race in-process: a manual /deposit and the deposit watcher can call
// creditDeposit for the same chat at the same instant, both pass the dedup
// check, and both mint. Running every mutation for a given chat through this
// mutex makes those check-then-act sequences atomic relative to each other.
//
// NOTE: this is in-process only. If the bot is ever scaled to multiple
// processes, pool mutations would need DB-level locking (advisory locks /
// SELECT ... FOR UPDATE) instead.
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    // Chain after the previous holder settles (resolve OR reject), so one failure
    // never wedges the queue for that key.
    const result = previous.then(fn, fn);
    const tail = result.then(
      () => undefined,
      () => undefined
    );
    this.tails.set(key, tail);
    // Drop the entry once idle so the map can't grow without bound across chats.
    void tail.then(() => {
      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    });
    return result;
  }
}
