import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, differenceInCalendarDays, eachDayOfInterval, endOfMonth, format, getISODay, isValid, parseISO, startOfMonth, subMonths } from 'date-fns';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, CalendarModal, EmptyState, Hero, HeroDoodle, Icon, Screen, ScreenHeader, SectionHeader, StatusPill, TextField, type IconName } from '@/components';
import { useAcademicYears, useCalendarDaysInRange, useCurrentYearTerms, useWorkingWeekdays } from '@/features/calendar/hooks';
import { useConfirmDiscardOnLeave } from '@/hooks/useConfirmDiscardOnLeave';
import { formatDMYInput, parseDMY, toDMY } from '@/lib/date';
import { useAuthStore } from '@/store/authStore';
import { colors, elevation, radius, spacing, typography, semantic } from '@/theme/tokens';
import {
  addSchoolDays,
  countMonthlyLeaveRequests,
  extendMaternityLeave,
  MATERNITY_KEY,
  MATERNITY_PHASE_AFTER,
  MATERNITY_PHASE_DAYS,
  MATERNITY_PHASE_LABEL,
  requestLeave,
  SHORT_LEAVE_KEY,
  SHORT_LEAVE_MONTHLY_CAP,
  withdrawLeave,
  type LeaveBalance,
  type LeaveRequestRow,
  type LeaveType,
  type MaternityChainTip,
} from './api';
import { useLeaveTypes, useMaternityChainTip, useMyLeaveBalances, useMyLeaveRequests } from './hooks';

const statusTone: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  withdrawn: 'neutral',
};

const statusAccentColor: Record<string, string> = {
  pending: colors.warning,
  approved: colors.success,
  rejected: colors.error,
  withdrawn: colors.ink300,
};

/** Requested display order for the leave-type dropdown — not alphabetical. */
const LEAVE_TYPE_DROPDOWN_ORDER = [SHORT_LEAVE_KEY, 'casual', 'medical', 'duty', 'maternity'];

/** A key missing from LEAVE_TYPE_DROPDOWN_ORDER sorts last, not first — plain indexOf would put it first since -1 < every real index. */
function leaveTypeOrderIndex(key: string): number {
  const i = LEAVE_TYPE_DROPDOWN_ORDER.indexOf(key);
  return i === -1 ? LEAVE_TYPE_DROPDOWN_ORDER.length : i;
}

