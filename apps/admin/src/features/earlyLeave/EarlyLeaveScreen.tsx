import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Animated, FlatList, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, Card, EmptyState, Hero, HeroDoodle, Icon, Screen, ScreenHeader, TextField } from '@/components';
import { useIsPrincipal } from '@/features/accounts/hooks';
import { todayIso, useAttendanceEditable, useClassName } from '@/features/attendance/hooks';
import { useStudentsInClass } from '@/features/students/hooks';
import { useConfirmDiscardOnLeave } from '@/hooks/useConfirmDiscardOnLeave';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';
import { listEarlyLeavesToday, recordEarlyLeave, type EarlyLeaveRecord } from './api';

type Route = RouteProp<RootStackParamList, 'EarlyLeave'>;

/**
 * A departure can be recorded for any date, not just today — but an old
 * date only while its class attendance is unlocked (a principal's reopen),
 * same gate as editing the attendance itself. Today is the one exception:
 * it's always recordable regardless of whether today's attendance happens
 * to be locked, since an early leave is its own event, not an attendance
 * correction.
 */
export function EarlyLeaveScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<Route>();
  const classId = params.classId;
  const onDate = params.onDate ?? todayIso();
  const isToday = onDate === todayIso();
  const isPrincipal = useIsPrincipal();
  const staff = useAuthStore((s) => s.staff);
  const className = useClassName(classId);

  const editable = useAttendanceEditable(classId, onDate);
  const canRecord = isToday || (editable.data ?? true);

  const roster = useStudentsInClass(classId);
  const queryClient = useQueryClient();

  const studentIds = (roster.data ?? []).map((s) => s.id);
  const recorded = useQuery({
    queryKey: ['early-leaves', classId, onDate],
    queryFn: () => listEarlyLeavesToday(studentIds, onDate),
    enabled: studentIds.length > 0,
  });

  const [openStudentId, setOpenStudentId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [collectedBy, setCollectedBy] = useState('');
  const [saving, setSaving] = useState(false);

  useConfirmDiscardOnLeave(openStudentId != null && (!!reason.trim() || !!collectedBy.trim()));

  const recordByStudent = new Map((recorded.data ?? []).map((r) => [r.studentId, r]));
  const totalCount = roster.data?.length ?? 0;
  const leftCount = recordByStudent.size;
  const showLockedBanner = !isToday && !editable.isLoading && !canRecord;

  async function submit(studentId: string) {
    if (!staff) return;
    setSaving(true);
    try {
      await recordEarlyLeave({
        studentId,
        onDate,
        leftAt: format(new Date(), 'HH:mm'),
        reason,
        collectedBy,
        recordedBy: staff.id,
      });
      setOpenStudentId(null);
      setReason('');
      setCollectedBy('');
      // Prefix-only key: also covers MarkAttendanceScreen's
      // ['early-leaves', 'today', classId, onDate] cache entry, which
      // otherwise stays stale after recording a departure here.
      await queryClient.invalidateQueries({ queryKey: ['early-leaves'] });
    } catch {
      Alert.alert('Could not record departure', 'Something went wrong — try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="walk-outline" bottomIcon="time-outline" />
        <ScreenHeader
          title={className.data ? `Early leave · ${className.data}` : 'Early leave'}
          subtitle={isToday ? 'Today' : format(parseISO(onDate), 'EEEE, d MMMM yyyy')}
          tone="onPrimary"
          back={navigation.canGoBack()}
          hideBell
        />
        {totalCount > 0 ? <SummaryStats left={leftCount} /> : null}
      </Hero>
      <FadeInBody>
        <FlatList
          data={roster.data ?? []}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl }}
          ListHeaderComponent={
            showLockedBanner ? (
              <View style={styles.lockedBanner}>
                <View style={styles.lockedIconWrap}>
                  <Icon name="lock-closed" size={15} color={colors.warning} />
                </View>
                <Text style={styles.lockedBannerText}>
                  {isPrincipal
                    ? "This date's attendance is locked — reopen it from Mark attendance to record an early leave here."
                    : "This date's attendance is locked — ask a principal to reopen it before recording an early leave."}
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            roster.isLoading ? (
              <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
            ) : (
              <EmptyState title="No students in this class" message="Nobody is enrolled here yet." />
            )
          }
          renderItem={({ item, index }) => {
            const record = recordByStudent.get(item.id);
            const open = openStudentId === item.id;
            return (
              <Card style={styles.row}>
                <View style={styles.rowHeader}>
                  <Avatar name={item.preferredName || item.fullName} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.preferredName || item.fullName}</Text>
                    <Text style={styles.rollCaption}>#{index + 1}</Text>
                  </View>
                  {record ? (
                    <View style={styles.leftBadge}>
                      <Icon name="exit-outline" size={13} color={colors.info} />
                      <Text style={styles.leftBadgeText}>Left {record.leftAt}</Text>
                    </View>
                  ) : canRecord ? (
                    <Button
                      label={open ? 'Cancel' : 'Record'}
                      size="sm"
                      variant={open ? 'ghost' : 'outline'}
                      icon={open ? 'close' : 'exit-outline'}
                      onPress={() => setOpenStudentId(open ? null : item.id)}
                    />
                  ) : (
                    <View style={styles.lockedTag}>
                      <Icon name="lock-closed-outline" size={13} color={semantic.textSecondary} />
                      <Text style={styles.lockedTagText}>Locked</Text>
                    </View>
                  )}
                </View>

                {record && (record.reason || record.collectedBy) ? (
                  <RecordDetail record={record} />
                ) : null}

                {open ? (
                  <View style={styles.form}>
                    <TextField
                      label="Reason"
                      placeholder="e.g. Doctor's appointment"
                      value={reason}
                      onChangeText={setReason}
                    />
                    <TextField
                      label="Collected by"
                      placeholder="e.g. Parent's name"
                      value={collectedBy}
                      onChangeText={setCollectedBy}
                    />
                    <Button
                      label="Confirm departure now"
                      icon="checkmark-done-outline"
                      onPress={() => void submit(item.id)}
                      loading={saving}
                    />
                  </View>
                ) : null}
              </Card>
            );
          }}
        />
      </FadeInBody>
    </Screen>
  );
}

