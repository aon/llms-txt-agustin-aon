import { loadCurrentFile } from "@/lib/site-data";

const TEXT = "text/plain; charset=utf-8";

/** The stable URL: whatever the last successful crawl wrote, straight from S3. */
export async function GET(
  _request: Request,
  context: RouteContext<"/sites/[host]/llms.txt">,
) {
  const { host } = await context.params;
  const bytes = await loadCurrentFile(host);
  if (!bytes) {
    return new Response(`No llms.txt for ${host} yet\n`, {
      status: 404,
      headers: { "content-type": TEXT },
    });
  }
  return new Response(new TextDecoder().decode(bytes), {
    headers: { "content-type": TEXT, "cache-control": "public, max-age=60" },
  });
}
