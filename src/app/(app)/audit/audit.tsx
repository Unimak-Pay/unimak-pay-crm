"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { Fragment, useState } from "react";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { FilterBar, FilterSearch } from "@/components/filters";
import { CopyValue, DateTime } from "@/components/format";
import { JsonView } from "@/components/json-view";
import { RequireOp, useCanOp } from "@/components/permission";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCursorList } from "@/hooks/use-cursor-list";
import { compact, useUrlFilters } from "@/hooks/use-url-filters";
import { jsonDiff } from "@/lib/json-diff";
import { cn } from "@/lib/utils";
import { auditLabel, auditSummary } from "./audit-labels";

type Entry = components["schemas"]["AuditLog"];
const KEYS = ["entity", "entityId", "actorId"] as const;

/** Where an audited entity lives in the dashboard, when it has a page. */
function entityHref(entity: string, id: string): string | null {
  switch (entity) {
    case "Payment":
      return `/payments/${id}`;
    case "Fee":
      return `/fees/${id}`;
    case "Payout":
      return `/treasury/payouts/${id}`;
    case "Transfer":
      return `/treasury/transfers/${id}`;
    case "OutboxMessage":
      return `/treasury/outbox/${id}`;
    case "ReconciliationRun":
      return `/reconciliation/runs/${id}`;
    case "WebhookEvent":
      return `/reconciliation/events/${encodeURIComponent(id)}`;
    default:
      return null;
  }
}

function show(v: unknown) {
  if (v === undefined) return "";
  return typeof v === "string" ? v : JSON.stringify(v);
}

function Diff({ e }: { e: Entry }) {
  const [raw, setRaw] = useState(false);
  const rows = jsonDiff(e.before, e.after);
  return (
    <div className="space-y-2 py-1">
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No field changes recorded.</p>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="w-1/4 py-1 text-left font-normal">Field</th>
              <th className="w-[37.5%] py-1 text-left font-normal">Before</th>
              <th className="w-[37.5%] py-1 text-left font-normal">After</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((r) => (
              <tr key={r.path} className="border-t align-top">
                <td className="py-1 pr-2 break-all">{r.path}</td>
                <td className={cn("py-1 pr-2 break-all", r.kind !== "added" && "bg-red-500/10 text-red-700 dark:text-red-300")}>
                  {r.kind === "added" ? <span className="text-muted-foreground">—</span> : show(r.before)}
                </td>
                <td className={cn("py-1 break-all", r.kind !== "removed" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300")}>
                  {r.kind === "removed" ? <span className="text-muted-foreground">—</span> : show(r.after)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Button size="xs" variant="ghost" onClick={() => setRaw((v) => !v)}>
        {raw ? "Hide" : "Show"} raw JSON
      </Button>
      {raw && (
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Before</div>
            <JsonView value={e.before} maxHeight="20rem" />
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">After</div>
            <JsonView value={e.after} maxHeight="20rem" />
          </div>
        </div>
      )}
    </div>
  );
}

function Page() {
  const canOp = useCanOp();
  const { values, set, reset, active } = useUrlFilters(KEYS);
  const query = compact(values);
  const list = useCursorList(qk.audit(query), (cursor) => call(api.GET("/v1/admin/audit-log", { params: { query: { ...query, cursor, limit: 50 } } })));
  const users = useQuery({ queryKey: qk.users, queryFn: () => call(api.GET("/v1/admin/users")), enabled: canOp("adminListUsers"), staleTime: 60_000 });
  const actorName = (id: string) => {
    const u = users.data?.find((x) => x.id === id);
    return u ? (u.name ?? u.email) : id === "system" || id.startsWith("cli:") ? id : null;
  };
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpen((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s).add(id)));

  return (
    <>
      <PageHeader title="Audit log" description="Every admin write, with before and after. Append-only." />
      <FilterBar onReset={reset} active={active}>
        <FilterSearch label="Entity" placeholder="Payout, Fee, AdminUser…" value={values.entity} onChange={(v) => set({ entity: v })} />
        <FilterSearch label="Entity id" placeholder="uuid or event id" value={values.entityId} onChange={(v) => set({ entityId: v })} />
        <FilterSearch label="Actor id" placeholder="admin uuid, system, cli:…" value={values.actorId} onChange={(v) => set({ actorId: v })} />
      </FilterBar>
      {list.isLoading ? (
        <LoadingBlock />
      ) : list.error && !list.rows?.length ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : !list.rows?.length ? (
        <EmptyState title={active ? "No entries match" : "Nothing audited yet"} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table className="text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-6" />
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Actor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((e) => {
                  const isOpen = open.has(e.id);
                  const href = entityHref(e.entity, e.entityId);
                  return (
                    <Fragment key={e.id}>
                      <TableRow className="cursor-pointer" onClick={() => toggle(e.id)} aria-expanded={isOpen}>
                        <TableCell>{isOpen ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}</TableCell>
                        <TableCell>
                          <DateTime iso={e.at} />
                        </TableCell>
                        <TableCell data-testid="audit-action">
                          {auditLabel(e.action) ? (
                            <>
                              <div>{auditLabel(e.action)}</div>
                              <div className="font-mono text-[11px] text-muted-foreground">{e.action}</div>
                            </>
                          ) : (
                            <span className="font-mono text-xs">{e.action}</span>
                          )}
                          {auditSummary(e) && <div className="text-xs text-muted-foreground">{auditSummary(e)}</div>}
                        </TableCell>
                        <TableCell>
                          <span className="mr-1">{e.entity}</span>
                          {href ? (
                            <Link href={href} onClick={(ev) => ev.stopPropagation()} className="font-mono text-xs underline-offset-2 hover:underline">
                              {e.entityId.slice(0, 13)}…
                            </Link>
                          ) : (
                            <CopyValue value={e.entityId} truncate className="max-w-40" />
                          )}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            className="text-left underline-offset-2 hover:underline"
                            title="Show only this actor"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              set({ actorId: e.actorId });
                            }}
                          >
                            {actorName(e.actorId) ?? <span className="font-mono text-xs">{e.actorId.slice(0, 13)}…</span>}
                          </button>
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell />
                          <TableCell colSpan={4}>
                            <Diff e={e} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{list.rows.length} entries</span>
            {list.hasMore && (
              <Button size="sm" variant="outline" onClick={list.loadMore} disabled={list.loadingMore}>
                {list.loadingMore && <Loader2 className="animate-spin" aria-hidden />}
                Load more
              </Button>
            )}
          </div>
        </>
      )}
    </>
  );
}

export function Audit() {
  return (
    <RequireOp op="adminAuditLog">
      <Page />
    </RequireOp>
  );
}
