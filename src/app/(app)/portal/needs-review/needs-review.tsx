"use client";

import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Fragment, useId, useState } from "react";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { useMe } from "@/auth/auth-provider";
import { DepartmentName, DepartmentSelect, useScopeNames } from "@/components/academics";
import { FilterBar, FilterSelect } from "@/components/filters";
import { DateTime, Money, StatusBadge } from "@/components/format";
import { RequireOp } from "@/components/permission";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCursorList } from "@/hooks/use-cursor-list";
import { compact, useUrlFilters } from "@/hooks/use-url-filters";

type Payer = components["schemas"]["NeedsReviewPayer"];
type Status = Payer["enrolmentStatus"];

const STATUSES: readonly Status[] = ["SUSPENDED", "WITHDRAWN", "GRADUATED"];
const KEYS = ["department", "status"] as const;
const COLS = 8;

function Obligations({ payer }: { payer: Payer }) {
  return (
    <div className="rounded-md border bg-background">
      <Table className="text-[13px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Fee</TableHead>
            <TableHead>Period</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payer.obligations.map((o) => (
            <TableRow key={o.id} className="hover:bg-transparent">
              <TableCell>{o.feeName}</TableCell>
              <TableCell>{o.period}</TableCell>
              <TableCell className="text-right">
                <Money minor={o.amount} />
              </TableCell>
              <TableCell className="text-right font-medium">
                <Money minor={o.balance} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function List() {
  const me = useMe();
  const scope = useScopeNames(me.departments, me.faculties);
  const departmentId = useId();
  const { values, set, reset, active } = useUrlFilters(KEYS);
  const status = (STATUSES as readonly string[]).includes(values.status) ? (values.status as Status) : undefined;
  const query = compact({ department: values.department, status });
  const list = useCursorList(qk.needsReview(query), (cursor) =>
    call(api.GET("/v1/admin/payers/needs-review", { params: { query: { ...query, cursor, limit: 50 } } })),
  );
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <PageHeader
        title="Needs review"
        description={
          <>
            Students the portal marks suspended, withdrawn or graduated who still owe something. They get no new charges; what they owe stays payable
            until someone decides.
            {me.departmentScoped && ` Only ${scope.departments.join(", ") || "your departments"}.`}
          </>
        }
      />
      <FilterBar onReset={reset} active={active}>
        <div className="flex flex-col gap-1">
          <Label htmlFor={departmentId} className="text-xs text-muted-foreground">
            Department
          </Label>
          <DepartmentSelect
            id={departmentId}
            anyLabel="All departments"
            limitTo={me.departmentScoped ? me.departments : undefined}
            value={values.department}
            onChange={(d) => set({ department: d })}
          />
        </div>
        <FilterSelect label="Status" value={values.status} onChange={(v) => set({ status: v })} options={STATUSES} />
      </FilterBar>

      {list.isLoading ? (
        <LoadingBlock />
      ) : list.error && !list.rows?.length ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : (
        <div className="min-w-0">
          <div className="overflow-x-auto rounded-md border">
            <Table className="text-[13px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8" />
                  <TableHead>Name</TableHead>
                  <TableHead>Ref</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Level</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead className="text-right">Total balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!list.rows?.length && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={COLS}>
                      <EmptyState title={active ? "No students match these filters" : "Nobody needs review"}>
                        {active ? null : "Every student who left, was suspended or graduated has nothing left to pay."}
                      </EmptyState>
                    </TableCell>
                  </TableRow>
                )}
                {list.rows?.map((p) => {
                  const expanded = open.has(p.id);
                  const detailId = `obligations-${p.id}`;
                  return (
                    <Fragment key={p.id}>
                      <TableRow data-testid="needs-review-row" className="cursor-pointer" onClick={() => toggle(p.id)}>
                        <TableCell className="py-1.5">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-expanded={expanded}
                            aria-controls={detailId}
                            aria-label={`${expanded ? "Hide" : "Show"} ${p.fullName}'s obligations`}
                            onClick={(e) => (e.stopPropagation(), toggle(p.id))}
                          >
                            {expanded ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
                          </Button>
                        </TableCell>
                        <TableCell className="py-1.5">{p.fullName}</TableCell>
                        <TableCell className="py-1.5 font-mono text-xs">{p.ref}</TableCell>
                        <TableCell className="py-1.5">
                          <DepartmentName code={p.department} />
                        </TableCell>
                        <TableCell className="py-1.5 text-right tabular-nums">{p.level ?? "—"}</TableCell>
                        <TableCell className="py-1.5">
                          <StatusBadge status={p.enrolmentStatus} />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <DateTime iso={p.statusSince} />
                        </TableCell>
                        <TableCell className="py-1.5 text-right font-medium">
                          <Money minor={p.totalBalance} />
                        </TableCell>
                      </TableRow>
                      {expanded && (
                        <TableRow id={detailId} className="bg-muted/40 hover:bg-muted/40">
                          <TableCell />
                          <TableCell colSpan={COLS - 1} className="py-2">
                            <Obligations payer={p} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {list.error && list.rows?.length ? <ErrorState error={list.error} onRetry={list.refetch} className="mt-2 py-3" /> : null}
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {list.rows?.length ?? 0} {list.rows?.length === 1 ? "student" : "students"}
              {list.hasMore ? " loaded" : ""}
            </span>
            {list.hasMore && (
              <Button size="sm" variant="outline" onClick={list.loadMore} disabled={list.loadingMore}>
                {list.loadingMore && <Loader2 className="animate-spin" aria-hidden />}
                Load more
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function NeedsReviewList() {
  return (
    <RequireOp op="adminPayersNeedsReview">
      <List />
    </RequireOp>
  );
}
