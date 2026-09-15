export function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-line border-t py-4 first:border-t-0 first:pt-0">
      <div className="mb-2 text-dim uppercase tracking-[0.08em]">{title}</div>
      {children}
    </div>
  );
}
