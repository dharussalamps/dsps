import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Button, EmptyState, ScreenHeader, StatusPill, TextField } from '@/components';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { semantic, spacing, typography } from '@/theme/tokens';
import { fetchMarksForSheet, getOrCreateMarkSheet, saveMark, submitMarkSheet, type MarkSheetInfo } from './api';

type Route = RouteProp<RootStackParamList, 'MarkEntry'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export function MarkEntryScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { classId, subjectId, termId } = params;
  const staff = useAuthStore((s) => s.staff);

  const [sheet, setSheet] = useState<MarkSheetInfo | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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
      for (const r of rows) {
        scoreMap[r.studentId] = r.score != null ? String(r.score) : '';
        nameMap[r.studentId] = r.fullName;
      }
      setScores(scoreMap);
      setNames(nameMap);
      setOrder(rows.map((r) => r.studentId));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [classId, subjectId, termId]);

  const isDraft = sheet?.status === 'draft';

  async function saveOne(studentId: string, value: string) {
    if (!sheet || !staff) return;
    const parsed = value.trim() === '' ? null : Number(value);
    if (parsed != null && (Number.isNaN(parsed) || parsed < 0 || parsed > sheet.maxScore)) return;
    await saveMark(sheet.id, studentId, parsed, staff.id);
  }

  async function submit() {
    if (!sheet) return;
    setSubmitting(true);
    try {
      await submitMarkSheet(sheet.id);
      navigation.goBack();
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !sheet) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={semantic.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'left', 'right']}>
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        <ScreenHeader title="Enter marks" subtitle={`Out of ${sheet.maxScore}`}>
          <StatusPill label={sheet.status} tone={isDraft ? 'gold' : 'success'} />
        </ScreenHeader>
      </View>

      {order.length === 0 ? (
        <EmptyState title="No students in this class" />
      ) : (
        <FlatList
          data={order}
          keyExtractor={(id) => id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: 120 }}
          renderItem={({ item: studentId }) => (
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
              <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary, flex: 1 }}>{names[studentId]}</Text>
              <TextField
                value={scores[studentId] ?? ''}
                onChangeText={(v) => setScores((prev) => ({ ...prev, [studentId]: v }))}
                onBlur={() => void saveOne(studentId, scores[studentId] ?? '')}
                keyboardType="numeric"
                editable={isDraft}
                style={{ width: 72, textAlign: 'center' }}
              />
            </View>
          )}
        />
      )}

      {isDraft ? (
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
          <Button label="Submit and lock" onPress={() => void submit()} loading={submitting} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}
