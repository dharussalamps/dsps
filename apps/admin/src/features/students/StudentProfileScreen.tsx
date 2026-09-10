import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, EmptyState, Hero, Icon, type IconName, Screen, ScreenHeader, SectionHeader, SegmentedControl, StatusPill } from '@/components';
import { useCurrentTerm, useStudentMarks, useStudentTermPosition, useStudentTermTrend } from '@/features/marks/hooks';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';
import { setStudentStatus } from './api';
import { ActivitySection } from './ActivitySection';
import { AttendanceAnalysisCard } from './AttendanceAnalysisCard';
import { AttendanceHistoryCalendar } from './AttendanceHistoryCalendar';
import { BenefitsSection } from './BenefitsSection';
import { GuardianCallButton } from './GuardianCallButton';
import { PerformanceTrendChart } from './PerformanceTrendChart';
import { useStudentGuardians, useStudentProfile } from './hooks';

type Route = RouteProp<RootStackParamList, 'StudentProfile'>;
type Tab = 'details' | 'attendance' | 'academic' | 'other';

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'details', label: 'Details', icon: 'person-outline' },
  { key: 'attendance', label: 'Attendance', icon: 'calendar-outline' },
  { key: 'academic', label: 'Academic', icon: 'stats-chart-outline' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];

export function StudentProfileScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<Route>();
  const [tab, setTab] = useState<Tab>('details');
  const profile = useStudentProfile(params.studentId);
  const guardians = useStudentGuardians(params.studentId);
  const marks = useStudentMarks(params.studentId);
  const currentTerm = useCurrentTerm();
  const termPosition = useStudentTermPosition(params.studentId, currentTerm.data?.id);
  const termTrend = useStudentTermTrend(params.studentId);
  const staff = useAuthStore((s) => s.staff);
  const queryClient = useQueryClient();
  const [statusBusy, setStatusBusy] = useState(false);

  if (profile.isLoading) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero>
          <ScreenHeader title="Student" tone="onPrimary" back={navigation.canGoBack()} hideBell />
        </Hero>
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      </Screen>
    );
  }

  if (!profile.data) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero>
          <ScreenHeader title="Student" tone="onPrimary" back={navigation.canGoBack()} hideBell />
        </Hero>
        <View style={{ padding: spacing.lg }}>
          <EmptyState title="Student not found" message="It may be outside what you have access to view." />
        </View>
      </Screen>
    );
  }

  const s = profile.data;
  const displayName = s.preferredName || s.fullName;

  async function toggleLeft() {
    const next = s.status === 'left' ? 'active' : 'left';
    Alert.alert(
      next === 'left' ? 'Mark as left?' : 'Reactivate this student?',
      next === 'left'
        ? `${displayName} will be removed from rosters and counts. All their records are kept.`
        : `${displayName} will reappear on rosters and counts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: next === 'left' ? 'Mark as left' : 'Reactivate',
          style: next === 'left' ? 'destructive' : 'default',
          onPress: () => void doToggleLeft(next),
        },
      ],
    );
  }

  async function doToggleLeft(next: 'active' | 'left') {
    setStatusBusy(true);
    try {
      await setStudentStatus(s.id, next);
      await queryClient.invalidateQueries({ queryKey: ['students'] });
    } catch {
      Alert.alert('Could not update this student', 'You may not have permission to do this.');
    } finally {
      setStatusBusy(false);
    }
  }

  const primaryGuardian = guardians.data ? (guardians.data.find((g) => g.isPrimary) ?? guardians.data[0]) : undefined;

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero>
        <View style={styles.profileRow}>
          {navigation.canGoBack() ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
              onPress={() => navigation.goBack()}
              style={styles.backBtn}
            >
              <Icon name="chevron-back" size={26} color={colors.white} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.heroName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.heroMeta} numberOfLines={1}>
              {s.admissionNo}
              {s.className ? ` · ${s.className}` : ''}
            </Text>
          </View>
          {s.status !== 'active' ? <StatusPill label={s.status === 'left' ? 'Left' : s.status} tone="neutral" /> : null}
          {primaryGuardian ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Call ${primaryGuardian.fullName}`}
              hitSlop={8}
              onPress={() => Linking.openURL(`tel:${primaryGuardian.phonePrimary}`)}
              style={styles.callBtn}
            >
              <Icon name="call" size={20} color={colors.white} />
            </Pressable>
          ) : null}
        </View>

        <SegmentedControl value={tab} onChange={setTab} options={TABS} />
      </Hero>
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>

      {tab === 'details' ? (
      <>
      <Card>
        <SectionHeader icon="information-circle-outline" label="STUDENT INFO" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <InfoTile icon="school-outline" label="Class" value={s.className ?? '—'} />
          <InfoTile icon="calendar-outline" label="Date of birth" value={s.dateOfBirth ?? '—'} />
          <InfoTile icon="male-female-outline" label="Gender" value={s.gender === 'male' ? 'Male' : s.gender === 'female' ? 'Female' : '—'} />
          <InfoTile icon="card-outline" label="Admission no." value={s.admissionNo} />
        </View>
      </Card>

      {guardians.data ? (
        <Card>
          <SectionHeader icon="people-outline" label="GUARDIANS" />
          {guardians.data.length === 0 ? (
            <Text style={{ ...typography.caption, color: semantic.textSecondary, paddingVertical: spacing.xs }}>No guardians on record.</Text>
          ) : null}
          {guardians.data.map((g, i) => (
            <View key={g.guardianId} style={[styles.guardianBlock, i > 0 && styles.guardianBlockDivider]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{g.fullName}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
                    {g.relationship ? <StatusPill label={g.relationship} tone="info" /> : null}
                    {g.isPrimary ? <StatusPill label="Primary" tone="gold" /> : null}
                  </View>
                </View>
                <GuardianCallButton studentId={s.id} guardianId={g.guardianId} phone={g.phonePrimary} />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm }}>
                <InfoTile icon="call-outline" label="Contact" value={g.phonePrimary} />
                <InfoTile icon="mail-outline" label="Email" value={g.email ?? '—'} />
                <InfoTile icon="card-outline" label="NIC number" value={g.nicNumber ?? '—'} />
                <InfoTile icon="briefcase-outline" label="Occupation" value={g.occupation ?? '—'} />
                <InfoTile icon="wallet-outline" label="Economic status" value={g.economicStatus ?? '—'} />
                <InfoTile icon="map-outline" label="GS division" value={g.gsDivision ?? '—'} />
                <InfoTile icon="location-outline" label="Address" value={g.address ?? '—'} wide />
              </View>
            </View>
          ))}
        </Card>
      ) : null}
      </>
      ) : null}

      {tab === 'attendance' ? (
        <>
          <AttendanceAnalysisCard studentId={s.id} />
          <AttendanceHistoryCalendar studentId={s.id} />
        </>
      ) : null}

      {tab === 'academic' && marks.data && marks.data.length > 0 ? (
        <>
          <Card>
            <SectionHeader icon="trending-up-outline" label="PERFORMANCE OVERVIEW" />
            <Text style={{ ...typography.caption, color: semantic.textSecondary, marginTop: -spacing.xs }}>Average score by term</Text>
            {termTrend.data && termTrend.data.length > 0 ? (
              <PerformanceTrendChart points={termTrend.data} />
            ) : null}
          </Card>

          <Card>
            <SectionHeader icon="document-text-outline" label="MARKS BY TERM" />

            {termPosition.data?.avgScore != null ? (
              <View style={styles.statBlock}>
                <View style={{ gap: 2 }}>
                  <Text style={styles.statBlockLabel}>{currentTerm.data?.name ?? 'This term'} average</Text>
                  <Text style={styles.statBlockValue}>{termPosition.data.avgScore}</Text>
                </View>
                {termPosition.data.classPosition ? (
                  <View style={styles.statBlockBadge}>
                    <Icon name="trophy" size={14} color={colors.gold500} />
                    <Text style={styles.statBlockBadgeText}>
                      {ordinal(termPosition.data.classPosition)} of {termPosition.data.classSize}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={{ gap: spacing.lg, marginTop: spacing.sm }}>
              {marks.data.map((term, ti) => (
              <View key={term.termId} style={ti > 0 ? styles.termGroupDivider : undefined}>
                <View style={styles.termHeadingRow}>
                  <View style={styles.termHeadingDot} />
                  <Text style={styles.termHeadingText}>{term.termName}</Text>
                </View>
                <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                  {term.marks.map((m, i) => {
                    const pct = m.score != null && m.maxScore ? Math.min(100, Math.round((m.score / m.maxScore) * 100)) : null;
                    const barColor = pct == null ? semantic.border : pct >= 75 ? colors.success : pct >= 40 ? colors.warning : colors.error;
                    return (
                      <View key={`${m.subjectName}-${i}`} style={{ gap: 4 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                          <Text style={{ ...typography.body, color: semantic.textPrimary, flex: 1 }}>{m.subjectName}</Text>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
                              {m.score ?? '—'} / {m.maxScore}
                            </Text>
                            {m.classAverage != null ? (
                              <Text style={{ ...typography.caption, color: semantic.textSecondary }}>Class avg {m.classAverage}</Text>
                            ) : null}
                          </View>
                        </View>
                        <View style={styles.markBarTrack}>
                          <View style={[styles.markBarFill, { width: `${pct ?? 0}%`, backgroundColor: barColor }]} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
            </View>
          </Card>
        </>
      ) : null}
      {tab === 'academic' && (!marks.data || marks.data.length === 0) ? (
        <EmptyState title="No marks recorded" message="Academic results will appear here once entered." />
      ) : null}

      {tab === 'other' ? (
      <>
      <ActivitySection studentId={s.id} />
      <BenefitsSection studentId={s.id} />

      {staff ? (
        <Card>
          <SectionHeader icon="settings-outline" label="RECORD" />
          <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
            {s.status === 'left'
              ? 'This student is currently marked as left and hidden from rosters and counts.'
              : 'Mark this student as left if they have withdrawn or transferred. All records are kept.'}
          </Text>
          <Button
            label={s.status === 'left' ? 'Reactivate this student' : 'Mark as left'}
            variant={s.status === 'left' ? 'outline' : 'danger'}
            onPress={() => void toggleLeft()}
            loading={statusBusy}
          />
        </Card>
      ) : null}
      </>
      ) : null}
      </View>
    </Screen>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function InfoTile({ icon, label, value, wide }: { icon: IconName; label: string; value: string; wide?: boolean }) {
  return (
    <View style={[styles.infoTile, wide && styles.infoTileWide]}>
      <View style={styles.infoIconChip}>
        <Icon name={icon} size={15} color={semantic.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{label}</Text>
        <Text style={{ ...typography.caption, color: semantic.textPrimary }} numberOfLines={wide ? 2 : 1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroName: { ...typography.title, color: colors.white },
  heroMeta: { ...typography.body, color: colors.cream100 },
  guardianBlock: { paddingVertical: spacing.sm },
  guardianBlockDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: semantic.border, marginTop: spacing.xs },
  infoTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexGrow: 1,
    flexBasis: '45%',
  },
  infoTileWide: { flexBasis: '100%' },
  infoIconChip: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: semantic.primary,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  statBlockLabel: { ...typography.caption, color: colors.cream100 },
  statBlockValue: { ...typography.display, color: colors.white },
  statBlockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  statBlockBadgeText: { ...typography.captionStrong, color: colors.white },
  markBarTrack: { height: 6, borderRadius: radius.pill, backgroundColor: semantic.surfaceAlt, overflow: 'hidden' },
  markBarFill: { height: '100%', borderRadius: radius.pill },
  termGroupDivider: { paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: semantic.border },
  termHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  termHeadingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: semantic.secondary },
  termHeadingText: { ...typography.captionStrong, color: semantic.textSecondary, letterSpacing: 0.4 },
});
