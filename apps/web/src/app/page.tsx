export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="font-semibold text-3xl tracking-tight">
        Generate an llms.txt for any site
      </h1>
      <p className="text-foreground/70">
        Paste a URL. We crawl the site, rank its pages and write a
        spec-conformant <code className="font-mono">llms.txt</code> you can
        serve to AI tools.
      </p>
    </main>
  );
}
