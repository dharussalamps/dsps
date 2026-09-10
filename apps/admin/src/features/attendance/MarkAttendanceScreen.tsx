import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Button, EmptyState, Hero, Screen, ScreenHeader, SyncStatusBadge } from '@/components';
import { enqueueOperation } from '@/lib/offline/queue';
import type { RootStackParamList } from '@/navigation/types';
import { colors, semantic, spacing, typography } from '@/theme/tokens';
import { fetchRosterForCaching } from './api';
import { deviceId } from './init';
import { cacheRoster, getCachedRoster, type CachedRosterStudent } from './rosterCache';
import type { AttendanceEntry } from './schema';
import { StatusToggle } from './StatusToggle';
import { todayIso } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'MarkAttendance'>;

type MarkState = Record<string, { status: AttendanceEntry['status']; reason?: string }>;

export function MarkAttendanceScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const classId = params.classId;
  const onDate = todayIso();

  const [roster, setRoster] = useState<CachedRosterStudent[] | null>(null);
  const [marks, setMarks] = useState<MarkState>({});
  const [submitting, setSubmitting] = useState(false);

  // Cache-first: the marking screen must open offline (section 9, rule 4).
  // Show whatever's cached instantly, then refresh from the network if
  // available and re-cache for next time.
  useEffect(() => {
    let cancelled = false;

    getCachedRoster(classId).then((cached) => {
      if (!cancelled && cached.length > 0) {
        setRoster(cached);
        setMarks((prev) => (Object.keys(prev).length ? prev : defaultAllPresent(cached)));
      }
    });

    fetchRosterForCaching(classId)
      .then(async (fresh) => {
        if (cancelled || fresh.length === 0) return;
        await cacheRoster(classId, fresh);
        setRoster(fresh);
        setMarks((prev) => (Object.keys(prev).length ? prev : defaultAllPresent(fresh)));
      })
      .catch(() => {
        // Offline or RLS-denied — the cached roster (if any) already covers this.
      });

    return () => {
      cancelled = true;
    };
  }, [classId]);

  const setStatus = useCallback((studentId: string, status: AttendanceEntry['status']) => {
    setMarks((prev) => ({ ...prev, [studentId]: { ...prev[studentId], status } }));
  }, []);

  const absentCount = useMemo(() => Object.values(marks).filter((m) => m.status === 'absent').length, [marks]);
  const lateCount = useMemo(() => Object.values(marks).filter((m) => m.status === 'late').length, [marks]);

  async function submit() {
    if (!roster || roster.length === 0 || submitting) return;
    setSubmitting(true);

    const entries: AttendanceEntry[] = roster.map((s) => ({
      student_id: s.id,
      status: marks[s.id]?.status ?? 'present',
      reason: marks[s.id]?.reason,
    }));

    await enqueueOperation('submit_attendance', {
      class_id: classId,
      on_date: onDate,
      entries,
      device_id: deviceId(),
    });

    setSubmitting(false);

    const localAbsentees = roster
      .filter((s) => marks[s.id]?.status === 'absent')
      .map((s) => ({ studentId: s.id, fullName: s.preferredName || s.fullName }));

    navigation.replace('AttendanceSubmitted', { classId, onDate, localAbsentees });
  }

  if (roster === null) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero>
          <ScreenHeader title="Mark attendance" tone="onPrimary" back={navigation.canGoBack()} />
        </Hero>
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      </Screen>
    );
  }

  if (roster.length === 0) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero>
          <ScreenHeader title="Mark attendance" tone="onPrimary" back={navigation.canGoBack()} />
        </Hero>
        <View style={{ padding: spacing.lg }}>
          <EmptyState title="No cached roster" message="Connect to the internet once to load this class, then marking works offline." />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero>
        <ScreenHeader title="Mark attendance" tone="onPrimary" back={navigation.canGoBack()}>
          <SyncStatusBadge />
        </ScreenHeader>
        <Text style={{ ...typography.caption, color: colors.cream100 }}>
          {roster.length} students · every student starts marked present
        </Text>
      </Hero>

      <FlatList
        data={roster}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 120 }}
        renderItem={({ item }) => (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: semantic.surface,
              borderRadius: 12,
              padding: spacing.md,
              borderWidth: 1,
              borderColor: semantic.border,
            }}
          >
            <View style={{ flex: 1, marginRight: spacing.md }}>
              <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
                {item.preferredName || item.fullName}
              </Text>
              {item.rollNo ? (
                <Text style={{ ...typography.caption, color: semantic.textSecondary }}>Roll {item.rollNo}</Text>
              ) : null}
            </View>
            <StatusToggle value={marks[item.id]?.status ?? 'present'} onChange={(status) => setStatus(item.id, status)} />
          </View>
        )}
      />

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: spacing.lg,
          backgroundColor: semantic.surface,
          borderTopWidth: 1,
          borderTopColor: semantic.border,
        }}
      >
        <Button
          label={`Submit${absentCount || lateCount ? ` — ${absentCount} absent, ${lateCount} late` : ''}`}
          onPress={() => void submit()}
          loading={submitting}
        />
      </View>
    </Screen>
  );
}

function defaultAllPresent(roster: CachedRosterStudent[]): MarkState {
  const state: MarkState = {};
  for (const s of roster) state[s.id] = { status: 'present' };
  return state;
}
