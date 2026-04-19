import { z } from "zod";
import { widgetInstance } from "./widgets";

/**
 * A Cockpit manifest is the single source of truth for what renders on the
 * in-vehicle display. Portal → signs + publishes → edge polls and atomically
 * swaps. Versioned; rollback on render error.
 */

export const theme = z.object({
  name: z.string().default("midnight"),
  accent: z.string().default("#ff7a29"),
  background: z.string().default("#0b0d10"),
  foreground: z.string().default("#e7ecf3"),
  mode: z.enum(["light", "dark"]).default("dark"),
});
export type Theme = z.infer<typeof theme>;

export const layoutGrid = z.object({
  cols: z.number().int().min(1).max(24).default(12),
  rowHeightPx: z.number().int().min(40).max(400).default(120),
  gapPx: z.number().int().min(0).max(32).default(12),
});
export type LayoutGrid = z.infer<typeof layoutGrid>;

export const manifest = z.object({
  manifestVersion: z.literal(1),
  name: z.string().min(1),
  description: z.string().optional(),
  template: z.enum(["chase", "livestream", "sar", "roaming", "custom"]).default("custom"),
  theme: theme.prefault({}),
  grid: layoutGrid.prefault({}),
  widgets: z.array(widgetInstance).default([]),
  metadata: z.record(z.string(), z.any()).default({}),
});
export type Manifest = z.infer<typeof manifest>;

export function parseManifest(input: unknown): Manifest {
  return manifest.parse(input);
}

export function safeParseManifest(input: unknown) {
  return manifest.safeParse(input);
}
