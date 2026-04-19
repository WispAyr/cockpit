import { z } from "zod";

/**
 * Every widget has:
 *   - id:   unique within a manifest
 *   - type: registry key (starlink, gps, weather, camera, map, stormfront, …)
 *   - grid: placement on the cockpit canvas (12-col × N-row grid, like CSS grid)
 *   - bind: data binding — which Prism lens / siphon source / local sensor feeds it
 *   - props: type-specific, loose bag; validated at render time by the widget itself
 *
 * Widgets stay intentionally loose in the schema — the widget component is the
 * authority on its own props. The manifest just guarantees shape + binding.
 */

export const gridSpec = z.object({
  col: z.number().int().min(1).max(12),
  row: z.number().int().min(1),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(12),
});
export type GridSpec = z.infer<typeof gridSpec>;

export const binding = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("prism"),
    lens: z.string(),
    params: z.record(z.string(), z.any()).optional(),
    refreshMs: z.number().int().min(250).default(5000),
  }),
  z.object({
    source: z.literal("siphon"),
    sourceId: z.string(),
    refreshMs: z.number().int().min(250).default(5000),
  }),
  z.object({
    source: z.literal("local"),
    sensor: z.enum(["starlink", "gps", "weather", "roof", "compute", "power", "cellular"]),
    refreshMs: z.number().int().min(250).default(1000),
  }),
  z.object({
    source: z.literal("camera"),
    vehicleCameraSlug: z.string(),
  }),
  z.object({
    source: z.literal("static"),
    value: z.any(),
  }),
]);
export type Binding = z.infer<typeof binding>;

export const widgetType = z.enum([
  "starlink_status",
  "gps_position",
  "gps_map3d",
  "weather_tile",
  "roof_environment",
  "camera_tile",
  "map_tile",
  "stormfront_outlook",
  "adsb_strip",
  "dispatch_feed",
  "livestream_control",
  "sar_status",
  "van_spectrum_slot",
  "text_block",
  "clock",
]);
export type WidgetType = z.infer<typeof widgetType>;

export const widgetInstance = z.object({
  id: z.string().min(1),
  type: widgetType,
  title: z.string().optional(),
  grid: gridSpec,
  bind: binding.optional(),
  props: z.record(z.string(), z.any()).default({}),
});
export type WidgetInstance = z.infer<typeof widgetInstance>;
