import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { differenceInCalendarDays, endOfMonth, format, isValid, parseISO, startOfMonth, subMonths } from 'date-fns';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, CalendarModal, EmptyState, Hero, HeroDoodle, Icon, Screen, ScreenHeader, StatusPill, TextField } from '@/components';
import { useConfirmDiscardOnLeave } from '@/hooks/useConfirmDiscardOnLeave';
import { formatDMYInput, parseDMY, toDMY } from '@/lib/date';
import { useAuthStore } from '@/store/authStore';
import { colors, elevation, radius, spacing, typography, semantic } from '@/theme/tokens';
import {
  countMonthlyLeaveRequests,
  requestLeave,
  SHORT_LEAVE_KEY,
  SHORT_LEAVE_MONTHLY_CAP,
  withdrawLeave,
  type LeaveBalance,
  type LeaveRequestRow,
  type LeaveType,
} from './api';
import { useLeaveTypes, useMyLeaveBalances, useMyLeaveRequests } from './hooks';

const statusTone: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  withdrawn: 'neutral',
};

/** Requested display order for the leave-type dropdown — not alphabetical. */
const LEAVE_TYPE_DROPDOWN_ORDER = [SHORT_LEAVE_KEY, 'casual', 'medical', 'duty', 'maternity'];

/** A key missing from LEAVE_TYPE_DROPDOWN_ORDER sorts last, not first — plain indexOf would put it first since -1 < every real index. */
function leaveTypeOrderIndex(key: string): number {
  const i = LEAVE_TYPE_DROPDOWN_ORDER.indexOf(key);
  return i === -1 ? LEAVE_TYPE_DROPDOWN_ORDER.length : i;
}

