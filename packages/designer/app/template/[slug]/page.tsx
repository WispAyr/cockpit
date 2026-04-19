import fs from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import PublishForm from "./PublishForm";

export default async function TemplatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const file = path.resolve(process.cwd(), `../../templates/${slug}.json`);
  let data: any;
  try { data = JSON.parse(await fs.readFile(file, "utf8")); } catch { notFound(); }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <a href="/" className="text-sm opacity-70 underline">← Templates</a>
      <h1 className="mt-3 text-3xl font-semibold">{data.name}</h1>
      <p className="mt-1 opacity-80">{data.description}</p>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Widgets</h2>
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {data.widgets.map((w: any) => (
            <li key={w.id} className="rounded border border-white/10 px-3 py-2 text-sm">
              <div className="font-mono text-xs opacity-60">{w.id}</div>
              <div>{w.title ?? w.type}</div>
              <div className="text-xs opacity-60">
                grid {w.grid.col},{w.grid.row} · {w.grid.w}×{w.grid.h}
                {w.bind ? ` · ${w.bind.source}` : ""}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Publish</h2>
        <PublishForm manifest={data} />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Raw manifest</h2>
        <pre className="mt-3 overflow-auto rounded bg-black/60 border border-white/10 p-4 text-xs">
{JSON.stringify(data, null, 2)}
        </pre>
      </section>
    </main>
  );
}
