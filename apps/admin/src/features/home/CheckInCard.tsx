import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text } from 'react-native';
import { Button, Card, StatusPill } from '@/components';
import { checkInSelf, fetchMyAttendanceToday } from '@/features/attendance/api';
import { todayIso } from '@/features/attendance/hooks';
import { typography, semantic } from '@/theme/tokens';

/** section 15 open decision #1: self check-in, shown on Home so it's the first thing a staff member does each day. */
export function CheckInCard({ staffId }: { staffId: string }) {
  const onDate = todayIso();
  const queryClient = useQueryClient();
  const [checkingIn, setCheckingIn] = useState(false);

  const mine = useQuery({
    queryKey: ['attendance', 'my-attendance', staffId, onDate],
    queryFn: () => fetchMyAttendanceToday(staffId, onDate),
  });

  if (mine.isLoading || mine.data) {
    return mine.data ? (
      <Card flat>
        <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
          Checked in
          {mine.data.checkedInAt ? ` at ${new Date(mine.data.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
        </Text>
        <StatusPill label={mine.data.status} tone={mine.data.status === 'late' ? 'warning' : 'success'} />
      </Card>
    ) : null;
  }

  async function submit() {
    setCheckingIn(true);
    try {
      await checkInSelf();
      await queryClient.invalidateQueries({ queryKey: ['attendance', 'my-attendance'] });
    } finally {
      setCheckingIn(false);
    }
  }

  return (
    <Card style={{ borderColor: semantic.secondary, borderWidth: 1.5 }}>
      <Text style={{ ...typography.subtitle, color: semantic.textPrimary }}>You haven&apos;t checked in today</Text>
      <Button label="Check in" onPress={() => void submit()} loading={checkingIn} />
    </Card>
  );
}