export function MyLeaveScreen() {
  const navigation = useNavigation();
  const staff = useAuthStore((s) => s.staff);
  const queryClient = useQueryClient();
  const leaveTypes = useLeaveTypes();
  const balances = useMyLeaveBalances(staff?.id);
  const requests = useMyLeaveRequests(staff?.id);
  // "Half Day" isn't its own request type — every leave type can be marked
  // half day via the Full day/Half day toggle below, so it's dropped from
  // the picker to avoid a redundant, confusing option.
  const requestableLeaveTypes = (leaveTypes.data ?? [])
    .filter((t) => t.key !== 'half_day')
    .sort((a, b) => leaveTypeOrderIndex(a.key) - leaveTypeOrderIndex(b.key));

  const [showForm, setShowForm] = useState(false);
  const [leaveTypeId, setLeaveTypeId] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useConfirmDiscardOnLeave(showForm && (!!leaveTypeId || !!startsOn.trim() || !!endsOn.trim() || !!reason.trim() || halfDay));

  const selectedBalance = balances.data?.find((b) => b.leaveTypeId === leaveTypeId);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['leave'] });
  }

  async function submitRequest(input: { leaveTypeId: string; startsOn: string; endsOn: string; halfDay: boolean; dayCount: number; reason: string }) {
    setSubmitting(true);
    try {
      await requestLeave(input);
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

  async function submit() {
    setError(null);
    const isoStartsOn = parseDMY(startsOn);
    const isoEndsOn = parseDMY(endsOn || startsOn);
    if (!leaveTypeId || !isoStartsOn || !isoEndsOn || !reason.trim()) {
      setError('Fill in leave type, dates (DD/MM/YYYY) and a reason.');
      return;
    }
    const start = parseISO(isoStartsOn);
    const end = parseISO(isoEndsOn);
    if (!isValid(start) || !isValid(end)) {
      setError('Fill in leave type, dates (DD/MM/YYYY) and a reason.');
      return;
    }
    const dayCount = halfDay ? 0.5 : differenceInCalendarDays(end, start) + 1;
    if (dayCount <= 0) {
      setError('End date must be on or after the start date.');
      return;
    }

    const trimmedReason = reason.trim();
    const selectedType = leaveTypes.data?.find((t) => t.id === leaveTypeId);
    if (selectedType?.key === SHORT_LEAVE_KEY && staff?.id) {
      setSubmitting(true);
      let usedThisMonth: number;
      try {
        usedThisMonth = await countMonthlyLeaveRequests(
          staff.id,
          leaveTypeId,
          format(startOfMonth(start), 'yyyy-MM-dd'),
          format(endOfMonth(start), 'yyyy-MM-dd'),
        );
      } catch {
        setSubmitting(false);
        setError('Could not check this month’s short leave count. Please try again.');
        return;
      }
      setSubmitting(false);

      if (usedThisMonth >= SHORT_LEAVE_MONTHLY_CAP) {
        const casualTypeId = leaveTypes.data?.find((t) => t.key === 'casual')?.id;
        Alert.alert(
          'Monthly short leave limit reached',
          `You've already used your ${SHORT_LEAVE_MONTHLY_CAP} short leaves this month. This request will be submitted as a half-day Casual Leave instead.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Continue',
              onPress: () => {
                if (!casualTypeId) return;
                void submitRequest({ leaveTypeId: casualTypeId, startsOn: isoStartsOn, endsOn: isoEndsOn, halfDay: true, dayCount: 0.5, reason: trimmedReason });
              },
            },
          ],
        );
        return;
      }
    }

    await submitRequest({ leaveTypeId, startsOn: isoStartsOn, endsOn: isoEndsOn, halfDay, dayCount, reason: trimmedReason });
  }

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="airplane-outline" bottomIcon="calendar-outline" />
        <ScreenHeader title="My leave" tone="onPrimary" back={navigation.canGoBack()} />
      </Hero>
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>

      <Button
        label={showForm ? 'Cancel' : 'Request leave'}
        icon={showForm ? 'close' : 'add'}
        variant="secondary"
        onPress={() => setShowForm((v) => !v)}
      />

      {showForm ? (
        <Card>
          <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>LEAVE TYPE</Text>
          <LeaveTypeSelect leaveTypes={requestableLeaveTypes} value={leaveTypeId} onChange={setLeaveTypeId} />
          {selectedBalance ? (
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
              {Math.max(0, selectedBalance.entitled - selectedBalance.used)} remaining this{' '}
              {selectedBalance.leaveTypeKey === SHORT_LEAVE_KEY ? 'month' : 'year'}
            </Text>
          ) : null}

          <View style={{ gap: spacing.sm }}>
            <DateField label="Start date" value={startsOn} onChangeText={(t) => setStartsOn(formatDMYInput(t))} onPickIso={(iso) => setStartsOn(toDMY(iso))} />
            {!halfDay ? (
              <DateField label="End date" value={endsOn} onChangeText={(t) => setEndsOn(formatDMYInput(t))} onPickIso={(iso) => setEndsOn(toDMY(iso))} minDate={parseDMY(startsOn) ?? undefined} />
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <Button label="Full day" size="sm" variant={!halfDay ? 'primary' : 'outline'} onPress={() => setHalfDay(false)} style={{ flex: 1 }} />
            <Button
              label="Half day"
              size="sm"
              variant={halfDay ? 'primary' : 'outline'}
              onPress={() => {
                setHalfDay(true);
                setEndsOn('');
              }}
              style={{ flex: 1 }}
            />
          </View>

          <TextField label="Reason" value={reason} onChangeText={setReason} multiline error={error ?? undefined} />
          <Button label="Submit request" onPress={() => void submit()} loading={submitting} />
        </Card>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>BALANCES</Text>
        {(balances.data ?? []).map((b) => (
          <LeaveBalanceCard key={b.leaveTypeId} balance={b} />
        ))}
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>LEAVE TREND</Text>
        <LeaveTrendCard requests={requests.data ?? []} />
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

/** Leave type picker as a scrollable dropdown sheet, not a button row — there are too many leave types now for a wrapped chip list to stay readable. */
function LeaveTypeSelect({ leaveTypes, value, onChange }: { leaveTypes: LeaveType[]; value: string | null; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = leaveTypes.find((t) => t.id === value);

  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={selectStyles.trigger}>
        <Text style={[selectStyles.triggerLabel, !selected && selectStyles.triggerPlaceholder]} numberOfLines={1}>
          {selected ? selected.name : 'Select leave type'}
        </Text>
        <Icon name="chevron-down" size={16} color={semantic.textSecondary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={selectStyles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={selectStyles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={selectStyles.sheetTitle}>Select leave type</Text>
            <ScrollView style={selectStyles.list}>
              {leaveTypes.map((t) => {
                const isSelected = t.id === value;
                return (
                  <Pressable
                    key={t.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => {
                      onChange(t.id);
                      setOpen(false);
                    }}
                    style={[selectStyles.row, isSelected && selectStyles.rowSelected]}
                  >
                    <Text style={[selectStyles.rowLabel, isSelected && selectStyles.rowLabelSelected]}>{t.name}</Text>
                    {isSelected ? <Icon name="checkmark" size={16} color={semantic.primary} /> : null}
                  </Pressable>
                );
              })}
              {leaveTypes.length === 0 ? <Text style={selectStyles.emptyText}>No leave types configured.</Text> : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/** A typed DD/MM/YYYY field (auto-slashed as digits are entered — see formatDMYInput) paired with a calendar-icon button that opens the shared CalendarModal for visual picking. */
function DateField({
  label,
  value,
  onChangeText,
  onPickIso,
  minDate,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onPickIso: (iso: string) => void;
  minDate?: string;
}) {
  const [open, setOpen] = useState(false);
  const iso = parseDMY(value) ?? undefined;

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs }}>
        <View style={{ flex: 1 }}>
          <TextField label={label} placeholder="DD/MM/YYYY" value={value} onChangeText={onChangeText} keyboardType="number-pad" maxLength={10} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Pick ${label.toLowerCase()}`} onPress={() => setOpen(true)} style={selectStyles.calendarTrigger}>
          <Icon name="calendar-outline" size={18} color={semantic.primary} />
        </Pressable>
      </View>
      <CalendarModal visible={open} value={iso} onChange={onPickIso} onClose={() => setOpen(false)} minDate={minDate} />
    </View>
  );
}

function LeaveBalanceCard({ balance }: { balance: LeaveBalance }) {
  const pct = balance.entitled > 0 ? Math.min(100, Math.round((balance.used / balance.entitled) * 100)) : 0;
  const remaining = Math.max(0, balance.entitled - balance.used);
  const fillColor = pct >= 100 ? colors.error : pct >= 75 ? colors.warning : colors.success;
  const isMonthly = balance.leaveTypeKey === SHORT_LEAVE_KEY;
  const periodWord = isMonthly ? 'month' : 'year';

  return (
    <Card flat style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Text style={{ ...typography.body, color: semantic.textPrimary }}>{balance.leaveTypeName}</Text>
          <StatusPill label={isMonthly ? 'Monthly' : 'Annual'} tone={isMonthly ? 'gold' : 'info'} />
        </View>
        <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
          {balance.used} / {balance.entitled} used
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: fillColor }]} />
      </View>
      <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
        {remaining} remaining this {periodWord}
        {isMonthly ? ' · resets next month' : ''}
      </Text>
    </Card>
  );
}

