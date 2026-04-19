import { loadManifest } from "@/lib/manifest-source";
import CockpitView from "./CockpitView";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { manifest, source } = await loadManifest();
  return <CockpitView manifest={manifest} source={source} />;
}
