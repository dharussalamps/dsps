import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { Button, EmptyState, Hero, HeroDoodle, Icon, Screen, ScreenHeader, StatusPill, TextField, type PillTone } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';
import { fetchMarksForSheet, getOrCreateMarkSheet, saveMark, submitMarkSheet, type MarkSheetInfo } from './api';
import { useMarkEntryContext } from './hooks';

type Route = RouteProp<RootStackParamList, 'MarkEntry'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const statusTone: Record<string, PillTone> = { draft: 'gold', submitted: 'success', reopened: 'warning' };

type ScoreState = 'success' | 'warning' | 'error' | 'neutral';
const scoreAccent: Record<ScoreState, string> = { success: colors.success, warning: colors.warning, error: colors.error, neutral: colors.ink300 };
const scoreBorder: Record<ScoreState, string> = { success: colors.success, warning: colors.warning, error: colors.error, neutral: semantic.border };

function scoreState(value: string, maxScore: number): ScoreState {
  if (value.trim() === '' || !maxScore) return 'neutral';
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return 'neutral';
  const pct = (parsed / maxScore) * 100;
  return pct >= 75 ? 'success' : pct >= 40 ? 'warning' : 'error';
}

export function MarkEntryScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { params } = useRoute<Route>();
  const { classId, subjectId, termId } = params;
  const staff = useAuthStore((s) => s.staff);
  const context = useMarkEntryContext(classId, subjectId, termId);

  const [sheet, setSheet] = useState<MarkSheetInfo | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [admissionNos, setAdmissionNos] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimeout.current) clearTimeout(savedTimeout.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await getOrCreateMarkSheet(classId, subjectId, termId);
      if (cancelled) return;
      setSheet(s);
      const rows = await fetchMarksForSheet(s.id, classId);
      if (cancelled) return;
      const scoreMap: Record<string, string> = {};
      const nameMap: Record<string, string> = {};
      const admissionMap: Record<string, string> = {};
      for (const r of rows) {
        scoreMap[r.studentId] = r.score != null ? String(r.score) : '';
        nameMap[r.studentId] = r.fullName;
        admissionMap[r.studentId] = r.admissionNo;
      }
      setScores(scoreMap);
      setNames(nameMap);
      setAdmissionNos(admissionMap);
      setOrder(rows.map((r) => r.studentId));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [classId, subjectId, termId]);

  const isDraft = sheet?.status === 'draft';
  const enteredCount = order.filter((id) => (scores[id] ?? '').trim() !== '').length;
  const notEnteredCount = order.length - enteredCount;
  const progressPct = order.length > 0 ? Math.round((enteredCount / order.length) * 100) : 0;

  /**
   * ExamMarksScreen/ExamsScreen stay mounted underneath this one (native-stack
   * doesn't unmount a screen just because another was pushed on top of it),
   * so their react-query caches never see this write unless explicitly
   * invalidated here — otherwise going back shows stale marks/progress.
   */
  async function saveOne(studentId: string, value: string) {
    if (!sheet || !staff) return;
    const parsed = value.trim() === '' ? null : Number(value);
    if (parsed != null && (Number.isNaN(parsed) || parsed < 0 || parsed > sheet.maxScore)) return;
    await saveMark(sheet.id, studentId, parsed, staff.id);
    void queryClient.invalidateQueries({ queryKey: ['exams', 'marks', sheet.id] });
    void queryClient.invalidateQueries({ queryKey: ['exams', 'sheets', classId] });
  }

  /** Every field already autosaves on blur — this exists so a teacher can explicitly flush all current values (including whatever's still focused) and get visible confirmation, without submitting and locking the sheet. */
  async function saveDraft() {
    if (!sheet) return;
    setSavingDraft(true);
    try {
      await Promise.all(order.map((studentId) => saveOne(studentId, scores[studentId] ?? '')));
      setJustSaved(true);
      if (savedTimeout.current) clearTimeout(savedTimeout.current);
      savedTimeout.current = setTimeout(() => setJustSaved(false), 2500);
    } finally {
      setSavingDraft(false);
    }
  }

  async function doSubmit() {
    if (!sheet) return;
    setSubmitting(true);
    try {
      await submitMarkSheet(sheet.id);
      void queryClient.invalidateQueries({ queryKey: ['exams', 'detail', sheet.id] });
      void queryClient.invalidateQueries({ queryKey: ['exams', 'sheets', classId] });
      void queryClient.invalidateQueries({ queryKey: ['marks', 'visible-sheets'] });
      navigation.goBack();
    } catch {
      Alert.alert('Could not submit', 'Something went wrong — try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function confirmSubmit() {
    Alert.alert(
      'Submit and lock this exam?',
      notEnteredCount > 0
        ? `${notEnteredCount} of ${order.length} students still have no mark entered. Once submitted, marks are locked — only a principal can reopen this exam for further changes.`
        : "Once submitted, marks are locked — only a principal can reopen this exam for further changes.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Submit and lock', style: notEnteredCount > 0 ? 'destructive' : 'default', onPress: () => void doSubmit() },
      ],
    );
  }

  if (loading || !sheet) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero style={{ overflow: 'hidden' }}>
          <HeroDoodle topIcon="ribbon-outline" bottomIcon="book-outline" />
          <ScreenHeader title="Enter marks" tone="onPrimary" hideBell back={navigation.canGoBack()} />
        </Hero>
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="ribbon-outline" bottomIcon="book-outline" />
        <ScreenHeader
          title={context.data?.subjectName ?? 'Enter marks'}
          subtitle={context.data ? `${context.data.className} · ${context.data.termName} · Out of ${sheet.maxScore}` : `Out of ${sheet.maxScore}`}
          tone="onPrimary"
          hideBell
          back={navigation.canGoBack()}
        >
          <StatusPill label={sheet.status} tone={statusTone[sheet.status]} />
        </ScreenHeader>

        {order.length > 0 ? (
          <View style={styles.progressRow}>
            <View style={{ flex: 1, gap: 6 }}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
              </View>
              <Text style={styles.progressLabel}>
                {enteredCount} of {order.length} marked
              </Text>
            </View>
            <Text style={styles.progressPct}>{progressPct}%</Text>
          </View>
        ) : null}
      </Hero>

      {order.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <EmptyState title="No students in this class" />
        </View>
      ) : (
        <FlatList
          data={order}
          keyExtractor={(id) => id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 160 }}
          renderItem={({ item: studentId, index }) => {
            const value = scores[studentId] ?? '';
            const state = scoreState(value, sheet.maxScore);
            return (
              <View style={[styles.row, !isDraft && styles.rowLocked]}>
                <View style={[styles.rowAccent, { backgroundColor: scoreAccent[state] }]} />
                <View style={styles.indexBadge}>
                  <Text style={styles.indexBadgeText}>{index + 1}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ ...typography.body, color: semantic.textPrimary }}>{names[studentId]}</Text>
                  <View style={styles.admissionRow}>
                    <Icon name="finger-print-outline" size={12} color={semantic.textSecondary} />
                    <Text style={styles.admissionLabel}>{admissionNos[studentId]}</Text>
                  </View>
                </View>
                <TextField
                  value={value}
                  onChangeText={(v) => setScores((prev) => ({ ...prev, [studentId]: v }))}
                  onBlur={() => void saveOne(studentId, scores[studentId] ?? '')}
                  keyboardType="numeric"
                  editable={isDraft}
                  style={[styles.scoreInput, { borderColor: scoreBorder[state] }, !isDraft && styles.scoreInputLocked]}
                />
              </View>
            );
          }}
        />
      )}

      {isDraft ? (
        <View style={styles.bottomBar}>
          {justSaved ? (
            <View style={styles.savedRow}>
              <Icon name="checkmark-circle" size={15} color={colors.success} />
              <Text style={styles.savedLabel}>All changes saved as draft</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              label="Save draft"
              variant="outline"
              onPress={() => void saveDraft()}
              loading={savingDraft}
              disabled={submitting}
              style={{ flex: 1 }}
            />
            <Button
              label="Submit and lock"
              onPress={confirmSubmit}
              loading={submitting}
              disabled={savingDraft}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  progressTrack: { height: 6, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.white },
  progressLabel: { ...typography.caption, color: colors.cream100 },
  progressPct: { ...typography.subtitle, color: colors.white },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: semantic.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semantic.border,
  },
  rowLocked: { backgroundColor: semantic.surfaceAlt },
  rowAccent: { width: 3, alignSelf: 'stretch', borderRadius: radius.pill },
  indexBadge: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexBadgeText: { ...typography.captionStrong, color: semantic.primary, fontSize: 12 },
  admissionRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  admissionLabel: { ...typography.caption, color: semantic.textSecondary },
  scoreInput: { width: 64, textAlign: 'center', borderWidth: 1.5 },
  scoreInputLocked: { opacity: 0.6 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: semantic.surface,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
  },
  savedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  savedLabel: { ...typography.caption, color: colors.success },
});