/** Last 6 calendar months, oldest first, with approved day_count summed per month. startsOn is already an ISO 'yyyy-MM-dd' string, so slicing to 'yyyy-MM' avoids a parse/timezone round trip. */
function buildMonthlyTrend(requests: LeaveRequestRow[]) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const monthDate = subMonths(now, 5 - i);
    return { key: format(monthDate, 'yyyy-MM'), label: format(monthDate, 'MMM'), days: 0 };
  });
  const byKey = new Map(months.map((m) => [m.key, m]));
  for (const r of requests) {
    if (r.status !== 'approved') continue;
    const bucket = byKey.get(r.startsOn.slice(0, 7));
    if (bucket) bucket.days += r.dayCount;
  }
  return months;
}

function LeaveTrendCard({ requests }: { requests: LeaveRequestRow[] }) {
  const months = buildMonthlyTrend(requests);
  const maxDays = Math.max(1, ...months.map((m) => m.days));
  const approvedCount = requests.filter((r) => r.status === 'approved').length;
  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const rejectedCount = requests.filter((r) => r.status === 'rejected').length;

  return (
    <Card flat style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        <TrendStat label="Approved" value={approvedCount} color={colors.success} />
        <TrendStat label="Pending" value={pendingCount} color={colors.warning} />
        <TrendStat label="Rejected" value={rejectedCount} color={colors.error} />
      </View>
      <View style={styles.trendChart}>
        {months.map((m) => (
          <View key={m.key} style={styles.trendColumn}>
            <View style={styles.trendBarTrack}>
              <View style={[styles.trendBar, { height: `${(m.days / maxDays) * 100}%` }]} />
            </View>
            <Text style={styles.trendMonthLabel}>{m.label}</Text>
          </View>
        ))}
      </View>
      <Text style={{ ...typography.caption, color: semantic.textSecondary, textAlign: 'center' }}>
        Approved days taken per month, last 6 months
      </Text>
    </Card>
  );
}

function TrendStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Text style={{ ...typography.subtitle, color }}>{value}</Text>
      <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  progressTrack: { height: 6, borderRadius: radius.pill, backgroundColor: semantic.surfaceAlt, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill },
  trendChart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  trendColumn: { flex: 1, alignItems: 'center', gap: spacing.xs },
  trendBarTrack: { width: 18, height: 60, borderRadius: radius.sm, backgroundColor: semantic.surfaceAlt, justifyContent: 'flex-end', overflow: 'hidden' },
  trendBar: { width: '100%', borderRadius: radius.sm, backgroundColor: semantic.primary },
  trendMonthLabel: { fontSize: 11, color: semantic.textSecondary },
});

const selectStyles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
    paddingHorizontal: spacing.md,
  },
  triggerLabel: { ...typography.body, color: semantic.textPrimary, flex: 1 },
  triggerPlaceholder: { color: colors.ink300 },
  calendarTrigger: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(24,10,13,0.55)', alignItems: 'center', justifyContent: 'center' },
  sheet: { width: 340, maxWidth: '90%', maxHeight: '70%', backgroundColor: semantic.surface, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.sm, ...elevation.raised },
  sheetTitle: { ...typography.title, color: semantic.textPrimary },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: semantic.border },
  rowSelected: { backgroundColor: semantic.primaryMuted, borderRadius: radius.md, paddingHorizontal: spacing.sm },
  rowLabel: { ...typography.body, color: semantic.textPrimary },
  rowLabelSelected: { color: semantic.primary, fontWeight: '700' },
  emptyText: { ...typography.caption, color: semantic.textSecondary, paddingVertical: spacing.md },
});
