/** Only same-origin paths survive as a post-login redirect (no //evil.com, no auth loops). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next.startsWith("/sign-in") || next.startsWith("/no-access") || next.startsWith("/auth/")) return "/";
  return next;
}
