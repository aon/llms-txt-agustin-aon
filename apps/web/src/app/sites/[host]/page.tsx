import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Shell } from "@/components/ledger/shell";
import { SiteView } from "@/components/ledger/site-view";
import { loadSitePage } from "@/lib/site-data";

export async function generateMetadata({
  params,
}: PageProps<"/sites/[host]">): Promise<Metadata> {
  const { host } = await params;
  return { title: `${host} · llms.txt` };
}

export default async function SitePage({ params }: PageProps<"/sites/[host]">) {
  const { host } = await params;
  const data = await loadSitePage(host);
  if (!data) notFound();
  return (
    <Shell
      host={host}
      origin={data.site.origin}
      state={data.running ? "running" : "finished"}
    >
      <SiteView data={data} />
    </Shell>
  );
}
