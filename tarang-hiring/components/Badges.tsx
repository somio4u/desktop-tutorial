import { statusLabel } from "@/lib/constants";

export function PriorityBadge({ priority, error }: { priority: string | null; error?: string | null }) {
  if (!priority) {
    return <span className="whitespace-nowrap rounded-full border border-dashed border-gray-300 px-2.5 py-0.5 text-xs text-muted">{error ? "Not scored – retry" : "Not scored"}</span>;
  }
  const cls =
    priority === "high"
      ? "bg-tyellow text-tblue font-bold"
      : priority === "medium"
        ? "border border-tblue text-tblue font-medium"
        : "bg-gray-200 text-muted font-medium";
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs capitalize ${cls}`}>{priority}</span>;
}

export const StatusText = ({ s }: { s: string }) => <>{statusLabel(s)}</>;
