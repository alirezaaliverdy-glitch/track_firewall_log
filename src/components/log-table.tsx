import * as React from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowUp, ChevronDown, Filter, List, MoreHorizontal, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "./ui/input";
import { useLogContext } from "@/context/LogContext";
import type { NormalizedLog } from "@/types/log";

// ---------------------------------------------------------------------------
// Action badge
// ---------------------------------------------------------------------------

const ACTION_STYLES: Record<string, string> = {
  allow:  "bg-green-900/60 text-green-300 border-green-700",
  deny:   "bg-red-900/60 text-red-300 border-red-700",
  drop:   "bg-orange-900/60 text-orange-300 border-orange-700",
  reset:  "bg-purple-900/60 text-purple-300 border-purple-700",
};

function ActionBadge({ action }: { action?: string }) {
  if (!action) return <span className="text-zinc-500">—</span>;
  const style = ACTION_STYLES[action] ?? "bg-zinc-800 text-zinc-300 border-zinc-600";
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded border text-xs font-medium ${style}`}>
      {action}
    </span>
  );
}

function s(val: unknown): string {
  return val === null || val === undefined ? "" : String(val);
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const COLUMNS: ColumnDef<NormalizedLog>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value: boolean) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }: { row: any }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "timestamp",
    header: "Timestamp",
    cell: ({ row }: { row: any }) => (
      <span className="text-xs text-zinc-300 whitespace-nowrap">{s(row.getValue("timestamp"))}</span>
    ),
  },
  {
    accessorKey: "action",
    header: "Action",
    cell: ({ row }: { row: any }) => <ActionBadge action={row.getValue("action")} />,
  },
  {
    accessorKey: "protocol",
    header: "Proto",
    cell: ({ row }: { row: any }) => (
      <span className="text-xs uppercase text-zinc-400">{s(row.getValue("protocol"))}</span>
    ),
  },
  {
    accessorKey: "srcIp",
    header: "Src IP",
    cell: ({ row }: { row: any }) => (
      <span className="font-mono text-xs">{s(row.getValue("srcIp"))}</span>
    ),
  },
  {
    accessorKey: "srcPort",
    header: "Src Port",
    cell: ({ row }: { row: any }) => (
      <span className="font-mono text-xs text-zinc-400">{s(row.getValue("srcPort"))}</span>
    ),
  },
  {
    accessorKey: "dstIp",
    header: "Dst IP",
    cell: ({ row }: { row: any }) => (
      <span className="font-mono text-xs">{s(row.getValue("dstIp"))}</span>
    ),
  },
  {
    accessorKey: "dstPort",
    header: "Dst Port",
    cell: ({ row }: { row: any }) => (
      <span className="font-mono text-xs text-zinc-400">{s(row.getValue("dstPort"))}</span>
    ),
  },
  {
    accessorKey: "trafficDirection",
    header: "Direction",
    cell: ({ row }: { row: any }) => (
      <span className="rounded border border-blue-900/60 bg-blue-950/30 px-1.5 py-0.5 text-[11px] text-blue-200">
        {s(row.getValue("trafficDirection")) || "unknown"}
      </span>
    ),
  },
  {
    accessorKey: "serviceCategory",
    header: "Service Type",
    cell: ({ row }: { row: any }) => (
      <span className="text-xs text-slate-400">{s(row.getValue("serviceCategory"))}</span>
    ),
  },
  {
    accessorKey: "bytes",
    header: "Bytes",
    cell: ({ row }: { row: any }) => {
      const val = row.getValue("bytes") as number | undefined;
      return (
        <span className="text-xs text-zinc-400">
          {val !== undefined ? val.toLocaleString() : ""}
        </span>
      );
    },
  },
  {
    accessorKey: "packets",
    header: "Pkts",
    cell: ({ row }: { row: any }) => {
      const val = row.getValue("packets") as number | undefined;
      return (
        <span className="text-xs text-zinc-400">
          {val !== undefined ? val.toLocaleString() : ""}
        </span>
      );
    },
  },
  {
    accessorKey: "service",
    header: "Service",
    cell: ({ row }: { row: any }) => (
      <span className="text-xs text-zinc-400">{s(row.getValue("service"))}</span>
    ),
  },
  {
    accessorKey: "ruleName",
    header: "Rule",
    cell: ({ row }: { row: any }) => (
      <span className="text-xs text-zinc-400">{s(row.getValue("ruleName"))}</span>
    ),
  },
  {
    accessorKey: "vendor",
    header: "Vendor",
    cell: ({ row }: { row: any }) => (
      <span className="text-xs text-zinc-500">{s(row.getValue("vendor"))}</span>
    ),
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }: { row: any }) => {
      const item = row.original as NormalizedLog;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(JSON.stringify(item.raw))}
            >
              Copy raw row
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(JSON.stringify(item, null, 2))}
            >
              Copy normalized
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LogTable() {
  const {
    search,
    setSearch,
    activeTableLogs,
    logs,
    selectedFinding,
    clearSelectedFinding,
  } = useLogContext();

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});

  const table = useReactTable<NormalizedLog>({
    data: activeTableLogs,
    columns: COLUMNS,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: { sorting, columnFilters, columnVisibility, rowSelection },
  });

  const clearEvidenceMode = () => {
    clearSelectedFinding();
    setSearch("");
  };

  const scrollToFindings = () => {
    document.getElementById("security-findings")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div id="evidence-log-area" className="w-full scroll-mt-4">
      {/* Evidence filter banner */}
      {selectedFinding && (
        <div className="mb-3 rounded-lg border border-blue-700/60 bg-blue-950/30 px-4 py-3 shadow-[inset_0_1px_0_rgba(59,130,246,0.12)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="mb-1 inline-flex items-center gap-1.5 rounded border border-blue-700/60 bg-blue-900/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-200">
                <Filter className="h-3 w-3" aria-hidden="true" />
                Evidence mode
              </div>
              <p className="truncate text-sm text-blue-200">
                <span className="font-semibold">Showing evidence for:</span>{" "}
                {selectedFinding.title}
              </p>
              <p className="mt-1 text-xs text-blue-400/80">
                Viewing {activeTableLogs.length.toLocaleString()} evidence row{activeTableLogs.length !== 1 ? "s" : ""} from {logs.length.toLocaleString()} total log row{logs.length !== 1 ? "s" : ""}.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={clearEvidenceMode}
                className="inline-flex items-center gap-1.5 rounded-md border border-blue-600/70 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
              >
                <List className="h-3.5 w-3.5" aria-hidden="true" />
                Show All Logs
              </button>
              <button
                type="button"
                onClick={scrollToFindings}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-600 bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-blue-700/60 hover:text-blue-200"
              >
                <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                Back to Findings
              </button>
              <button
                type="button"
                onClick={clearEvidenceMode}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-600 bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-blue-700/60 hover:text-blue-200"
              >
                <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                Clear Evidence Filter
              </button>
            </div>
          </div>
        </div>
      )}

      {!selectedFinding && (
        <div className="mb-3 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5">
          <p className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 font-medium text-zinc-300">
              <List className="h-3 w-3 text-blue-400" aria-hidden="true" />
              Viewing all logs
            </span>
            {search && (
              <span className="text-zinc-500"> matching the current search</span>
            )}
            <span className="text-zinc-600">
              ({activeTableLogs.length.toLocaleString()} row{activeTableLogs.length !== 1 ? "s" : ""})
            </span>
          </p>
        </div>
      )}

      {/* Search + column toggle */}
      <div className="flex items-center py-4 gap-4">
        <Input
          type="text"
          placeholder={selectedFinding ? "Search within evidence..." : "Search logs..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm rounded border border-zinc-700 px-2 py-1 focus-visible:ring-blue-600/40"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
              Columns <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((col) => col.getCanHide())
              .map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  className="capitalize"
                  checked={col.getIsVisible()}
                  onCheckedChange={(v: boolean) => col.toggleVisibility(!!v)}
                >
                  {col.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-md border border-zinc-700">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{
                      background: "#18181b",
                      color: "#a1a1aa",
                      borderBottom: "1px solid #3f3f46",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={COLUMNS.length} className="h-24 text-center text-zinc-500">
                  {selectedFinding ? "No evidence logs match the current search." : "No results."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end space-x-2 py-4">
        <div className="text-muted-foreground flex-1 text-sm">
          {table.getFilteredSelectedRowModel().rows.length} of{" "}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
