import { Shell } from "@/components/ledger/shell";

export default function NotFound() {
  return (
    <Shell state="idle">
      <p className="mt-16 border-line border-t pt-4 text-center font-mono text-[12px] text-dim uppercase tracking-[0.08em]">
        No such site or crawl
      </p>
    </Shell>
  );
}
