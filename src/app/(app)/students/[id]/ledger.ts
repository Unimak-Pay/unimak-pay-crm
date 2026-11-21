/** Ledger entries oldest first, each with the obligation's balance after it (BigInt, never float). */
export function withRunningBalance<E extends { amount: string; createdAt: string }>(entries: readonly E[]): (E & { balanceAfter: string })[] {
  let running = 0n;
  return [...entries]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((e) => {
      running += BigInt(e.amount);
      return { ...e, balanceAfter: running.toString() };
    });
}
