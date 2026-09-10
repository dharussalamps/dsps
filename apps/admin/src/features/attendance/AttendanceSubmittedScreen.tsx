import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, Card, EmptyState, Hero, Icon, Screen, ScreenHeader, SyncStatusBadge } from '@/components';
import { GuardianCallButton } from '@/features/students/GuardianCallButton';
import type { RootStackParamList } from '@/navigation/types';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';
import { fetchPrimaryGuardianPhones } from './api';
import { todayIso, useClassName, useExistingSubmission } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'AttendanceSubmitted'>;

export function AttendanceSubmittedScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { classId, onDate, localAbsentees } = params;

  const className = useClassName(classId);
  const existing = useExistingSubmission(classId, onDate);

  // Server-confirmed list (with consecutive-day counts) once it's available;
  // until then, fall back to what the teacher just marked locally so the
  // screen never looks empty right after an offline submit.
  const absentees =
    existing.data?.absentees ??
    (localAbsentees ?? []).map((a) => ({ studentId: a.studentId, fullName: a.fullName, consecutiveAbsences: null as number | null }));

  const studentIds = absentees.map((a) => a.studentId);
  const guardianPhones = useQuery({
    queryKey: ['attendance', 'guardian-phones', studentIds],
    queryFn: () => fetchPrimaryGuardianPhones(studentIds),
    enabled: studentIds.length > 0,
  });

  const showEmptyState = absentees.length === 0 && !existing.data && localAbsentees == null;
  const isToday = onDate === todayIso();

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero>
        <ScreenHeader
          title={className.data ? `Absentees · ${className.data}` : 'Absentees'}
          subtitle={isToday ? 'Today' : format(parseISO(onDate), 'EEEE, d MMMM yyyy')}
          tone="onPrimary"
          back={navigation.canGoBack()}
          hideBell
        >
          <SyncStatusBadge />
        </ScreenHeader>
        {absentees.length > 0 ? <SummaryStats count={absentees.length} /> : null}
      </Hero>

      <FadeInBody>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {showEmptyState ? (
            <EmptyState title="No submission found" message="This class may not have been submitted for this date yet." />
          ) : absentees.length === 0 ? (
            <FullAttendanceCard />
          ) : (
            <View style={{ gap: spacing.sm }}>
              {absentees.map((a) => {
                const phone = guardianPhones.data?.[a.studentId];
                return (
                  <Card key={a.studentId} flat style={styles.row}>
                    <Avatar name={a.fullName} size={38} />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={styles.rowName}>{a.fullName}</Text>
                      {a.consecutiveAbsences != null && a.consecutiveAbsences > 1 ? (
                        <View style={styles.streak}>
                          <Icon name="alert-circle-outline" size={13} color={colors.warning} />
                          <Text style={styles.streakText}>{a.consecutiveAbsences} days in a row</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      {phone ? <GuardianCallButton studentId={a.studentId} phone={phone} /> : null}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`View ${a.fullName}'s profile`}
                        hitSlop={8}
                        onPress={() => navigation.navigate('StudentProfile', { studentId: a.studentId })}
                        style={styles.viewButton}
                      >
                        <Icon name="chevron-forward" size={18} color={semantic.textSecondary} />
                      </Pressable>
                    </View>
                  </Card>
                );
              })}
            </View>
          )}
        </ScrollView>
      </FadeInBody>
    </Screen>
  );
}

/** Fades the body in once on mount — same light touch used by MarkAttendanceScreen. */
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

/** Count of absentees for onDate — a slim pill in the same style as EarlyLeaveScreen's SummaryStats, so the Hero carries the count consistently across attendance screens. */
function SummaryStats({ count }: { count: number }) {
  return (
    <View style={styles.summaryChip} accessible accessibilityLabel={`${count} ${count === 1 ? 'student' : 'students'} absent`}>
      <Icon name="close-circle-outline" size={14} color={colors.error} />
      <Text style={styles.summaryChipText}>{count} {count === 1 ? 'student' : 'students'} absent</Text>
    </View>
  );
}

function FullAttendanceCard() {
  return (
    <Card style={styles.heroCard}>
      <View style={[styles.heroIconWrap, { backgroundColor: colors.successBg }]}>
        <Icon name="ribbon-outline" size={26} color={colors.success} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.heroCount, { color: colors.success, fontSize: 20 }]}>Full attendance</Text>
        <Text style={styles.heroLabel}>Every student was marked present for this date.</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: spacing.lg, gap: spacing.lg },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.errorBg,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  summaryChipText: { ...typography.captionStrong, color: colors.error },
  heroCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIconWrap: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  heroCount: { ...typography.title, color: semantic.textPrimary },
  heroLabel: { ...typography.caption, color: semantic.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
  rowName: { ...typography.body, color: semantic.textPrimary },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  streakText: { ...typography.caption, color: colors.warning },
  viewButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
