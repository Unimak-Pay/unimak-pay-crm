"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { enrolmentStatusValues } from "@/api/schema.gen";
import { useMe } from "@/auth/auth-provider";
import { AcademicFilters, useScopeNames } from "@/components/academics";
import { columnsFor, DataTable } from "@/components/data-table";
import { ExportCsvButton } from "@/components/export-button";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/filters";
import { DateTime, Money, StatusBadge } from "@/components/format";
import { Can, RequireOp } from "@/components/permission";
import { PageHeader } from "@/components/states";
import { useCursorList } from "@/hooks/use-cursor-list";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { asStrings, DEFAULT_SORT, LIST_KEYS, listQuery, listSort, reportQuery, SORT_LABEL, SORTS, STANDING_LABEL, STANDINGS } from "./drill";
import { FeeFilters, IncludeInactiveSwitch, LevelFilter, OverdueFlag, StandingBadge } from "./shared";

type Row = components["schemas"]["PayerListItem"];

const col = columnsFor<Row>();
const columns = [
  col.accessor("ref", { id: "ref", header: "Ref", cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
  col.accessor("fullName", {
    id: "name",
    header: "Name",
    cell: (c) => (
      <div className="max-w-52">
        <div className="truncate">{c.getValue()}</div>
        {c.row.original.kind === "APPLICANT" && <div className="text-[11px] text-muted-foreground">Applicant</div>}
      </div>
    ),
  }),
  col.accessor("maskedPhone", { header: "Phone", enableSorting: false, cell: (c) => <span className="font-mono text-xs whitespace-nowrap">{c.getValue()}</span> }),
  col.accessor("maskedEmail", {
    header: "Email",
    enableSorting: false,
    cell: (c) => (c.getValue() ? <span className="font-mono text-xs whitespace-nowrap">{c.getValue()}</span> : <span className="text-muted-foreground">—</span>),
  }),
  col.accessor((r) => r.departmentName ?? r.department ?? "", {
    id: "department",
    header: "Department",
    enableSorting: false,
    cell: (c) => <span className="block max-w-44 truncate">{c.getValue() || <span className="text-muted-foreground">—</span>}</span>,
  }),
  col.accessor("level", { header: "Level", enableSorting: false, meta: { align: "right" }, cell: (c) => c.getValue() ?? "—" }),
  col.accessor((r) => r.enrolmentStatus ?? r.applicantStatus ?? "", {
    id: "status",
    header: "Status",
    enableSorting: false,
    cell: (c) => (c.getValue() ? <StatusBadge status={c.getValue()} /> : <span className="text-muted-foreground">—</span>),
  }),
  col.accessor("billed", { header: "Billed", enableSorting: false, meta: { align: "right" }, cell: (c) => <Money minor={c.getValue()} /> }),
  col.accessor("collected", { header: "Collected", enableSorting: false, meta: { align: "right" }, cell: (c) => <Money minor={c.getValue()} /> }),
  col.accessor("balance", { id: "balance", header: "Balance", meta: { align: "right" }, cell: (c) => <Money minor={c.getValue()} className="font-medium" /> }),
  col.accessor("standing", {
    header: "Standing",
    enableSorting: false,
    cell: (c) => (
      <span className="flex flex-wrap gap-1">
        <StandingBadge standing={c.getValue()} />
        {c.row.original.overdue && <OverdueFlag />}
      </span>
    ),
  }),
  col.accessor("lastPaymentAt", { header: "Last payment", enableSorting: false, cell: (c) => <DateTime iso={c.getValue()} /> }),
];

/** "-name" / "-ref" don't exist on the API: a second click on Name or Ref keeps ascending. */
const normalizeSort = (v: string) => listSort(v.replace(/^-(name|ref)$/, "$1"));

function List() {
  const me = useMe();
  const scope = useScopeNames(me.departments, me.faculties);
  const { values, set, reset, active } = useUrlFilters(LIST_KEYS);
  const query = listQuery(values);
  const sort = listSort(values.sort);
  const list = useCursorList(qk.payers({ ...query, sort }), (cursor) => call(api.GET("/v1/admin/payers", { params: { query: { ...query, sort, cursor, limit: 50 } } })));
  // came from the outstanding grid: offer the way back with the same report filters
  const fromReport = Object.keys(reportQuery(values)).length > 0;
  const reportHref = `/students/outstanding?${new URLSearchParams(asStrings(reportQuery(values)) as Record<string, string>)}`;

  return (
    <>
      <PageHeader
        title="Students"
        description={
          <>
            Students and applicants with what they were billed, have paid and still owe. Phones and emails are masked; open a student for them in full.
            {me.departmentScoped && ` Only ${scope.departments.join(", ") || "your departments"}.`}
          </>
        }
        actions={
          <>
            {fromReport && (
              <Can op="adminReportsOutstanding">
                <Link href={reportHref} className="inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline">
                  <ArrowLeft className="size-3" aria-hidden /> Outstanding
                </Link>
              </Can>
            )}
            <Can op="adminExportPayers">
              <ExportCsvButton op="adminExportPayers" path="/v1/admin/payers/export.csv" query={asStrings({ ...query, sort })} />
            </Can>
          </>
        }
      />
      <FilterBar onReset={reset} active={active}>
        <FilterSearch label="Ref or name" placeholder="UNI-2025-0101 · Kamara" value={values.q} onChange={(v) => set({ q: v })} />
        <FilterSelect label="Standing" value={values.standing} onChange={(v) => set({ standing: v })} options={STANDINGS.map((s) => ({ value: s, label: STANDING_LABEL[s] }))} />
        <FilterSelect
          label="Kind"
          value={values.kind}
          onChange={(v) => set({ kind: v })}
          allLabel="Students and applicants"
          options={[
            { value: "STUDENT", label: "Students" },
            { value: "APPLICANT", label: "Applicants" },
          ]}
        />
        <FeeFilters feeId={values.feeId} feeType={values.feeType} period={values.period} onChange={set} />
        <AcademicFilters me={me} faculty={values.faculty} department={values.department} onChange={set} />
        <LevelFilter value={values.level} onChange={(v) => set({ level: v })} />
        <FilterSelect label="Enrolment" value={values.enrolmentStatus} onChange={(v) => set({ enrolmentStatus: v })} options={enrolmentStatusValues} />
        <FilterSelect
          label="Sort"
          allLabel={SORT_LABEL[DEFAULT_SORT]}
          value={values.sort === DEFAULT_SORT ? "" : values.sort}
          onChange={(v) => set({ sort: v })}
          options={SORTS.filter((s) => s !== DEFAULT_SORT).map((s) => ({ value: s, label: SORT_LABEL[s] }))}
        />
        <IncludeInactiveSwitch value={values.includeInactive === "true"} onChange={(v) => set({ includeInactive: v ? "true" : "" })} />
      </FilterBar>
      <DataTable
        columns={columns}
        rows={list.rows}
        getRowId={(r) => r.id}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        hasMore={list.hasMore}
        loadingMore={list.loadingMore}
        onLoadMore={list.loadMore}
        rowHref={(r) => `/students/${r.id}`}
        emptyTitle={active ? "No students match these filters" : "No students yet"}
        emptyHint={active ? null : "Students appear once the university portal sends them."}
        serverSort={{
          value: sort,
          defaultValue: DEFAULT_SORT,
          onChange: (v) => {
            const s = normalizeSort(v);
            set({ sort: s === DEFAULT_SORT ? "" : s });
          },
          columns: { balance: "balance", name: "name", ref: "ref" },
        }}
      />
    </>
  );
}

export function StudentsList() {
  return (
    <RequireOp op="adminListPayers">
      <List />
    </RequireOp>
  );
}
