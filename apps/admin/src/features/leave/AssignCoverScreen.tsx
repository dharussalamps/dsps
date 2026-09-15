import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { addDays, eachDayOfInterval, format, getISODay, parseISO } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Avatar,
  Button,
  Card,
  DateField,
  EmptyState,
  Hero,
  HeroDoodle,
  Icon,
  Screen,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  StatusPill,
  TextField,
  type PillTone,
} from '@/components';
import { useClassesForCurrentYear } from '@/features/academicStructure/hooks';
import { useAcademicYears, useCalendarDaysInRange, useCurrentYearTerms, useWorkingWeekdays } from '@/features/calendar/hooks';
import { YearChip } from '@/features/calendar/YearChip';
import { listStaff, type RoleResponsibility, type StaffSummary } from '@/features/staff/api';
import { useResponsibilitiesForStaff, useRoleResponsibilitiesForStaff } from '@/features/staff/hooks';
import { useConfirmDiscardOnLeave } from '@/hooks/useConfirmDiscardOnLeave';
import { formatDMYInput, parseDMY, toDMY } from '@/lib/date';
import type { RootStackParamList } from '@/navigation/types';
import { colors, radius, spacing, typography, semantic } from '@/theme/tokens';
import { assignCover, type CoverAssignmentRow } from './api';
import { useCoverAssignments, useRemoveCoverAssignment } from './hooks';

type Route = RouteProp<RootStackParamList, 'AssignCover'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Class Teacher/Sectional Head/etc. -> title "Class Teacher" with caption "4B"; whole-school roles need no scope caption. Same mapping as ResponsibilitiesSection's. */
function roleResponsibilityLabel(r: RoleResponsibility): { title: string; caption: string | null } {
  if (r.scopeType === 'school' || r.scopeType === 'self') return { title: r.roleName, caption: null };
  return { title: r.roleName, caption: r.scopeLabel };
}

/** Splits the "Assigned" tab's list into two segments — active/upcoming (still removable) on top, completed (its last day already passed, no longer removable) at the bottom — skipping an empty segment, same as MyLeaveScreen's groupRequestsByStatus. Rows arrive already newest-starts_on-first (see fetchCoverAssignmentsByYear), preserved within each segment. */
function groupCoverAssignmentsByStatus(rows: CoverAssignmentRow[], todayIso: string) {
  const groups: { key: string; label: string; tone: PillTone; items: CoverAssignmentRow[] }[] = [
    { key: 'active', label: 'Active & upcoming', tone: 'success', items: rows.filter((r) => r.endsOn >= todayIso) },
    { key: 'completed', label: 'Completed', tone: 'neutral', items: rows.filter((r) => r.endsOn < todayIso) },
  ];
  return groups.filter((g) => g.items.length > 0);
}

