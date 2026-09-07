import { z } from 'zod';

/**
 * Mirrors backend/supabase/functions/submit-attendance/index.ts's
 * payloadSchema by hand. Kept in two places rather than one shared file
 * because the client (Metro) and the Edge Function (Deno) don't share a
 * module resolution story in this repo — see docs/AdminSpec.md section 17.
 * If you change one, change the other.
 */
export const attendanceEntrySchema = z.object({
  student_id: z.string().uuid(),
  status: z.enum(['present', 'absent', 'late']),
  reason: z.string().trim().min(1).max(500).optional(),
});

export const submitAttendancePayloadSchema = z.object({
  class_id: z.string().uuid(),
  on_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entries: z.array(attendanceEntrySchema).min(1),
  device_id: z.string().max(200).optional(),
  client_submission_id: z.string().uuid(),
});

export type AttendanceEntry = z.infer<typeof attendanceEntrySchema>;
export type SubmitAttendancePayload = z.infer<typeof submitAttendancePayloadSchema>;