const LEAVE_TYPE_ICON: Record<string, IconName> = {
  [SHORT_LEAVE_KEY]: 'flash-outline',
  casual: 'sunny-outline',
  medical: 'medkit-outline',
  duty: 'briefcase-outline',
  [MATERNITY_KEY]: 'heart-outline',
};
function leaveTypeIcon(key: string | undefined): IconName {
  return (key && LEAVE_TYPE_ICON[key]) || 'document-text-outline';
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
  const pendingCount = (requests.data ?? []).filter((r) => r.status === 'pending').length;
  const approvedCount = (requests.data ?? []).filter((r) => r.status === 'approved').length;
  // Annual leave left this year = remaining Casual + remaining Medical —
  // the two balances that actually run on an annual cycle (short leave is
  // monthly, so it's excluded from this figure).
  const annualLeaveLeft = (balances.data ?? [])
    .filter((b) => b.leaveTypeKey === 'casual' || b.leaveTypeKey === 'medical')
    .reduce((sum, b) => sum + Math.max(0, b.entitled - b.used), 0);

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
  const selectedTypeKey = leaveTypes.data?.find((t) => t.id === leaveTypeId)?.key;
  const isShortLeaveSelected = selectedTypeKey === SHORT_LEAVE_KEY;
  const isMaternitySelected = selectedTypeKey === MATERNITY_KEY;
  // Short/casual/medical leave stand in for a school day the staff member
  // would otherwise have been at school for — duty and maternity leave
  // aren't tied to the school calendar the same way, so they're the only
  // exemptions. Defaults to restricted (true) before any type is picked —
  // the Start/End fields already render at that point, so leaving this
  // false until a type is chosen would let a Saturday slip through for the
  // brief window before the user picks anything.
  const requiresSchoolDay = selectedTypeKey !== 'duty' && selectedTypeKey !== MATERNITY_KEY;
  const todayIso = format(new Date(), 'yyyy-MM-dd');

  const maternityChainTip = useMaternityChainTip(staff?.id);

  // Live preview of maternity leave's computed end date — 84 school days
  // from the picked start, worked out server-side (add_school_days) since
  // the span can cross months the client's academic-calendar fetch
  // doesn't cover.
  const maternityStartIso = isMaternitySelected ? parseDMY(startsOn) : null;
  const maternityPreview = useQuery({
    queryKey: ['leave', 'maternity-preview', maternityStartIso],
    queryFn: () => addSchoolDays(maternityStartIso as string, MATERNITY_PHASE_DAYS),
    enabled: !!maternityStartIso,
  });

  // Marks the date pickers with the academic calendar: which days are
  // school days vs holidays/closures/non-term/non-working days, so a
  // staff member can see that context while picking a leave date.
  const academicYears = useAcademicYears();
  const currentYear = academicYears.data?.find((y) => y.isCurrent);
  const calendarDays = useCalendarDaysInRange(currentYear?.startsOn, currentYear?.endsOn);
  const terms = useCurrentYearTerms();
  const workingWeekdays = useWorkingWeekdays();
  const calendarDayByDate = new Map((calendarDays.data ?? []).map((d) => [d.onDate, d.dayType]));

  function dayTone(iso: string): 'school' | 'off' | undefined {
    if (!terms.data || !workingWeekdays.data) return undefined;
    const explicit = calendarDayByDate.get(iso);
    if (explicit === 'holiday' || explicit === 'closure') return 'off';
    if (explicit) return 'school'; // half_day, exam still count as a school day
    const inTerm = terms.data.some((t) => iso >= t.startsOn && iso <= t.endsOn);
    if (!inTerm) return 'off';
    return workingWeekdays.data.includes(getISODay(parseISO(iso))) ? 'school' : 'off';
  }

  // Casual/medical leave is only charged for school days actually missed
  // within the picked range — shown here so the count matches what
  // actually gets submitted, before the user taps Submit.
  const isCasualOrMedicalSelected = selectedTypeKey === 'casual' || selectedTypeKey === 'medical';
  const schoolDayPreview = (() => {
    if (!isCasualOrMedicalSelected || halfDay || !terms.data || !workingWeekdays.data) return null;
    const parsedStart = parseDMY(startsOn);
    const parsedEnd = parseDMY(endsOn || startsOn);
    if (!parsedStart || !parsedEnd || parsedEnd < parsedStart) return null;
    return eachDayOfInterval({ start: parseISO(parsedStart), end: parseISO(parsedEnd) }).filter(
      (d) => dayTone(format(d, 'yyyy-MM-dd')) === 'school',
    ).length;
  })();

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['leave'] });
  }

  async function submitRequest(input: {
    staffId: string;
    leaveTypeId: string;
    startsOn: string;
    endsOn: string;
    halfDay: boolean;
    dayCount: number;
    reason: string;
    maternityPhase?: 'paid' | 'half_pay' | 'no_pay';
  }) {
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

  function handleLeaveTypeChange(id: string) {
    setLeaveTypeId(id);
    // Date fields default to today — but only when still empty, so this
    // never clobbers a date the user already typed.
    const type = leaveTypes.data?.find((t) => t.id === id);
    const todayDMY = format(new Date(), 'dd/MM/yyyy');
    if (!startsOn.trim()) setStartsOn(todayDMY);
    if (type?.key !== SHORT_LEAVE_KEY && !endsOn.trim()) setEndsOn(todayDMY);
  }

  // Picking/typing a new start date moves the end date to match it too —
  // the common case is a single-day request, so this saves re-entering the
  // same date twice. The user can still edit End date afterward on its own;
  // nothing keeps re-syncing it once they do.
  function handleStartDateChange(newStartsOn: string) {
    setStartsOn(newStartsOn);
    setEndsOn(newStartsOn);
  }

  async function submit() {
    setError(null);
    if (!staff?.id || !leaveTypeId || !reason.trim()) {
      setError('Select a leave type and enter a reason.');
      return;
    }
    const trimmedReason = reason.trim();
    const selectedType = leaveTypes.data?.find((t) => t.id === leaveTypeId);
    const isShortLeave = selectedType?.key === SHORT_LEAVE_KEY;
    const isMaternity = selectedType?.key === MATERNITY_KEY;
    const isSchoolDayCounted = selectedType?.key === 'casual' || selectedType?.key === 'medical';
    const needsSchoolDay = isShortLeave || isSchoolDayCounted;

    if (needsSchoolDay && (!terms.data || !workingWeekdays.data)) {
      setError('Still loading the academic calendar — try again in a moment.');
      return;
    }

    let isoStartsOn: string;
    let isoEndsOn: string;

    if (isMaternity) {
      // Maternity leave is a single start date — the system computes 84
      // school days forward for the end date, no End date field at all.
      const parsedDate = parseDMY(startsOn);
      if (!parsedDate || !isValid(parseISO(parsedDate))) {
        setError('Pick a start date and enter a reason.');
        return;
      }
      setSubmitting(true);
      try {
        isoEndsOn = await addSchoolDays(parsedDate, MATERNITY_PHASE_DAYS);
      } catch {
        setSubmitting(false);
        setError('Could not work out the maternity leave period. Please try again.');
        return;
      }
      setSubmitting(false);
      isoStartsOn = parsedDate;
    } else if (isShortLeave) {
      // Short leave is a single day, no half-day choice — just one date field (startsOn).
      const parsedDate = parseDMY(startsOn);
      if (!parsedDate || !isValid(parseISO(parsedDate))) {
        setError('Pick a date (DD/MM/YYYY) and enter a reason.');
        return;
      }
      isoStartsOn = parsedDate;
      isoEndsOn = parsedDate;
    } else {
      const parsedStart = parseDMY(startsOn);
      const parsedEnd = parseDMY(endsOn || startsOn);
      if (!parsedStart || !parsedEnd || !isValid(parseISO(parsedStart)) || !isValid(parseISO(parsedEnd))) {
        setError('Fill in leave type, dates (DD/MM/YYYY) and a reason.');
        return;
      }
      if (parsedEnd < parsedStart) {
        setError('End date must be on or after the start date.');
        return;
      }
      isoStartsOn = parsedStart;
      isoEndsOn = parsedEnd;
    }

    if (isoStartsOn < todayIso) {
      setError('Start date cannot be before today.');
      return;
    }

    if (needsSchoolDay && (dayTone(isoStartsOn) === 'off' || dayTone(isoEndsOn) === 'off')) {
      setError('Pick a school day — this leave type cannot start or end on a holiday or non-school day.');
      return;
    }

    // Casual/medical leave is charged only for the school days actually
    // missed within the range — a weekend or holiday inside a multi-day
    // request doesn't count against the balance. Short leave is always a
    // single day, maternity is always 84; every other type counts every
    // calendar day in the range.
    let dayCount: number;
    if (isMaternity) {
      dayCount = MATERNITY_PHASE_DAYS;
    } else if (isShortLeave) {
      dayCount = 1;
    } else if (halfDay) {
      dayCount = 0.5;
    } else if (isSchoolDayCounted) {
      dayCount = eachDayOfInterval({ start: parseISO(isoStartsOn), end: parseISO(isoEndsOn) }).filter(
        (d) => dayTone(format(d, 'yyyy-MM-dd')) === 'school',
      ).length;
    } else {
      dayCount = differenceInCalendarDays(parseISO(isoEndsOn), parseISO(isoStartsOn)) + 1;
    }
    if (dayCount <= 0) {
      setError('This date range has no school days to request.');
      return;
    }

    // Casual/medical draw down a real entitled balance — block a request
    // nobody has allocated any days for, and block one that would push
    // used (approved + already-pending) past what's entitled. Short leave,
    // duty and maternity aren't balance-limited this way (see
    // BALANCE_TRACKED_KEYS in api.ts and LeaveAllocationScreen's
    // allocatable types) — maternity's 84/84/84 days are a fixed system
    // rule, not an admin-set entitlement.
    const isBalanceLimited = selectedType?.key === 'casual' || selectedType?.key === 'medical';
    if (isBalanceLimited) {
      const bal = balances.data?.find((b) => b.leaveTypeId === leaveTypeId);
      if (!bal || bal.entitled <= 0) {
        setError(`No ${selectedType?.name ?? 'leave'} balance has been allocated for you — ask the principal to set one in Leave Allocation.`);
        return;
      }
      if (bal.used + dayCount > bal.entitled) {
        const remaining = Math.max(0, bal.entitled - bal.used);
        setError(`This request needs ${dayCount} day${dayCount === 1 ? '' : 's'}, but only ${remaining} remain${remaining === 1 ? 's' : ''} in your ${bal.leaveTypeName} balance.`);
        return;
      }
    }

    // A pending or approved request already covering any of these dates —
    // requesting the same day twice (of any leave type) isn't meaningful.
    const overlapping = (requests.data ?? []).find(
      (r) => (r.status === 'pending' || r.status === 'approved') && isoStartsOn <= r.endsOn && r.startsOn <= isoEndsOn,
    );
    if (overlapping) {
      setError(`You already have a ${overlapping.status} ${overlapping.leaveTypeName} request covering this date.`);
      return;
    }

    if (isShortLeave && staff?.id) {
      setSubmitting(true);
      let usedThisMonth: number;
      try {
        usedThisMonth = await countMonthlyLeaveRequests(
          staff.id,
          leaveTypeId,
          format(startOfMonth(parseISO(isoStartsOn)), 'yyyy-MM-dd'),
          format(endOfMonth(parseISO(isoStartsOn)), 'yyyy-MM-dd'),
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
                void submitRequest({ staffId: staff.id, leaveTypeId: casualTypeId, startsOn: isoStartsOn, endsOn: isoEndsOn, halfDay: true, dayCount: 0.5, reason: trimmedReason });
              },
            },
          ],
        );
        return;
      }
    }

    await submitRequest({
      staffId: staff.id,
      leaveTypeId,
      startsOn: isoStartsOn,
      endsOn: isoEndsOn,
      halfDay: isShortLeave || isMaternity ? false : halfDay,
      dayCount,
      reason: trimmedReason,
      maternityPhase: isMaternity ? 'paid' : undefined,
    });
  }

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="airplane-outline" bottomIcon="calendar-outline" />
        <ScreenHeader title="Request leave" tone="onPrimary" back={navigation.canGoBack()} />
        <View style={heroStyles.statsRow}>
          <HeroStat value={pendingCount} label="Pending" />
          <View style={heroStyles.statDivider} />
          <HeroStat value={approvedCount} label="Approved" />
          <View style={heroStyles.statDivider} />
          <HeroStat value={annualLeaveLeft} label="Leave left" />
        </View>
      </Hero>
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>

      <Button
        label={showForm ? 'Cancel' : 'Request'}
        icon={showForm ? 'close' : 'add'}
        variant="secondary"
        onPress={() => setShowForm((v) => !v)}
      />

      {showForm ? (
        <Card>
          <SectionHeader icon="add-circle-outline" label="NEW REQUEST" />
          <LeaveTypeSelect leaveTypes={requestableLeaveTypes} value={leaveTypeId} onChange={handleLeaveTypeChange} />
          {selectedBalance ? (
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
              {Math.max(0, selectedBalance.entitled - selectedBalance.used)} remaining this{' '}
              {selectedBalance.leaveTypeKey === SHORT_LEAVE_KEY ? 'month' : 'year'}
            </Text>
          ) : null}

          {isShortLeaveSelected ? (
            <DateField
              label="Date"
              value={startsOn}
              onChangeText={(t) => setStartsOn(formatDMYInput(t))}
              onPickIso={(iso) => setStartsOn(toDMY(iso))}
              minDate={todayIso}
              dayTone={dayTone}
              blockOffDays={requiresSchoolDay}
            />
          ) : isMaternitySelected ? (
            <>
              <DateField
                label="Start date"
                value={startsOn}
                onChangeText={(t) => setStartsOn(formatDMYInput(t))}
                onPickIso={(iso) => setStartsOn(toDMY(iso))}
                minDate={todayIso}
              />
              {maternityStartIso ? (
                <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
                  {maternityPreview.isLoading
                    ? 'Working out the leave period…'
                    : maternityPreview.data
                      ? `Paid maternity leave: ${startsOn} → ${toDMY(maternityPreview.data)} (${MATERNITY_PHASE_DAYS} school days)`
                      : 'Could not work out the leave period — try a different date.'}
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <View style={{ gap: spacing.sm }}>
                <DateField
                  label="Start date"
                  value={startsOn}
                  onChangeText={(t) => handleStartDateChange(formatDMYInput(t))}
                  onPickIso={(iso) => handleStartDateChange(toDMY(iso))}
                  minDate={todayIso}
                  dayTone={dayTone}
                  blockOffDays={requiresSchoolDay}
                />
                {!halfDay ? (
                  <DateField
                    label="End date"
                    value={endsOn}
                    onChangeText={(t) => setEndsOn(formatDMYInput(t))}
                    onPickIso={(iso) => setEndsOn(toDMY(iso))}
                    minDate={parseDMY(startsOn) ?? todayIso}
                    dayTone={dayTone}
                    blockOffDays={requiresSchoolDay}
                  />
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

              {schoolDayPreview != null ? (
                <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
                  {schoolDayPreview} school {schoolDayPreview === 1 ? 'day' : 'days'} in this range — weekends and holidays aren&apos;t counted.
                </Text>
              ) : null}
            </>
          )}

          <TextField label="Reason" value={reason} onChangeText={setReason} multiline error={error ?? undefined} />
          <Button label="Submit request" onPress={() => void submit()} loading={submitting} />
        </Card>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <SectionHeader icon="wallet-outline" label="BALANCES" />
        {(balances.data ?? []).map((b) => (
          <LeaveBalanceCard key={b.leaveTypeId} balance={b} />
        ))}
      </View>

      {maternityChainTip.data ? (
        <View style={{ gap: spacing.sm }}>
          <SectionHeader icon="heart-outline" label="MATERNITY LEAVE" />
          <MaternityChainCard tip={maternityChainTip.data} staffId={staff?.id} onExtended={invalidate} />
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <SectionHeader icon="trending-up-outline" label="LEAVE TREND" />
        <LeaveTrendCard requests={requests.data ?? []} />
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionHeader icon="time-outline" label="HISTORY" />
        {requests.data && requests.data.length > 0 ? (
          groupRequestsByStatus(requests.data).map((group) => (
            <View key={group.status} style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <StatusPill label={group.status} tone={statusTone[group.status]} />
                <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{group.items.length}</Text>
              </View>
              {group.items.map((r) => (
                <HistoryRow key={r.id} request={r} onWithdrawn={invalidate} />
              ))}
            </View>
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
        {selected ? (
          <View style={selectStyles.triggerIconWrap}>
            <Icon name={leaveTypeIcon(selected.key)} size={15} color={semantic.primary} />
          </View>
        ) : null}
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
                    <View style={[selectStyles.rowIconWrap, isSelected && selectStyles.rowIconWrapSelected]}>
                      <Icon name={leaveTypeIcon(t.key)} size={16} color={isSelected ? colors.white : semantic.primary} />
                    </View>
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
  dayTone,
  blockOffDays,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onPickIso: (iso: string) => void;
  minDate?: string;
  dayTone?: (iso: string) => 'school' | 'off' | undefined;
  blockOffDays?: boolean;
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
      <CalendarModal visible={open} value={iso} onChange={onPickIso} onClose={() => setOpen(false)} minDate={minDate} dayTone={dayTone} blockOffDays={blockOffDays} />
    </View>
  );
}

/** Shows where a staff member's maternity leave chain currently stands, and — if it hasn't reached its terminal phase — an action to request the next one. Dates are entirely system-computed; nothing here is typed by the user. */
function MaternityChainCard({ tip, staffId, onExtended }: { tip: MaternityChainTip; staffId: string | undefined; onExtended: () => Promise<void> }) {
  const [extending, setExtending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextPhase = MATERNITY_PHASE_AFTER[tip.phase];
  const nextStartsOn = addDays(parseISO(tip.endsOn), 1);
  const nextEndsOn = addDays(nextStartsOn, MATERNITY_PHASE_DAYS - 1);

  async function extend() {
    if (!staffId || !nextPhase) return;
    setError(null);
    setExtending(true);
    try {
      await extendMaternityLeave({ staffId, tip, reason: `${MATERNITY_PHASE_LABEL[nextPhase]} extension` });
      await onExtended();
    } catch {
      setError('Could not submit this extension. Please try again.');
    } finally {
      setExtending(false);
    }
  }

  function confirmExtend() {
    if (!nextPhase) return;
    Alert.alert(
      `Extend as ${MATERNITY_PHASE_LABEL[nextPhase]}?`,
      `This requests ${format(nextStartsOn, 'd MMM yyyy')} → ${format(nextEndsOn, 'd MMM yyyy')} (${MATERNITY_PHASE_DAYS} days) as ${MATERNITY_PHASE_LABEL[nextPhase]}. It still needs the principal's approval, same as any other leave request.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Request extension', onPress: () => void extend() },
      ],
    );
  }

  return (
    <Card flat style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={styles.balanceIconWrap}>
            <Icon name="heart-outline" size={16} color={semantic.primary} />
          </View>
          <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{MATERNITY_PHASE_LABEL[tip.phase]}</Text>
        </View>
        <StatusPill label="Approved" tone="success" />
      </View>
      <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
        {tip.startsOn} → {tip.endsOn}
      </Text>
      {nextPhase ? (
        <Button label={`Extend as ${MATERNITY_PHASE_LABEL[nextPhase]}`} size="sm" onPress={confirmExtend} loading={extending} />
      ) : (
        <Text style={{ ...typography.caption, color: semantic.textSecondary }}>No further extension available.</Text>
      )}
      {error ? <Text style={{ ...typography.caption, color: colors.error }}>{error}</Text> : null}
    </Card>
  );
}

/** Compact single-row layout — the status is already conveyed by which group header the row sits under (see groupRequestsByStatus), so it isn't repeated per-row here as it once was. */
function HistoryRow({ request, onWithdrawn }: { request: LeaveRequestRow; onWithdrawn: () => Promise<void> }) {
  const typeLabel = request.maternityPhase ? `${request.leaveTypeName} — ${MATERNITY_PHASE_LABEL[request.maternityPhase]}` : request.leaveTypeName;

  return (
    <Card flat style={styles.historyCard}>
      <View style={[styles.historyAccent, { backgroundColor: statusAccentColor[request.status] }]} />
      <View style={styles.historyIconWrap}>
        <Icon name={leaveTypeIcon(request.leaveTypeKey)} size={14} color={semantic.primary} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }} numberOfLines={1}>
          {typeLabel} · {request.dayCount}d
        </Text>
        <Text style={{ ...typography.caption, color: semantic.textSecondary }} numberOfLines={1}>
          {request.startsOn} → {request.endsOn}
        </Text>
        <Text style={{ ...typography.caption, color: semantic.textSecondary }} numberOfLines={1}>
          {request.reason}
        </Text>
      </View>
      {request.status === 'pending' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Withdraw request"
          onPress={() => void withdrawLeave(request.id).then(onWithdrawn)}
          hitSlop={8}
          style={({ pressed }) => [styles.withdrawChip, pressed && styles.withdrawChipPressed]}
        >
          <Icon name="close-circle-outline" size={13} color={colors.error} />
          <Text style={styles.withdrawChipLabel}>Withdraw</Text>
        </Pressable>
      ) : null}
    </Card>
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
          <View style={styles.balanceIconWrap}>
            <Icon name={leaveTypeIcon(balance.leaveTypeKey)} size={16} color={semantic.primary} />
          </View>
          <View style={{ gap: 2, flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Text style={{ ...typography.body, color: semantic.textPrimary }}>{balance.leaveTypeName}</Text>
              <StatusPill label={isMonthly ? 'Monthly' : 'Annual'} tone={isMonthly ? 'gold' : 'info'} />
            </View>
          </View>
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

/** Buckets history rows by status — pending first (needs attention), then approved, withdrawn, rejected — skipping any bucket with nothing in it, so an empty Rejected group never shows up for a staff member who's never been rejected. */
function groupRequestsByStatus(requests: LeaveRequestRow[]) {
  const order: LeaveRequestRow['status'][] = ['pending', 'approved', 'withdrawn', 'rejected'];
  return order
    .map((status) => ({ status, items: requests.filter((r) => r.status === status) }))
    .filter((group) => group.items.length > 0);
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

function HeroStat({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={heroStyles.stat}>
      <Text style={heroStyles.statValue}>{value}</Text>
      <Text style={heroStyles.statLabel}>{label}</Text>
    </View>
  );
}

const heroStyles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.25)' },
  statValue: { ...typography.subtitle, color: colors.white },
  statLabel: { ...typography.caption, color: colors.cream100 },
});

const styles = StyleSheet.create({
  progressTrack: { height: 6, borderRadius: radius.pill, backgroundColor: semantic.surfaceAlt, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill },
  balanceIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, overflow: 'hidden', padding: spacing.sm },
  historyAccent: { width: 3, alignSelf: 'stretch', borderRadius: radius.pill },
  historyIconWrap: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  withdrawChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.errorBg,
  },
  withdrawChipPressed: { opacity: 0.7 },
  withdrawChipLabel: { ...typography.caption, color: colors.error, fontWeight: '700' },
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
  triggerIconWrap: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semantic.border,
  },
  rowSelected: { backgroundColor: semantic.primaryMuted, borderRadius: radius.md, paddingHorizontal: spacing.sm },
  rowIconWrap: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconWrapSelected: { backgroundColor: semantic.primary },
  rowLabel: { ...typography.body, color: semantic.textPrimary, flex: 1 },
  rowLabelSelected: { color: semantic.primary, fontWeight: '700' },
  emptyText: { ...typography.caption, color: semantic.textSecondary, paddingVertical: spacing.md },
});
