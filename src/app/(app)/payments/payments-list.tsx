"use client";

import { useQuery } from "@tanstack/react-query";
import { api, call } from "@/api/client";
import { qk } from "@/api/keys";
import type { components } from "@/api/schema.gen";
import { channelValues, componentsParametersSortValues, paymentStatusValues } from "@/api/schema.gen";
import { useMe } from "@/auth/auth-provider";
import { AcademicFilters, useScopeNames } from "@/components/academics";
import { columnsFor, DataTable, minorSortValue } from "@/components/data-table";
import { DayRangeFilter, FilterBar, FilterSearch, FilterSelect } from "@/components/filters";
import { CopyValue, DateTime, Money, StatusBadge } from "@/components/format";
import { ExportCsvButton } from "@/components/export-button";
import { RequireOp, useCanOp } from "@/components/permission";
import { PageHeader } from "@/components/states";
import { useCursorList } from "@/hooks/use-cursor-list";
import { compact, useUrlFilters } from "@/hooks/use-url-filters";
import { dayEndIso, dayStartIso, isDay } from "@/lib/time";

type Payment = components["schemas"]["AdminPayment"];
type Sort = NonNullable<components["parameters"]["Sort"]>;

const KEYS = ["status", "channel", "feeType", "faculty", "department", "payerRef", "ref", "from", "to", "sort"] as const;
const STATUSES = paymentStatusValues;
const SORTS = componentsParametersSortValues;

const col = columnsFor<Payment>();
const columns = [
  col.accessor("createdAt", { id: "createdAt", header: "Created", cell: (c) => <DateTime iso={c.getValue()} /> }),
  col.accessor("paymentRef", { header: "Ref", enableSorting: false, cell: (c) => <CopyValue value={c.getValue()} /> }),
  col.accessor((p) => p.payer.fullName, {
    id: "payer",
    header: "Payer",
    enableSorting: false,
    cell: (c) => (
      <div className="max-w-48">
        <div className="truncate">{c.getValue()}</div>
        <div className="truncate font-mono text-[11px] text-muted-foreground">
          {c.row.original.payer.ref} · {c.row.original.payer.programCode}
        </div>
        {c.row.original.payer.departmentName && (
          <div className="truncate text-[11px] text-muted-foreground" title={c.row.original.payer.facultyName ?? undefined}>
            {c.row.original.payer.departmentName}
          </div>
        )}
      </div>
    ),
  }),
  col.accessor("feeTypeCode", { header: "Fee", enableSorting: false, cell: (c) => <span title={c.row.original.feeName}>{c.getValue()}</span> }),
  col.accessor("channel", { header: "Channel", enableSorting: false }),
  col.accessor("payerPhone", { header: "Phone", enableSorting: false, cell: (c) => <span className="font-mono text-xs">{c.getValue() ?? "—"}</span> }),
  col.accessor("status", { header: "Status", enableSorting: false, cell: (c) => <StatusBadge status={c.getValue()} /> }),
  col.accessor((p) => minorSortValue(p.amount), {
    id: "amount",
    header: "Amount",
    meta: { align: "right" },
    cell: (c) => <Money minor={c.row.original.amount} />,
  }),
];

function filtersToQuery(v: Record<(typeof KEYS)[number], string>) {
  return compact({
    status: v.status as Payment["status"] | "",
    channel: v.channel as Payment["channel"] | "",
    feeType: v.feeType,
    faculty: v.faculty,
    department: v.department,
    payerRef: v.payerRef,
    ref: v.ref,
    from: isDay(v.from) ? dayStartIso(v.from) : "",
    to: isDay(v.to) ? dayEndIso(v.to) : "",
  });
}

function List() {
  const me = useMe();
  const scope = useScopeNames(me.departments, me.faculties);
  const canOp = useCanOp();
  const { values, set, reset, active } = useUrlFilters(KEYS);
  const sort: Sort = (SORTS as readonly string[]).includes(values.sort) ? (values.sort as Sort) : "-createdAt";
  const query = filtersToQuery(values);
  const list = useCursorList(qk.payments({ ...query, sort }), async (cursor) =>
    call(api.GET("/v1/admin/payments", { params: { query: { ...query, sort, cursor, limit: 50 } } })),
  );
  const feeTypes = useQuery({ queryKey: qk.feeTypes, queryFn: () => call(api.GET("/v1/admin/fee-types")), enabled: canOp("adminFeeTypes") });

  return (
    <>
      <PageHeader
        title="Payments"
        description={
          me.departmentScoped
            ? `Only ${scope.departments.join(", ") || "your departments"}. Newest first.`
            : "Every payment from USSD and Dash Dots. Newest first."
        }
        actions={<ExportCsvButton op="adminExportPayments" path="/v1/admin/payments/export.csv" query={query} />}
      />
      <FilterBar onReset={reset} active={active}>
        <FilterSearch
          label="Payment ref, order no. or spm- id"
          placeholder="15540719 · 3BMR… · spm-…"
          value={values.ref}
          onChange={(v) => set({ ref: v })}
        />
        <FilterSearch label="Payer (student / applicant ref)" placeholder="UNI-2025-0002" value={values.payerRef} onChange={(v) => set({ payerRef: v })} />
        <FilterSelect label="Status" value={values.status} onChange={(v) => set({ status: v })} options={STATUSES} />
        <FilterSelect label="Channel" value={values.channel} onChange={(v) => set({ channel: v })} options={channelValues} />
        <FilterSelect
          label="Fee type"
          value={values.feeType}
          onChange={(v) => set({ feeType: v })}
          options={(feeTypes.data ?? []).map((t) => ({ value: t.code, label: `${t.code} · ${t.name}` }))}
        />
        <AcademicFilters me={me} faculty={values.faculty} department={values.department} onChange={set} />
        <DayRangeFilter optional presets={false} from={values.from} to={values.to} onChange={(r) => set(r)} />
      </FilterBar>
      <DataTable
        columns={columns}
        rows={list.rows}
        getRowId={(p) => p.id}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        hasMore={list.hasMore}
        loadingMore={list.loadingMore}
        onLoadMore={list.loadMore}
        rowHref={(p) => `/payments/${p.id}`}
        emptyTitle={active ? "No payments match these filters" : "No payments yet"}
        serverSort={{ value: sort, onChange: (v) => set({ sort: v === "-createdAt" ? "" : v }), columns: { createdAt: "createdAt", amount: "amount" } }}
      />
    </>
  );
}

export function PaymentsList() {
  return (
    <RequireOp op="adminListPayments">
      <List />
    </RequireOp>
  );
}
