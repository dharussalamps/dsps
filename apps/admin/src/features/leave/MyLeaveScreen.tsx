import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { differenceInCalendarDays, isValid, parseISO } from 'date-fns';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, EmptyState, Hero, Screen, ScreenHeader, StatusPill, TextField } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { spacing, typography, semantic } from '@/theme/tokens';
import { requestLeave, withdrawLeave } from './api';
import { useLeaveTypes, useMyLeaveBalances, useMyLeaveRequests } from './hooks';

const statusTone: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  withdrawn: 'neutral',
};

export function MyLeaveScreen() {
  const navigation = useNavigation();
  const staff = useAuthStore((s) => s.staff);
  const queryClient = useQueryClient();
  const leaveTypes = useLeaveTypes();
  const balances = useMyLeaveBalances(staff?.id);
  const requests = useMyLeaveRequests(staff?.id);

  const [showForm, setShowForm] = useState(false);
  const [leaveTypeId, setLeaveTypeId] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['leave'] });
  }

  async function submit() {
    setError(null);
    const start = parseISO(startsOn);
    const end = parseISO(endsOn || startsOn);
    if (!leaveTypeId || !isValid(start) || !isValid(end) || !reason.trim()) {
      setError('Fill in leave type, dates (YYYY-MM-DD) and a reason.');
      return;
    }
    const dayCount = halfDay ? 0.5 : differenceInCalendarDays(end, start) + 1;
    if (dayCount <= 0) {
      setError('End date must be on or after the start date.');
      return;
    }
    setSubmitting(true);
    try {
      await requestLeave({ leaveTypeId, startsOn, endsOn: endsOn || startsOn, halfDay, dayCount, reason: reason.trim() });
      setShowForm(false);
      setLeaveTypeId(null);
      setStartsOn('');
      setEndsOn('');
      setHalfDay(false);
      setReason('');
      await invalidate();
    } catch {
      setError('Could not submit this request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero>
        <ScreenHeader title="My leave" tone="onPrimary" back={navigation.canGoBack()}>
          <Button label={showForm ? 'Cancel' : 'Request leave'} icon={showForm ? 'close' : 'add'} size="sm" variant="secondary" onPress={() => setShowForm((v) => !v)} />
        </ScreenHeader>
      </Hero>
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>

      {showForm ? (
        <Card>
          <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>LEAVE TYPE</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {(leaveTypes.data ?? []).map((lt) => (
              <Button
                key={lt.id}
                label={lt.name}
                size="sm"
                variant={leaveTypeId === lt.id ? 'primary' : 'outline'}
                onPress={() => setLeaveTypeId(lt.id)}
              />
            ))}
          </View>
          <TextField label="Start date" placeholder="YYYY-MM-DD" value={startsOn} onChangeText={setStartsOn} />
          <TextField label="End date (leave blank for one day)" placeholder="YYYY-MM-DD" value={endsOn} onChangeText={setEndsOn} />
          <Button
            label={halfDay ? 'Half day' : 'Mark as half day'}
            icon={halfDay ? 'checkmark' : undefined}
            variant="ghost"
            size="sm"
            onPress={() => setHalfDay((v) => !v)}
          />
          <TextField label="Reason" value={reason} onChangeText={setReason} multiline error={error ?? undefined} />
          <Button label="Submit request" onPress={() => void submit()} loading={submitting} />
        </Card>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>BALANCES</Text>
        {(balances.data ?? []).map((b) => (
          <Card key={b.leaveTypeId} flat>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ ...typography.body, color: semantic.textPrimary }}>{b.leaveTypeName}</Text>
              <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
                {b.used} / {b.entitled} used
              </Text>
            </View>
          </Card>
        ))}
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>HISTORY</Text>
        {requests.data && requests.data.length > 0 ? (
          requests.data.map((r) => (
            <Card key={r.id} flat>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ gap: 2, flex: 1 }}>
                  <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
                    {r.leaveTypeName} · {r.dayCount}d
                  </Text>
                  <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
                    {r.startsOn} → {r.endsOn}
                  </Text>
                  <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{r.reason}</Text>
                </View>
                <StatusPill label={r.status} tone={statusTone[r.status]} />
              </View>
              {r.status === 'pending' ? (
                <Button
                  label="Withdraw"
                  size="sm"
                  variant="ghost"
                  onPress={() => void withdrawLeave(r.id).then(invalidate)}
                />
              ) : null}
            </Card>
          ))
        ) : (
          <EmptyState title="No leave requests yet" />
        )}
      </View>
      </View>
    </Screen>
  );
}
