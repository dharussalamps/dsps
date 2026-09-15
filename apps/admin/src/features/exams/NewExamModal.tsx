import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Icon, TextField } from '@/components';
import { useTermsForYear } from '@/features/calendar/hooks';
import { getOrCreateMarkSheet } from '@/features/marks/api';
import { useSubjectsForClass } from '@/features/marks/hooks';
import { isCurrentPeriod } from '@/lib/date';
import { colors, elevation, radius, semantic, spacing, typography } from '@/theme/tokens';

type Props = {
  visible: boolean;
  classId: string;
  /** The exams screen already has a year selected — terms are scoped to it so the picker only ever offers terms that belong to the class being viewed. */
  yearId: string | undefined;
  onClose: () => void;
  onCreated: (markSheetId: string) => void;
};

type Step = 'subject' | 'term';

/** Picks a subject then a term to create (or open, if it already exists) a mark sheet for the current class — the "new exam" entry point on ExamsScreen. */
export function NewExamModal({ visible, classId, yearId, onClose, onCreated }: Props) {
  const subjects = useSubjectsForClass(classId);
  const terms = useTermsForYear(yearId);
  const [step, setStep] = useState<Step>('subject');
  const [subjectId, setSubjectId] = useState<string | undefined>(undefined);
  const [maxScore, setMaxScore] = useState('100');
  const [creatingTermId, setCreatingTermId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep('subject');
    setSubjectId(undefined);
    setMaxScore('100');
    setError(null);
    setCreatingTermId(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function create(termId: string) {
    if (!subjectId) return;
    setCreatingTermId(termId);
    setError(null);
    try {
      const parsed = Number(maxScore);
      const sheet = await getOrCreateMarkSheet(classId, subjectId, termId, Number.isFinite(parsed) && parsed > 0 ? parsed : undefined);
      const createdMarkSheetId = sheet.id;
      reset();
      onCreated(createdMarkSheetId);
    } catch {
      setError('Could not create the exam. Try again.');
      setCreatingTermId(null);
    }
  }

  const selectedSubject = subjects.data?.find((s) => s.subjectId === subjectId);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>New exam</Text>

          {step === 'subject' ? (
            <>
              <Text style={styles.stepLabel}>CHOOSE A SUBJECT</Text>
              <ScrollView style={styles.chipScroll}>
                <View style={styles.chipGrid}>
                  {(subjects.data ?? []).map((s) => (
                    <Button
                      key={s.subjectId}
                      label={s.name}
                      size="sm"
                      variant="outline"
                      onPress={() => {
                        setSubjectId(s.subjectId);
                        setStep('term');
                      }}
                    />
                  ))}
                </View>
                {subjects.data && subjects.data.length === 0 ? (
                  <Text style={styles.emptyText}>No subjects assigned to this grade yet.</Text>
                ) : null}
              </ScrollView>
            </>
          ) : (
            <>
              <Pressable accessibilityRole="button" onPress={() => setStep('subject')} style={styles.breadcrumb} hitSlop={8}>
                <Icon name="chevron-back" size={18} color={semantic.primary} />
                <Text style={styles.breadcrumbLabel}>{selectedSubject?.name}</Text>
              </Pressable>

              <TextField label="Out of (max score)" value={maxScore} onChangeText={setMaxScore} keyboardType="numeric" style={styles.maxScoreInput} />

              <Text style={[styles.stepLabel, { marginTop: spacing.sm }]}>CHOOSE A TERM</Text>
              <View style={styles.chipGrid}>
                {(terms.data ?? []).map((t) => (
                  <Button
                    key={t.id}
                    label={isCurrentPeriod(t.startsOn, t.endsOn) ? `${t.name} · current` : t.name}
                    size="sm"
                    variant="outline"
                    loading={creatingTermId === t.id}
                    disabled={creatingTermId != null}
                    onPress={() => void create(t.id)}
                  />
                ))}
              </View>
              {terms.data && terms.data.length === 0 ? <Text style={styles.emptyText}>No terms defined for this year yet.</Text> : null}
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </>
          )}

          <Button label="Cancel" variant="ghost" onPress={close} style={{ marginTop: spacing.sm }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(24,10,13,0.55)', alignItems: 'center', justifyContent: 'center' },
  sheet: { width: 340, maxWidth: '90%', backgroundColor: semantic.surface, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.sm, ...elevation.raised },
  title: { ...typography.title, color: semantic.textPrimary },
  stepLabel: { ...typography.captionStrong, color: semantic.textSecondary, letterSpacing: 0.4 },
  chipScroll: { maxHeight: 260 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  breadcrumbLabel: { ...typography.bodyStrong, color: semantic.primary },
  maxScoreInput: { width: 110 },
  emptyText: { ...typography.caption, color: semantic.textSecondary },
  errorText: { ...typography.caption, color: colors.error },
});