/** Fades the whole scrollable body in once, on first mount — same light "latest UI" touch used by MarkAttendanceScreen/MarkStaffAttendanceScreen. */
function FadeInBody({ children }: { children: ReactNode }) {
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 320, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fade in once, not on every re-render.
  }, []);
  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** Count of departures recorded for onDate — a slim pill in the same style as the other status chips Hero already carries (SchoolDayPill etc.), not a full card. */
function SummaryStats({ left }: { left: number }) {
  return (
    <View style={styles.summaryChip} accessible accessibilityLabel={`${left} ${left === 1 ? 'student' : 'students'} left today`}>
      <Icon name="exit-outline" size={14} color={colors.info} />
      <Text style={styles.summaryChipText}>{left} {left === 1 ? 'student' : 'students'} left</Text>
    </View>
  );
}

/** Reason/collected-by detail for an already-recorded departure, tucked under the row header in a tinted strip so it reads as supplementary rather than competing with the name. */
function RecordDetail({ record }: { record: EarlyLeaveRecord }) {
  return (
    <View style={styles.detailBox}>
      {record.reason ? (
        <View style={styles.detailRow}>
          <Icon name="chatbox-ellipses-outline" size={13} color={semantic.textSecondary} />
          <Text style={styles.detailText}>{record.reason}</Text>
        </View>
      ) : null}
      {record.collectedBy ? (
        <View style={styles.detailRow}>
          <Icon name="person-outline" size={13} color={semantic.textSecondary} />
          <Text style={styles.detailText}>Collected by {record.collectedBy}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.infoBg,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  summaryChipText: { ...typography.captionStrong, color: colors.info },
  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningBg,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  lockedIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  lockedBannerText: { ...typography.caption, color: colors.warning, flex: 1 },
  row: { gap: spacing.sm, paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...typography.body, color: semantic.textPrimary },
  rollCaption: { ...typography.caption, color: semantic.textSecondary },
  leftBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.infoBg,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  leftBadgeText: { ...typography.captionStrong, color: colors.info },
  lockedTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lockedTagText: { ...typography.caption, color: semantic.textSecondary },
  detailBox: {
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 4,
    marginLeft: 42,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  detailText: { ...typography.caption, color: semantic.textSecondary, flex: 1 },
  form: {
    gap: spacing.sm,
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
