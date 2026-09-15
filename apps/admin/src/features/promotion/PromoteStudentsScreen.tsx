import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, DateField, EmptyState, Hero, HeroDoodle, Icon, Screen, ScreenHeader, SectionHeader, StatusPill, TextField, type IconName } from '@/components';
import { formatDMYInput, parseDMY, toDMY } from '@/lib/date';
import type { RootStackParamList } from '@/navigation/types';
import { colors, elevation, radius, semantic, spacing, typography } from '@/theme/tokens';
import {
  createAcademicYear,
  defaultDestinationsFor,
  listClassesForYear,
  listOtherAcademicYears,
  loadPromotionPlan,
  runPromotion,
  type AcademicYear,
  type ClassDestination,
  type ClassRow,
  type PromotionPlan,
  type RosterStudent,
  type SourceClass,
} from './api';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Step = 'map' | 'review';

export function PromoteStudentsScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();

  const [plan, setPlan] = useState<PromotionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [otherYears, setOtherYears] = useState<AcademicYear[]>([]);

  const [targetYear, setTargetYear] = useState<AcademicYear | null>(null);
  const [targetClasses, setTargetClasses] = useState<ClassRow[]>([]);

  const [creatingYear, setCreatingYear] = useState(false);
  const [newYearLabel, setNewYearLabel] = useState('');
  const [newYearStart, setNewYearStart] = useState('');
  const [newYearEnd, setNewYearEnd] = useState('');
  const [creatingYearBusy, setCreatingYearBusy] = useState(false);

  const [classDestinations, setClassDestinations] = useState<Map<string, ClassDestination>>(new Map());
  const [studentOverrides, setStudentOverrides] = useState<Map<string, ClassDestination>>(new Map());
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('map');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await loadPromotionPlan();
        setPlan(loaded);
        setOtherYears(await listOtherAcademicYears(loaded.currentYear.id));
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Could not load classes for promotion.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function selectTargetYear(year: AcademicYear) {
    setTargetYear(year);
    setExpandedClassId(null);
    const classes = await listClassesForYear(year.id);
    setTargetClasses(classes);
    if (plan) {
      setClassDestinations(defaultDestinationsFor(plan));
      setStudentOverrides(new Map());
    }
  }

  async function submitNewYear() {
    if (!newYearLabel.trim() || !newYearStart.trim() || !newYearEnd.trim()) return;
    const isoStart = parseDMY(newYearStart);
    const isoEnd = parseDMY(newYearEnd);
    if (!isoStart || !isoEnd) {
      Alert.alert('Invalid date', 'Enter dates as DD/MM/YYYY.');
      return;
    }
    setCreatingYearBusy(true);
    try {
      const created = await createAcademicYear({ label: newYearLabel.trim(), startsOn: isoStart, endsOn: isoEnd });
      setCreatingYear(false);
      setNewYearLabel('');
      setNewYearStart('');
      setNewYearEnd('');
      setOtherYears((prev) => [created, ...prev]);
      await selectTargetYear(created);
    } catch {
      Alert.alert('Could not create the academic year', 'Check the label is unique and the dates are valid.');
    } finally {
      setCreatingYearBusy(false);
    }
  }

  function setClassDestination(classId: string, dest: ClassDestination) {
    setClassDestinations((prev) => new Map(prev).set(classId, dest));
  }

  function setStudentOverride(studentId: string, dest: ClassDestination) {
    setStudentOverrides((prev) => new Map(prev).set(studentId, dest));
  }

  function removeStudentOverride(studentId: string) {
    setStudentOverrides((prev) => {
      const next = new Map(prev);
      next.delete(studentId);
      return next;
    });
  }

  function resetToDefaults() {
    if (!plan) return;
    setClassDestinations(defaultDestinationsFor(plan));
    setStudentOverrides(new Map());
  }

  const totals = useMemo(() => {
    if (!plan) return { promoting: 0, graduating: 0, exceptions: 0 };
    let promoting = 0;
    let graduating = 0;
    for (const cls of plan.sourceClasses) {
      const classDest = classDestinations.get(cls.id);
      for (const student of plan.studentsByClass.get(cls.id) ?? []) {
        const effective = studentOverrides.get(student.id) ?? classDest;
        if (effective?.kind === 'graduate') graduating += 1;
        else if (effective) promoting += 1;
      }
    }
    return { promoting, graduating, exceptions: studentOverrides.size };
  }, [plan, classDestinations, studentOverrides]);

  const byClassRows = useMemo(() => {
    if (!plan) return [];
    return plan.sourceClasses.map((cls) => {
      const dest = classDestinations.get(cls.id);
      const students = plan.studentsByClass.get(cls.id) ?? [];
      const exceptionCount = students.filter((s) => studentOverrides.has(s.id)).length;
      return { cls, dest, totalCount: students.length, exceptionCount };
    });
  }, [plan, classDestinations, studentOverrides]);

  const newClassesNeeded = useMemo(() => {
    const names = new Set<string>();
    for (const dest of [...classDestinations.values(), ...studentOverrides.values()]) {
      if (dest.kind === 'promote' && !targetClasses.some((c) => c.gradeId === dest.targetGradeId && c.name === dest.targetClassName)) {
        names.add(dest.targetClassName);
      }
    }
    return [...names];
  }, [classDestinations, studentOverrides, targetClasses]);

  function confirmPromotion() {
    if (!targetYear) return;
    Alert.alert(
      'Confirm promotion?',
      `${totals.promoting} students will get new enrolments for ${targetYear.label}. ${totals.graduating} students will be marked graduated. This can be corrected per student afterward, but there's no single undo.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Promote', onPress: () => void doPromote() },
      ],
    );
  }

  async function doPromote() {
    if (!plan || !targetYear) return;
    setSubmitting(true);
    try {
      const result = await runPromotion({
        targetYearId: targetYear.id,
        sourceClasses: plan.sourceClasses,
        classDestinations,
        studentOverrides,
        studentsByClass: plan.studentsByClass,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['students'] }),
        queryClient.invalidateQueries({ queryKey: ['classes'] }),
        queryClient.invalidateQueries({ queryKey: ['academicStructure'] }),
        queryClient.invalidateQueries({ queryKey: ['calendar'] }),
      ]);
      const skipped = result.alreadyEnrolled + result.alreadyGraduated;
      Alert.alert(
        'Promotion complete',
        `${result.promoted} promoted, ${result.graduated} graduated for ${targetYear.label}.` +
          (skipped > 0 ? ` ${skipped} were already done and skipped.` : ''),
        [{ text: 'Done', onPress: () => navigation.goBack() }],
      );
    } catch (err) {
      Alert.alert('Could not complete promotion', err instanceof Error ? err.message : 'Something went wrong — try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Screen padded={false} edges={['left', 'right']} scroll={false}>
        <Hero style={{ overflow: 'hidden' }}>
          <HeroDoodle topIcon="arrow-up-circle-outline" bottomIcon="school-outline" />
          <ScreenHeader title="Promote students" tone="onPrimary" back={navigation.canGoBack()} hideBell />
        </Hero>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl }}>
          <ActivityIndicator color={semantic.primary} />
        </View>
      </Screen>
    );
  }

  if (loadError || !plan) {
    return (
      <Screen padded={false} edges={['left', 'right']} scroll={false}>
        <Hero style={{ overflow: 'hidden' }}>
          <HeroDoodle topIcon="arrow-up-circle-outline" bottomIcon="school-outline" />
          <ScreenHeader title="Promote students" tone="onPrimary" back={navigation.canGoBack()} hideBell />
        </Hero>
        <View style={{ padding: spacing.lg }}>
          <EmptyState icon="alert-circle-outline" title="Couldn't load this" message={loadError ?? 'Something went wrong.'} />
        </View>
      </Screen>
    );
  }

  if (plan.sourceClasses.length === 0) {
    return (
      <Screen padded={false} edges={['left', 'right']} scroll={false}>
        <Hero style={{ overflow: 'hidden' }}>
          <HeroDoodle topIcon="arrow-up-circle-outline" bottomIcon="school-outline" />
          <ScreenHeader title="Promote students" subtitle={plan.currentYear.label} tone="onPrimary" back={navigation.canGoBack()} hideBell />
        </Hero>
        <View style={{ padding: spacing.lg }}>
          <EmptyState icon="layers-outline" title="No classes yet" message="Set up this year's classes in Academic structure before promoting students." />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false} edges={['left', 'right']} scroll={false}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="arrow-up-circle-outline" bottomIcon="school-outline" />
        <ScreenHeader
          title={step === 'map' ? 'Promote students' : 'Review promotion'}
          subtitle={targetYear ? `${plan.currentYear.label} → ${targetYear.label}` : plan.currentYear.label}
          tone="onPrimary"
          back={step === 'review' ? undefined : navigation.canGoBack()}
          onMenuPress={step === 'review' ? () => setStep('map') : undefined}
          hideBell
        />
        <Stepper step={step} />
      </Hero>

      {step === 'map' ? (
        <MapStep
          plan={plan}
          otherYears={otherYears}
          targetYear={targetYear}
          targetClasses={targetClasses}
          onSelectYear={(y) => void selectTargetYear(y)}
          creatingYear={creatingYear}
          onStartCreateYear={() => setCreatingYear(true)}
          onCancelCreateYear={() => setCreatingYear(false)}
          newYearLabel={newYearLabel}
          newYearStart={newYearStart}
          newYearEnd={newYearEnd}
          onChangeLabel={setNewYearLabel}
          onChangeStart={(t) => setNewYearStart(formatDMYInput(t))}
          onPickStart={(iso) => setNewYearStart(toDMY(iso))}
          onChangeEnd={(t) => setNewYearEnd(formatDMYInput(t))}
          onPickEnd={(iso) => setNewYearEnd(toDMY(iso))}
          onSubmitNewYear={() => void submitNewYear()}
          creatingYearBusy={creatingYearBusy}
          classDestinations={classDestinations}
          studentOverrides={studentOverrides}
          expandedClassId={expandedClassId}
          onToggleExpand={(id) => setExpandedClassId((cur) => (cur === id ? null : id))}
          onSetClassDestination={setClassDestination}
          onSetStudentOverride={setStudentOverride}
          onRemoveStudentOverride={removeStudentOverride}
          onResetDefaults={resetToDefaults}
          totals={totals}
          onContinue={() => setStep('review')}
        />
      ) : (
        <ReviewStep
          plan={plan}
          targetYear={targetYear as AcademicYear}
          byClassRows={byClassRows}
          studentOverrides={studentOverrides}
          totals={totals}
          newClassesNeeded={newClassesNeeded}
          submitting={submitting}
          onBack={() => setStep('map')}
          onConfirm={confirmPromotion}
        />
      )}
    </Screen>
  );
}

function Stepper({ step }: { step: Step }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md }}>
      <StepDot label="1" text="Map classes" active={step === 'map'} done={step === 'review'} />
      <View style={{ width: 20, height: 1.5, backgroundColor: 'rgba(255,255,255,0.35)' }} />
      <StepDot label="2" text="Review & confirm" active={step === 'review'} done={false} />
    </View>
  );
}

function StepDot({ label, text, active, done }: { label: string; text: string; active: boolean; done: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active || done ? colors.white : 'rgba(255,255,255,0.2)',
        }}
      >
        {done ? (
          <Icon name="checkmark" size={13} color={colors.maroon700} />
        ) : (
          <Text style={{ fontSize: 11, fontWeight: '700', color: active ? colors.maroon700 : colors.white }}>{label}</Text>
        )}
      </View>
      <Text style={{ fontSize: 12, fontWeight: '600', color: active || done ? colors.white : 'rgba(255,255,255,0.7)' }}>{text}</Text>
    </View>
  );
}

function AnimatedChevron({ expanded }: { expanded: boolean }) {
  const [anim] = useState(() => new Animated.Value(expanded ? 1 : 0));
  useEffect(() => {
    Animated.timing(anim, { toValue: expanded ? 1 : 0, duration: 160, useNativeDriver: true }).start();
  }, [expanded, anim]);
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Icon name="chevron-down" size={16} color={semantic.textSecondary} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: semantic.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...elevation.raised,
  },
});

// ---------------------------------------------------------------------------
// Map step
// ---------------------------------------------------------------------------

type MapStepProps = {
  plan: PromotionPlan;
  otherYears: AcademicYear[];
  targetYear: AcademicYear | null;
  targetClasses: ClassRow[];
  onSelectYear: (year: AcademicYear) => void;
  creatingYear: boolean;
  onStartCreateYear: () => void;
  onCancelCreateYear: () => void;
  newYearLabel: string;
  newYearStart: string;
  newYearEnd: string;
  onChangeLabel: (v: string) => void;
  onChangeStart: (v: string) => void;
  onPickStart: (iso: string) => void;
  onChangeEnd: (v: string) => void;
  onPickEnd: (iso: string) => void;
  onSubmitNewYear: () => void;
  creatingYearBusy: boolean;
  classDestinations: Map<string, ClassDestination>;
  studentOverrides: Map<string, ClassDestination>;
  expandedClassId: string | null;
  onToggleExpand: (classId: string) => void;
  onSetClassDestination: (classId: string, dest: ClassDestination) => void;
  onSetStudentOverride: (studentId: string, dest: ClassDestination) => void;
  onRemoveStudentOverride: (studentId: string) => void;
  onResetDefaults: () => void;
  totals: { promoting: number; graduating: number; exceptions: number };
  onContinue: () => void;
};

function MapStep(props: MapStepProps) {
  const { plan, otherYears, targetYear } = props;
  const totalStudents = plan.sourceClasses.reduce((sum, c) => sum + c.studentCount, 0);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: targetYear ? spacing.xxxl + 64 : spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <SectionHeader icon="calendar-outline" label="ACADEMIC YEAR" />
          <Row label="Promoting from" value={`${plan.currentYear.label} · current`} />
          {targetYear ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ ...typography.body, color: semantic.textSecondary }}>Promoting into</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{targetYear.label}</Text>
                <Button label="Change" size="sm" variant="ghost" onPress={props.onStartCreateYear} accessibilityLabel="Change target year" />
              </View>
            </View>
          ) : null}

          {!targetYear || props.creatingYear ? (
            <View style={{ gap: spacing.sm, marginTop: targetYear ? spacing.sm : 0 }}>
              {otherYears.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                  {otherYears.map((y) => (
                    <Button
                      key={y.id}
                      label={y.label}
                      size="sm"
                      variant={targetYear?.id === y.id ? 'primary' : 'outline'}
                      onPress={() => {
                        props.onSelectYear(y);
                        props.onCancelCreateYear();
                      }}
                    />
                  ))}
                </View>
              ) : null}

              {!props.creatingYear ? (
                <Button label="+ New year" size="sm" variant="ghost" onPress={props.onStartCreateYear} />
              ) : (
                <View style={{ gap: spacing.sm }}>
                  <TextField label="Label (e.g. 2027)" value={props.newYearLabel} onChangeText={props.onChangeLabel} />
                  <DateField label="Starts on" value={props.newYearStart} onChangeText={props.onChangeStart} onPickIso={props.onPickStart} />
                  <DateField label="Ends on" value={props.newYearEnd} onChangeText={props.onChangeEnd} onPickIso={props.onPickEnd} />
                  <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                    <Button label="Create" size="sm" onPress={props.onSubmitNewYear} loading={props.creatingYearBusy} />
                    <Button label="Cancel" size="sm" variant="ghost" onPress={props.onCancelCreateYear} />
                  </View>
                </View>
              )}
            </View>
          ) : null}

          {targetYear ? (
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
              Classes that don&apos;t exist yet in {targetYear.label} are created automatically when you confirm.
            </Text>
          ) : null}
        </Card>

        {targetYear ? (
          <>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View>
                  <SectionHeader icon="layers-outline" label="CLASS MAPPING" />
                  <Text style={{ ...typography.caption, color: semantic.textSecondary, marginTop: 2 }}>
                    {plan.sourceClasses.length} classes · {totalStudents} students
                  </Text>
                </View>
                <Button label="Reset" size="sm" variant="ghost" onPress={props.onResetDefaults} />
              </View>

              <View style={{ marginTop: spacing.xs }}>
                {plan.sourceClasses.map((cls, i) => (
                  <ClassMappingRow
                    key={cls.id}
                    cls={cls}
                    isLast={i === plan.sourceClasses.length - 1}
                    students={plan.studentsByClass.get(cls.id) ?? []}
                    nextGrade={plan.nextGradeByGradeId.get(cls.gradeId) ?? null}
                    dest={props.classDestinations.get(cls.id)}
                    targetClasses={props.targetClasses}
                    studentOverrides={props.studentOverrides}
                    expanded={props.expandedClassId === cls.id}
                    onToggleExpand={() => props.onToggleExpand(cls.id)}
                    onSetClassDestination={(dest) => props.onSetClassDestination(cls.id, dest)}
                    onSetStudentOverride={props.onSetStudentOverride}
                    onRemoveStudentOverride={props.onRemoveStudentOverride}
                  />
                ))}
              </View>
            </Card>

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <StatTile icon="arrow-up-circle-outline" value={props.totals.promoting} label="Promoting" />
              <StatTile icon="school-outline" value={props.totals.graduating} label="Graduating" tone="gold" />
              <StatTile icon="git-branch-outline" value={props.totals.exceptions} label="Exceptions" />
            </View>
          </>
        ) : (
          <EmptyState icon="calendar-outline" title="Choose a year to promote into" message="Pick an existing year above, or create a new one." />
        )}
      </ScrollView>

      {targetYear ? (
        <View style={styles.footer}>
          <Button label="Continue to review" icon="arrow-forward" iconPosition="right" onPress={props.onContinue} style={{ flex: 1 }} />
        </View>
      ) : null}
    </View>
  );
}

function StatTile({ icon, value, label, tone }: { icon: IconName; value: number; label: string; tone?: 'gold' }) {
  return (
    <Card flat style={{ flex: 1, alignItems: 'flex-start', gap: 4 }}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: radius.pill,
          backgroundColor: tone === 'gold' ? colors.gold100 : semantic.primaryMuted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={15} color={tone === 'gold' ? colors.gold900 : semantic.primary} />
      </View>
      <Text style={{ ...typography.title, color: semantic.textPrimary }}>{value}</Text>
      <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{label}</Text>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ ...typography.body, color: semantic.textSecondary }}>{label}</Text>
      <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// One class row, expandable into the override + exceptions panel
// ---------------------------------------------------------------------------

function ClassMappingRow({
  cls,
  isLast,
  students,
  nextGrade,
  dest,
  targetClasses,
  studentOverrides,
  expanded,
  onToggleExpand,
  onSetClassDestination,
  onSetStudentOverride,
  onRemoveStudentOverride,
}: {
  cls: SourceClass;
  isLast: boolean;
  students: RosterStudent[];
  nextGrade: { id: string; number: number; name: string } | null;
  dest: ClassDestination | undefined;
  targetClasses: ClassRow[];
  studentOverrides: Map<string, ClassDestination>;
  expanded: boolean;
  onToggleExpand: () => void;
  onSetClassDestination: (dest: ClassDestination) => void;
  onSetStudentOverride: (studentId: string, dest: ClassDestination) => void;
  onRemoveStudentOverride: (studentId: string) => void;
}) {
  const [addingException, setAddingException] = useState(false);
  const [newClassOpen, setNewClassOpen] = useState(false);
  const [newClassName, setNewClassName] = useState('');

  const isGraduating = dest?.kind === 'graduate';
  const existingNextGradeClasses = nextGrade ? targetClasses.filter((c) => c.gradeId === nextGrade.id) : [];
  const currentName = dest?.kind === 'promote' ? dest.targetClassName : null;
  const chipNames =
    currentName && !existingNextGradeClasses.some((c) => c.name === currentName)
      ? [currentName, ...existingNextGradeClasses.map((c) => c.name)]
      : existingNextGradeClasses.map((c) => c.name);

  const exceptions = students.filter((s) => studentOverrides.has(s.id));
  const availableForException = students.filter((s) => !studentOverrides.has(s.id));

  return (
    <View style={{ borderBottomWidth: isLast ? 0 : 1, borderBottomColor: colors.cream100, paddingVertical: spacing.sm }}>
      <Pressable onPress={onToggleExpand} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ width: 30, height: 30, borderRadius: radius.pill, backgroundColor: colors.maroon50, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.maroon700 }}>{cls.gradeNumber}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{cls.name}</Text>
          <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{cls.studentCount} students</Text>
        </View>
        {isGraduating ? (
          <StatusPill label="Graduating" tone="gold" />
        ) : (
          <Text style={{ ...typography.captionStrong, color: semantic.primary }}>{currentName ?? '—'}</Text>
        )}
        <AnimatedChevron expanded={expanded} />
      </Pressable>

      {!expanded && exceptions.length > 0 ? (
        <Text style={{ ...typography.caption, color: semantic.primary, fontWeight: '600', marginLeft: 40, marginTop: 2 }}>
          {exceptions.length} exception{exceptions.length > 1 ? 's' : ''}
        </Text>
      ) : null}

      {expanded ? (
        <View style={{ backgroundColor: colors.maroon50, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm, gap: spacing.sm }}>
          {nextGrade ? (
            <>
              <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>Send this class to</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {chipNames.map((name) => (
                  <Button
                    key={name}
                    label={existingNextGradeClasses.some((c) => c.name === name) ? name : `${name} (new)`}
                    size="sm"
                    variant={name === currentName ? 'primary' : 'outline'}
                    onPress={() =>
                      onSetClassDestination({ kind: 'promote', targetGradeId: nextGrade.id, targetGradeNumber: nextGrade.number, targetClassName: name })
                    }
                  />
                ))}
                <Button label={newClassOpen ? 'Cancel' : '+ New class'} size="sm" variant="ghost" onPress={() => setNewClassOpen((v) => !v)} />
                <Button label="Graduating" size="sm" variant={isGraduating ? 'primary' : 'outline'} onPress={() => onSetClassDestination({ kind: 'graduate' })} />
              </View>
              {newClassOpen ? (
                <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-end' }}>
                  <TextField value={newClassName} onChangeText={setNewClassName} placeholder="Class name" style={{ flex: 1 }} />
                  <Button
                    label="Use"
                    size="sm"
                    disabled={!newClassName.trim()}
                    onPress={() => {
                      onSetClassDestination({ kind: 'promote', targetGradeId: nextGrade.id, targetGradeNumber: nextGrade.number, targetClassName: newClassName.trim() });
                      setNewClassOpen(false);
                      setNewClassName('');
                    }}
                  />
                </View>
              ) : null}
            </>
          ) : (
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
              All {cls.studentCount} students in the highest grade graduate — add an exception below for anyone repeating instead.
            </Text>
          )}

          <View style={{ height: 1, backgroundColor: colors.cream200 }} />

          <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>Exceptions in this class ({exceptions.length})</Text>
          {exceptions.map((s) => {
            const override = studentOverrides.get(s.id) as ClassDestination;
            return (
              <View key={s.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...typography.bodyStrong, fontSize: 14, color: semantic.textPrimary }}>{s.fullName}</Text>
                  <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
                    {override.kind === 'graduate' ? 'Graduating' : `→ ${override.targetClassName}`}
                  </Text>
                </View>
                <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onRemoveStudentOverride(s.id)}>
                  <Text style={{ ...typography.captionStrong, color: semantic.primary }}>Undo</Text>
                </Pressable>
              </View>
            );
          })}

          {addingException ? (
            <StudentExceptionPicker
              students={availableForException}
              sourceClassName={cls.name}
              sourceGradeId={cls.gradeId}
              sourceGradeNumber={cls.gradeNumber}
              nextGrade={nextGrade}
              existingNextGradeClasses={existingNextGradeClasses}
              onPick={(studentId, exceptionDest) => {
                onSetStudentOverride(studentId, exceptionDest);
                setAddingException(false);
              }}
              onCancel={() => setAddingException(false)}
            />
          ) : (
            <Button
              label="+ Add student exception"
              size="sm"
              variant="ghost"
              disabled={availableForException.length === 0}
              onPress={() => setAddingException(true)}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

function StudentExceptionPicker({
  students,
  sourceClassName,
  sourceGradeId,
  sourceGradeNumber,
  nextGrade,
  existingNextGradeClasses,
  onPick,
  onCancel,
}: {
  students: RosterStudent[];
  sourceClassName: string;
  sourceGradeId: string;
  sourceGradeNumber: number;
  nextGrade: { id: string; number: number; name: string } | null;
  existingNextGradeClasses: ClassRow[];
  onPick: (studentId: string, dest: ClassDestination) => void;
  onCancel: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!selectedId) {
    return (
      <View style={{ gap: spacing.xs }}>
        <Text style={{ ...typography.caption, color: semantic.textSecondary }}>Pick a student</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {students.map((s) => (
            <Button key={s.id} label={s.fullName} size="sm" variant="outline" onPress={() => setSelectedId(s.id)} />
          ))}
          <Button label="Cancel" size="sm" variant="ghost" onPress={onCancel} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ ...typography.caption, color: semantic.textSecondary }}>Send this student to</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        <Button
          label={`Repeat ${sourceClassName}`}
          size="sm"
          variant="outline"
          onPress={() => onPick(selectedId, { kind: 'promote', targetGradeId: sourceGradeId, targetGradeNumber: sourceGradeNumber, targetClassName: sourceClassName })}
        />
        {nextGrade
          ? existingNextGradeClasses.map((c) => (
              <Button
                key={c.id}
                label={c.name}
                size="sm"
                variant="outline"
                onPress={() => onPick(selectedId, { kind: 'promote', targetGradeId: nextGrade.id, targetGradeNumber: nextGrade.number, targetClassName: c.name })}
              />
            ))
          : null}
        <Button label="Cancel" size="sm" variant="ghost" onPress={onCancel} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Review step
// ---------------------------------------------------------------------------

function ReviewStep({
  plan,
  targetYear,
  byClassRows,
  studentOverrides,
  totals,
  newClassesNeeded,
  submitting,
  onBack,
  onConfirm,
}: {
  plan: PromotionPlan;
  targetYear: AcademicYear;
  byClassRows: { cls: SourceClass; dest: ClassDestination | undefined; totalCount: number; exceptionCount: number }[];
  studentOverrides: Map<string, ClassDestination>;
  totals: { promoting: number; graduating: number; exceptions: number };
  newClassesNeeded: string[];
  submitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const exceptionEntries = [...studentOverrides.entries()];
  const studentsById = new Map(plan.sourceClasses.flatMap((c) => (plan.studentsByClass.get(c.id) ?? []).map((s) => [s.id, s] as const)));

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl + 64 }}>
        <Card>
          <SectionHeader icon="checkmark-circle-outline" label="WHAT WILL HAPPEN" />
          <Bullet text={`${totals.promoting} students get a new enrolment in ${targetYear.label}.`} />
          {newClassesNeeded.length > 0 ? (
            <Bullet text={`${newClassesNeeded.length} destination class${newClassesNeeded.length > 1 ? 'es are' : ' is'} created automatically: ${newClassesNeeded.join(', ')}.`} />
          ) : null}
          {totals.graduating > 0 ? (
            <Bullet text={`${totals.graduating} students are marked graduated. Enrolment history is kept; they stop appearing in active class lists.`} />
          ) : null}
          {totals.exceptions > 0 ? <Bullet text={`${totals.exceptions} students follow the individual overrides you set below.`} /> : null}
        </Card>

        <Card>
          <SectionHeader icon="layers-outline" label="BY CLASS" />
          {byClassRows.map(({ cls, dest, totalCount, exceptionCount }) => (
            <View key={cls.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
              <Text style={{ ...typography.bodyStrong, fontSize: 14, color: semantic.textPrimary, flex: 1 }}>{cls.name}</Text>
              {dest?.kind === 'graduate' ? (
                <StatusPill label="Graduating" tone="gold" />
              ) : (
                <Text style={{ ...typography.body, fontSize: 14, color: semantic.textSecondary }}>→ {dest?.targetClassName}</Text>
              )}
              <Text style={{ ...typography.caption, color: semantic.textSecondary, marginLeft: spacing.sm, minWidth: 56, textAlign: 'right' }}>
                {exceptionCount > 0 ? `${totalCount - exceptionCount} of ${totalCount}` : totalCount}
              </Text>
            </View>
          ))}
        </Card>

        {exceptionEntries.length > 0 ? (
          <Card>
            <SectionHeader icon="git-branch-outline" label={`EXCEPTIONS (${exceptionEntries.length})`} />
            {exceptionEntries.map(([studentId, dest]) => {
              const student = studentsById.get(studentId);
              if (!student) return null;
              return (
                <View key={studentId}>
                  <Text style={{ ...typography.bodyStrong, fontSize: 14, color: semantic.textPrimary }}>{student.fullName}</Text>
                  <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
                    {dest.kind === 'graduate' ? 'Graduating' : `Moves to ${dest.targetClassName}`}
                  </Text>
                </View>
              );
            })}
          </Card>
        ) : null}

        <Card style={{ backgroundColor: colors.gold50, borderColor: colors.gold100 }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
            <Icon name="alert-circle-outline" size={20} color={colors.warning} />
            <Text style={{ ...typography.caption, color: colors.warning, flex: 1, lineHeight: 18 }}>
              This creates real enrolment records immediately. You can correct an individual student afterward from their profile, but there&apos;s no
              single &quot;undo all&quot; — double-check the mapping above first.
            </Text>
          </View>
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Back to mapping" variant="ghost" onPress={onBack} style={{ flex: 1 }} disabled={submitting} />
        <Button label={`Confirm · ${totals.promoting + totals.graduating}`} onPress={onConfirm} style={{ flex: 1 }} loading={submitting} />
      </View>
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
      <Icon name="checkmark-circle-outline" size={16} color={colors.teal700} style={{ marginTop: 2 }} />
      <Text style={{ ...typography.body, fontSize: 14, color: semantic.textPrimary, flex: 1 }}>{text}</Text>
    </View>
  );
}
