import * as Device from 'expo-device';
import { registerOperationHandler } from '@/lib/offline/queue';
import { submitAttendanceOnline } from './api';
import { initRosterCacheSchema } from './rosterCache';
import type { SubmitAttendancePayload } from './schema';

export function deviceId(): string {
  return [Device.modelName, Device.osName, Device.osVersion].filter(Boolean).join(' · ') || 'unknown-device';
}

/** Call once at app start (see App.tsx), before anything tries to mark attendance offline. */
export async function initAttendanceOffline(): Promise<void> {
  await initRosterCacheSchema();

  registerOperationHandler('submit_attendance', async (payload, clientSubmissionId) => {
    const full: SubmitAttendancePayload = {
      ...(payload as Omit<SubmitAttendancePayload, 'client_submission_id'>),
      client_submission_id: clientSubmissionId,
    };
    await submitAttendanceOnline(full);
  });
}
