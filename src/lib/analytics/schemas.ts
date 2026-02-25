import { z } from "zod";

const eventNamePattern = /^[a-zA-Z0-9_:/-]+$/;

export const analyticsElementSchema = z
  .object({
    type: z.string().trim().min(1).max(48).optional(),
    id: z.string().trim().min(1).max(160).optional(),
    text: z.string().trim().min(1).max(240).optional(),
    href: z.string().trim().min(1).max(420).optional(),
  })
  .partial();

export const analyticsEventInputSchema = z.object({
  session_id: z.string().trim().min(8).max(128),
  event_name: z.string().trim().min(2).max(80).regex(eventNamePattern),
  event_category: z.string().trim().max(80).optional(),
  page_path: z.string().trim().max(420).optional(),
  referrer: z.string().trim().max(420).optional(),
  element: analyticsElementSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  duration_ms: z.coerce.number().int().min(0).max(1000 * 60 * 60 * 4).optional(),
  device: z
    .object({
      platform: z.string().trim().max(80).optional(),
      isMobile: z.boolean().optional(),
    })
    .optional(),
  occurred_at: z.string().datetime().optional(),
});

export const analyticsTrackRequestSchema = z.object({
  events: z.array(analyticsEventInputSchema).min(1).max(50),
});

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

export const analyticsAdminFiltersSchema = z.object({
  from: z.string().trim().regex(dayPattern).optional(),
  to: z.string().trim().regex(dayPattern).optional(),
  client_id: z.coerce.number().int().positive().optional(),
  event_name: z.string().trim().max(80).optional(),
  category: z.string().trim().max(80).optional(),
  page: z.string().trim().max(420).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
});
