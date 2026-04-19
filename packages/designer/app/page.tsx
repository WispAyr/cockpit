import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function loadTemplates() {
  const dir = path.resolve(process.cwd(), "../../templates");
  const names = await fs.readdir(dir);
  return Promise.all(
    names.filter((n) => n.endsWith(".json")).map(async (n) => ({
      slug: n.replace(/\.json$/, ""),
      data: JSON.parse(await fs.readFile(path.join(dir, n), "utf8")) as any,
    })),
  );
}

export default async function Home() {
  const templates = await loadTemplates();
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-semibold">Cockpit · Designer</h1>
      <p className="mt-2 opacity-80">
        Manifest-driven dashboard builder. Pick a template, tune widgets, publish to a vehicle.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {templates.map((t) => (
          <Link
            key={t.slug}
            href={`/template/${t.slug}`}
            className="rounded-lg border border-white/10 p-5 hover:bg-white/5"
          >
            <div className="text-xs uppercase opacity-60">{t.data.template}</div>
            <div className="mt-1 text-xl font-semibold">{t.data.name}</div>
            <p className="mt-1 text-sm opacity-70">{t.data.description}</p>
            <div className="mt-3 text-xs opacity-50">{t.data.widgets.length} widgets</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
