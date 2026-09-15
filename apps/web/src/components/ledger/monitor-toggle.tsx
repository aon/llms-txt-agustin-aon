"use client";

import { useOptimistic, useTransition } from "react";
import { setMonitoring } from "@/app/actions";
import { LocalTime } from "./local-time";

export function MonitorToggle({
  host,
  enabled,
  nextRunAt,
}: {
  host: string;
  enabled: boolean;
  nextRunAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(enabled);
  const next = !optimistic ? (
    "—"
  ) : optimistic === enabled && nextRunAt ? (
    <LocalTime iso={nextRunAt} />
  ) : (
    "scheduling…"
  );
  return (
    <>
      <label className="flex items-center justify-between">
        <span>WEEKLY</span>
        <button
          type="button"
          role="switch"
          aria-checked={optimistic}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setOptimistic(!optimistic);
              await setMonitoring(host, !optimistic);
            })
          }
          className={`relative h-[18px] w-8 rounded-full transition ${optimistic ? "bg-brand" : "bg-[#3a3a3a]"}`}
        >
          <span
            className={`absolute top-[2px] size-[14px] rounded-full bg-white transition ${optimistic ? "left-[16px]" : "left-[2px]"}`}
          />
        </button>
      </label>
      <div className="mt-2 flex justify-between text-dim">
        <span>NEXT</span>
        <span>{next}</span>
      </div>
    </>
  );
}
