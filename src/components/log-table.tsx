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
import { ChevronDown, MoreHorizontal } from "lucide-react";
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

// ---------------------------------------------------------------------------
// Safe string renderer
// ---------------------------------------------------------------------------

function s(val: unknown): string {
  return val === null || val === undefined ? "" : String(val);
}

// ---------------------------------------------------------------------------
// Column definitions (fixed normalized columns)
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
        onCheckedChange={(value: boolean) =>
          table.toggleAllPageRowsSelected(!!value)
        }
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
              onClick={() =>
                navigator.clipboard.writeText(JSON.stringify(item.raw))
              }
            >
              Copy raw row
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                navigator.clipboard.writeText(JSON.stringify(item, null, 2))
              }
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
  const { search, setSearch, filteredLogs } = useLogContext();

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});

  const table = useReactTable<NormalizedLog>({
    data: filteredLogs,
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

  return (
    <div className="w-full">
      <div className="flex items-center py-4 gap-4">
        <Input
          type="text"
          placeholder="Search logs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm border rounded px-2 py-1"
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
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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