/** Screen #26: "Assign cover teacher" — FR-COV-01, standalone (not only via leave approval). */
export function AssignCoverScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const classes = useClassesForCurrentYear();
  const academicYears = useAcademicYears();

  const [tab, setTab] = useState<'assign' | 'assigned'>('assign');
  // "Assigned" tab is browsed one academic year at a time — defaults to the
  // current year until the user picks a different one.
  const [pickedListYearId, setPickedListYearId] = useState<string | undefined>(undefined);
  const listYearId = pickedListYearId ?? academicYears.data?.find((y) => y.isCurrent)?.id ?? academicYears.data?.[0]?.id;
  const listYear = academicYears.data?.find((y) => y.id === listYearId);
  const coverAssignments = useCoverAssignments(listYear ? { startsOn: listYear.startsOn, endsOn: listYear.endsOn } : undefined);
  const removeCoverAssignmentMutation = useRemoveCoverAssignment();

  const [classId, setClassId] = useState<string | null>(params?.classId ?? null);
  const [staff, setStaff] = useState<StaffSummary | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StaffSummary[]>([]);
  const todayIso = format(new Date(), 'yyyy-MM-dd');
  const todayDMY = format(new Date(), 'dd/MM/yyyy');
  const [startsOn, setStartsOn] = useState(todayDMY);
  const [endsOn, setEndsOn] = useState(todayDMY);
  // Tracks the date the fields were last auto-defaulted to — starts as
  // today, then gets corrected to the next school day once the academic
  // calendar loads (see the effect below). Compared against in the dirty
  // check so opening the screen doesn't itself count as an unsaved change.
  const [defaultDateDMY, setDefaultDateDMY] = useState(todayDMY);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { bypassNextLeave } = useConfirmDiscardOnLeave(!!staff || startsOn !== defaultDateDMY || endsOn !== defaultDateDMY || !!reason.trim());

  const selectedClass = classes.data?.find((c) => c.id === classId) ?? null;

  // Marks the date pickers with the academic calendar so school days vs
  // holidays/closures/non-term/non-working days are visually distinct,
  // same as MyLeaveScreen's date fields.
  const currentYear = academicYears.data?.find((y) => y.isCurrent);
  const calendarDays = useCalendarDaysInRange(currentYear?.startsOn, currentYear?.endsOn);
  const terms = useCurrentYearTerms();
  const workingWeekdays = useWorkingWeekdays();
  const calendarDayByDate = new Map((calendarDays.data ?? []).map((d) => [d.onDate, d.dayType]));

  function dayTone(iso: string): 'school' | 'off' | undefined {
    if (!terms.data || !workingWeekdays.data) return undefined;
    const explicit = calendarDayByDate.get(iso);
    if (explicit === 'holiday' || explicit === 'closure') return 'off';
    if (explicit) return 'school';
    const inTerm = terms.data.some((t) => iso >= t.startsOn && iso <= t.endsOn);
    if (!inTerm) return 'off';
    return workingWeekdays.data.includes(getISODay(parseISO(iso))) ? 'school' : 'off';
  }

  // Defaults Start/End to today — but if today isn't a school day, rolls
  // forward to the next one instead. Runs once the calendar has loaded
  // enough to tell, and only while the user hasn't touched either field yet
  // (userEditedDates); re-runs as the calendar query resolves so an initial
  // guess can still be corrected once real data arrives.
  const userEditedDates = useRef(false);
  useEffect(() => {
    if (userEditedDates.current || !terms.data || !workingWeekdays.data) return;
    let candidateIso = todayIso;
    for (let i = 0; i < 60 && dayTone(candidateIso) !== 'school'; i++) {
      candidateIso = format(addDays(parseISO(candidateIso), 1), 'yyyy-MM-dd');
    }
    const dmy = toDMY(candidateIso);
    if (dmy === defaultDateDMY) return;
    setDefaultDateDMY(dmy);
    setStartsOn(dmy);
    setEndsOn(dmy);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run as the calendar data itself resolves, not on every render (dayTone/defaultDateDMY are read from the latest closure).
  }, [terms.data, workingWeekdays.data, calendarDays.data]);

  // Picking/typing a new start date moves the end date to match it too —
  // the common case is a single-day cover — leaving End date editable
  // afterward on its own without further syncing.
  function handleStartDateChange(newStartsOn: string) {
    userEditedDates.current = true;
    setStartsOn(newStartsOn);
    setEndsOn(newStartsOn);
  }

  function handleEndDateChange(newEndsOn: string) {
    userEditedDates.current = true;
    setEndsOn(newEndsOn);
  }

  // Live count of school days actually covered by the picked range, mirroring
  // MyLeaveScreen's preview — weekends/holidays inside a multi-day range
  // don't add up to a cover day.
  const schoolDayCount = (() => {
    const parsedStart = parseDMY(startsOn);
    const parsedEnd = parseDMY(endsOn || startsOn);
    if (!parsedStart || !parsedEnd || parsedEnd < parsedStart || !terms.data || !workingWeekdays.data) return null;
    return eachDayOfInterval({ start: parseISO(parsedStart), end: parseISO(parsedEnd) }).filter(
      (d) => dayTone(format(d, 'yyyy-MM-dd')) === 'school',
    ).length;
  })();

  // Shown once a cover candidate is selected, so the person assigning cover
  // can see what that teacher is already responsible for before handing
  // them another class.
  const roleResponsibilities = useRoleResponsibilitiesForStaff(staff?.id);
  const responsibilities = useResponsibilitiesForStaff(staff?.id);

  function clearStaff() {
    setStaff(null);
    setQuery('');
    setResults([]);
  }

  async function search(q: string) {
    setQuery(q);
    setResults(q.trim() ? await listStaff(q) : []);
  }

  async function save() {
    if (!classId || !staff || !startsOn.trim() || !endsOn.trim()) return;
    const isoStartsOn = parseDMY(startsOn);
    const isoEndsOn = parseDMY(endsOn);
    if (!isoStartsOn || !isoEndsOn) {
      setError('Enter both dates as DD/MM/YYYY.');
      return;
    }
    if (isoEndsOn < isoStartsOn) {
      setError('End date must be on or after the start date.');
      return;
    }
    if (!terms.data || !workingWeekdays.data) {
      setError('Still loading the academic calendar — try again in a moment.');
      return;
    }
    if (dayTone(isoStartsOn) === 'off' || dayTone(isoEndsOn) === 'off') {
      setError('Pick school days only — cover can\'t start or end on a holiday or non-school day.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await assignCover({ classId, staffId: staff.id, startsOn: isoStartsOn, endsOn: isoEndsOn, reason: reason.trim() || undefined });
      // Skips useConfirmDiscardOnLeave's own "Discard changes?" prompt for
      // this goBack() — the staff/date fields are still non-empty at this
      // point (their state hasn't re-rendered yet), but the assignment
      // already saved, so there's nothing to warn about discarding.
      bypassNextLeave();
      navigation.goBack();
    } catch {
      setError('Could not assign cover. You may not have permission over this class.');
    } finally {
      setBusy(false);
    }
  }

  const readyToAssign = !!classId && !!staff && !!startsOn.trim() && !!endsOn.trim();

  function confirmAssign() {
    if (!selectedClass || !staff) return;
    const dateNote = startsOn === endsOn ? startsOn : `${startsOn} → ${endsOn}`;
    Alert.alert(
      'Assign this cover teacher?',
      `${staff.fullName} will be given class-teacher rights over ${selectedClass.name} for ${dateNote}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Assign', onPress: () => void save() },
      ],
    );
  }

  function confirmRemoveCover(row: CoverAssignmentRow) {
    const dateNote = row.startsOn === row.endsOn ? toDMY(row.startsOn) : `${toDMY(row.startsOn)} → ${toDMY(row.endsOn)}`;
    Alert.alert(
      'Remove this cover assignment?',
      `${row.staffName} will no longer have cover rights over ${row.className} for ${dateNote}. They'll be notified.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            removeCoverAssignmentMutation.mutate(row.id, {
              onError: () => Alert.alert('Could not remove this cover assignment', 'You may not have permission over this class.'),
            });
          },
        },
      ],
    );
  }

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="airplane-outline" bottomIcon="calendar-outline" />
        <ScreenHeader
          title="Assign cover teacher"
          subtitle={
            tab === 'assign'
              ? selectedClass
                ? `Covering ${selectedClass.name}`
                : 'Set class teacher for a date range'
              : 'Cover assignments by academic year'
          }
          tone="onPrimary"
          back={navigation.canGoBack()}
          hideBell
        />
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { key: 'assign', label: 'Assign', icon: 'add-circle-outline' },
            { key: 'assigned', label: 'Assigned', icon: 'people-outline' },
          ]}
        />
        {tab === 'assigned' && academicYears.data && academicYears.data.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {academicYears.data.map((y) => (
              <YearChip key={y.id} year={y} active={y.id === listYearId} onPress={() => setPickedListYearId(y.id)} />
            ))}
          </ScrollView>
        ) : null}
      </Hero>
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>

      {tab === 'assigned' ? (
        coverAssignments.isLoading ? (
          <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
        ) : coverAssignments.data && coverAssignments.data.length > 0 ? (
          groupCoverAssignmentsByStatus(coverAssignments.data, todayIso).map((group) => (
            <View key={group.key} style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <StatusPill label={group.label} tone={group.tone} />
                <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{group.items.length}</Text>
              </View>
              {group.items.map((row) => {
                const removing = removeCoverAssignmentMutation.isPending && removeCoverAssignmentMutation.variables === row.id;
                const dateNote = row.startsOn === row.endsOn ? toDMY(row.startsOn) : `${toDMY(row.startsOn)} → ${toDMY(row.endsOn)}`;
                // A completed cover period (its last day already passed) can
                // no longer be removed — only today's or a future assignment can.
                const completed = row.endsOn < todayIso;
                return (
                  <Card key={row.id} style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Avatar name={row.staffName} size={36} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }} numberOfLines={1}>{row.staffName}</Text>
                        <Text style={{ ...typography.caption, color: semantic.textSecondary }} numberOfLines={1}>Covering {row.className}</Text>
                      </View>
                      {completed ? (
                        <View style={styles.lockIconBtn}>
                          <Icon name="lock-closed-outline" size={14} color={semantic.textSecondary} />
                        </View>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${row.staffName}'s cover of ${row.className}`}
                          hitSlop={8}
                          disabled={removing}
                          onPress={() => confirmRemoveCover(row)}
                          style={styles.removeIconBtn}
                        >
                          {removing ? <ActivityIndicator size="small" color={colors.error} /> : <Icon name="trash-outline" size={15} color={colors.error} />}
                        </Pressable>
                      )}
                    </View>
                    <View style={styles.summaryRow}>
                      <Icon name="calendar-outline" size={14} color={semantic.textSecondary} />
                      <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{dateNote}</Text>
                    </View>
                    {row.reason ? (
                      <View style={styles.summaryRow}>
                        <Icon name="chatbox-ellipses-outline" size={14} color={semantic.textSecondary} />
                        <Text style={{ ...typography.caption, color: semantic.textSecondary }} numberOfLines={1}>{row.reason}</Text>
                      </View>
                    ) : null}
                    <View style={styles.summaryRow}>
                      <Icon name="person-circle-outline" size={14} color={semantic.textSecondary} />
                      <Text style={{ ...typography.caption, color: semantic.textSecondary }} numberOfLines={1}>Assigned by {row.assignedByName}</Text>
                    </View>
                  </Card>
                );
              })}
            </View>
          ))
        ) : (
          <EmptyState
            icon="calendar-outline"
            title="No cover assignments"
            message={listYear ? `No cover assignments recorded for ${listYear.label}.` : 'Assignments you create in the Assign tab will show up here.'}
          />
        )
      ) : (
        <>

      <Card>
        <SectionHeader icon="school-outline" label="SELECT CLASS" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs }}>
          {(classes.data ?? []).map((c) => (
            <Button
              key={c.id}
              label={c.name}
              size="sm"
              icon={classId === c.id ? 'checkmark-circle' : undefined}
              variant={classId === c.id ? 'primary' : 'outline'}
              onPress={() => setClassId(c.id)}
            />
          ))}
          {classes.data && classes.data.length === 0 ? (
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>No classes set up for this year yet.</Text>
          ) : null}
        </View>
        {selectedClass ? (
          <View style={styles.classInfoRow}>
            <Icon name="person-circle-outline" size={15} color={semantic.textSecondary} />
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
              Regular class teacher: {selectedClass.classTeacherName ?? 'Not assigned'}
            </Text>
          </View>
        ) : null}
      </Card>

      <Card>
        <SectionHeader icon="person-add-outline" label="COVER TEACHER" />

        {staff ? (
          <View style={styles.selectedTeacherRow}>
            <Avatar name={staff.fullName} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{staff.fullName}</Text>
              <Text style={{ ...typography.caption, color: semantic.textSecondary }}>Staff No. {staff.staffNo}</Text>
            </View>
            <Button label="Change" size="sm" variant="ghost" icon="swap-horizontal-outline" onPress={clearStaff} />
          </View>
        ) : (
          <>
            <TextField
              placeholder="Search by name or staff no."
              value={query}
              onChangeText={(v) => void search(v)}
              onClear={query ? () => { setQuery(''); setResults([]); } : undefined}
            />
            {query ? (
              <View style={{ gap: spacing.xs }}>
                {results.map((s) => (
                  <Card key={s.id} flat onPress={() => { setStaff(s); setQuery(s.fullName); }} style={styles.resultRow}>
                    <Avatar name={s.fullName} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ ...typography.body, color: semantic.textPrimary }}>{s.fullName}</Text>
                      <Text style={{ ...typography.caption, color: semantic.textSecondary }}>Staff No. {s.staffNo}</Text>
                    </View>
                    <Icon name="chevron-forward" size={16} color={semantic.textSecondary} />
                  </Card>
                ))}
                {results.length === 0 ? (
                  <Text style={{ ...typography.caption, color: semantic.textSecondary }}>No staff matched &quot;{query}&quot;.</Text>
                ) : null}
              </View>
            ) : null}
          </>
        )}

        {staff ? (
          <View style={{ gap: spacing.xs }}>
            <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>CURRENT RESPONSIBILITIES</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {roleResponsibilities.data?.map((r) => {
                const { title, caption } = roleResponsibilityLabel(r);
                return <StatusPill key={r.id} label={caption ? `${title} · ${caption}` : title} tone="gold" />;
              })}
              {responsibilities.data?.map((r) => (
                <StatusPill key={r.id} label={r.title} tone="neutral" />
              ))}
              {roleResponsibilities.data?.length === 0 && responsibilities.data?.length === 0 ? (
                <Text style={{ ...typography.caption, color: semantic.textSecondary }}>No responsibilities on record.</Text>
              ) : null}
            </View>
          </View>
        ) : null}
      </Card>

      <Card>
        <SectionHeader icon="calendar-outline" label="COVER PERIOD" />
        <DateField
          label="Starts on"
          value={startsOn}
          onChangeText={(t) => handleStartDateChange(formatDMYInput(t))}
          onPickIso={(iso) => handleStartDateChange(toDMY(iso))}
          dayTone={dayTone}
          blockOffDays
        />
        <DateField
          label="Ends on"
          value={endsOn}
          onChangeText={(t) => handleEndDateChange(formatDMYInput(t))}
          onPickIso={(iso) => handleEndDateChange(toDMY(iso))}
          minDate={parseDMY(startsOn) ?? undefined}
          dayTone={dayTone}
          blockOffDays
        />
        {schoolDayCount != null ? (
          <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
            {schoolDayCount} school day{schoolDayCount === 1 ? '' : 's'} in this cover period.
          </Text>
        ) : null}
      </Card>

      <Card>
        <SectionHeader icon="chatbox-ellipses-outline" label="REASON (OPTIONAL)" />
        <TextField placeholder="e.g. Attending a workshop" value={reason} onChangeText={setReason} />
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <SectionHeader icon="checkmark-done-outline" label="REVIEW & ASSIGN" />
        <View style={styles.summaryRow}>
          <Icon name="school-outline" size={16} color={semantic.textSecondary} />
          <Text style={styles.summaryText}>{selectedClass ? selectedClass.name : 'Select a class above'}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Icon name="person-outline" size={16} color={semantic.textSecondary} />
          <Text style={styles.summaryText}>{staff ? staff.fullName : 'Select a cover teacher above'}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Icon name="calendar-outline" size={16} color={semantic.textSecondary} />
          <Text style={styles.summaryText}>
            {startsOn && endsOn ? (startsOn === endsOn ? startsOn : `${startsOn} → ${endsOn}`) : 'Pick cover dates above'}
          </Text>
        </View>

        {error ? (
          <View style={styles.errorRow}>
            <Icon name="alert-circle-outline" size={16} color={colors.error} />
            <Text style={{ ...typography.caption, color: colors.error, flex: 1 }}>{error}</Text>
          </View>
        ) : null}

        <Button label="Assign cover" icon="checkmark-circle-outline" onPress={confirmAssign} loading={busy} disabled={!readyToAssign} />
      </Card>
        </>
      )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  classInfoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  selectedTeacherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: semantic.primaryMuted,
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
  removeIconBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.errorBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIconBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: semantic.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  summaryText: { ...typography.body, color: semantic.textPrimary, flex: 1 },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorBg,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
});
