import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Hero,
  HeroDoodle,
  Icon,
  Screen,
  ScreenHeader,
  SegmentedControl,
  TextField,
} from '@/components';
import { useAcademicYears } from '@/features/calendar/hooks';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';
import type { LeaveAllocationRow } from './api';
import { useLeaveAllocations, useLeaveTypes, useSetLeaveBalance, useSetLeaveBalancesForAll } from './hooks';

/**
 * Principal-only screen filling the gap noted in leave.sql: leave_balances
 * had no admin write path, only a lazy default (leave_types.annual_entitlement)
 * copied in by approve_leave() on first use. Here the principal reviews and
 * overrides each staff member's entitled days, per leave type, per academic
 * year — set_leave_balance() enforces leave.approve server-side.
 */
export function LeaveAllocationScreen() {
  const navigation = useNavigation();
  const years = useAcademicYears();
  const leaveTypes = useLeaveTypes();
  // Only casual, medical and maternity leave carry an admin-set annual
  // entitlement — duty and half-day leave are never allocated a balance,
  // and short leave's cap is a fixed monthly constant, not admin-set here.
  const allocatableLeaveTypes = leaveTypes.data?.filter((t) => t.key === 'casual' || t.key === 'medical' || t.key === 'maternity');
  const [pickedYearId, setPickedYearId] = useState<string | undefined>(undefined);
  const [pickedLeaveTypeId, setPickedLeaveTypeId] = useState<string | undefined>(undefined);

  const yearId = pickedYearId ?? years.data?.find((y) => y.isCurrent)?.id ?? years.data?.[0]?.id;
  const leaveTypeId = pickedLeaveTypeId ?? allocatableLeaveTypes?.[0]?.id;

  const allocations = useLeaveAllocations(leaveTypeId, yearId);
  const setBalance = useSetLeaveBalance();
  const setAllBalances = useSetLeaveBalancesForAll();
  const [savingStaffId, setSavingStaffId] = useState<string | null>(null);
  const [bulkDraft, setBulkDraft] = useState('');
  const [bulkApplying, setBulkApplying] = useState(false);

  async function handleSave(row: LeaveAllocationRow, entitled: number) {
    if (!yearId) return;
    setSavingStaffId(row.staffId);
    try {
      await setBalance.mutateAsync({ staffId: row.staffId, leaveTypeId: row.leaveTypeId, academicYearId: yearId, entitled });
    } finally {
      setSavingStaffId(null);
    }
  }

  const bulkParsed = Number(bulkDraft);
  const bulkValid = bulkDraft.trim() !== '' && !Number.isNaN(bulkParsed) && bulkParsed >= 0;
  const leaveTypeName = allocatableLeaveTypes?.find((t) => t.id === leaveTypeId)?.name ?? 'this leave type';
  const yearLabel = years.data?.find((y) => y.id === yearId)?.label ?? 'this year';
  const staffCount = allocations.data?.length ?? 0;

  function confirmApplyToAll() {
    if (!leaveTypeId || !yearId || !bulkValid) return;
    Alert.alert(
      `Set ${bulkParsed} days for everyone?`,
      `This overwrites ${leaveTypeName} entitled days to ${bulkParsed} for all ${staffCount} active staff members in ${yearLabel}. Individual overrides for this leave type and year will be replaced.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Apply to all', style: 'destructive', onPress: () => void applyToAll(bulkParsed) },
      ],
    );
  }

  async function applyToAll(entitled: number) {
    if (!leaveTypeId || !yearId) return;
    setBulkApplying(true);
    try {
      await setAllBalances.mutateAsync({ leaveTypeId, academicYearId: yearId, entitled });
      setBulkDraft('');
    } finally {
      setBulkApplying(false);
    }
  }

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="calendar-outline" bottomIcon="people-outline" />
        <ScreenHeader title="Leave allocation" subtitle="Set entitled days per staff member" tone="onPrimary" hideBell back={navigation.canGoBack()} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {(years.data ?? []).map((y) => {
            const active = y.id === yearId;
            return (
              <Pressable
                key={y.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setPickedYearId(y.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Icon name="calendar-outline" size={14} color={active ? semantic.primary : colors.white} />
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{y.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {allocatableLeaveTypes?.length ? (
          <View style={{ marginTop: spacing.xs }}>
            <SegmentedControl
              value={leaveTypeId ?? ''}
              onChange={(key) => setPickedLeaveTypeId(key)}
              options={allocatableLeaveTypes.map((t) => ({ key: t.id, label: t.name }))}
            />
          </View>
        ) : null}
      </Hero>

      <FlatList
        data={allocations.data ?? []}
        keyExtractor={(item) => item.staffId}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListHeaderComponent={
          leaveTypeId && yearId ? (
            <Card style={styles.bulkCard} flat>
              <View style={styles.bulkIconBadge}>
                <Icon name="flash-outline" size={14} color={semantic.primary} />
              </View>
              <Text style={styles.bulkLabel} numberOfLines={1}>
                Set all
              </Text>
              <Stepper value={bulkDraft} onChange={setBulkDraft} width={40} />
              <Button label="Apply" size="sm" disabled={!bulkValid} loading={bulkApplying} onPress={confirmApplyToAll} />
            </Card>
          ) : null
        }
        ListEmptyComponent={
          allocations.isLoading ? (
            <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
          ) : (
            <EmptyState title="No staff found" />
          )
        }
        renderItem={({ item }) => (
          // Keyed on entitled too: after a successful save the refetched row
          // carries the new entitled value, and remounting is how the row's
          // local draft state picks it up without a setState-in-effect.
          <AllocationRow
            key={`${item.staffId}-${item.entitled}`}
            row={item}
            saving={savingStaffId === item.staffId}
            onSave={(entitled) => handleSave(item, entitled)}
          />
        )}
      />
    </Screen>
  );
}

/** Compact -/value/+ control shared by the bulk-allocate panel and every row's entitled-days field. */
function Stepper({ value, onChange, width = 48 }: { value: string; onChange: (next: string) => void; width?: number }) {
  const parsed = Number(value);
  const valid = value.trim() !== '' && !Number.isNaN(parsed);

  function bump(delta: number) {
    const base = valid ? parsed : 0;
    onChange(String(Math.max(0, base + delta)));
  }

  return (
    <View style={styles.stepper}>
      <Pressable accessibilityRole="button" accessibilityLabel="Decrease days" hitSlop={8} onPress={() => bump(-1)} style={styles.stepperBtn}>
        <Icon name="remove" size={15} color={semantic.primary} />
      </Pressable>
      <TextField value={value} onChangeText={onChange} keyboardType="numeric" style={[styles.stepperInput, { width }]} />
      <Pressable accessibilityRole="button" accessibilityLabel="Increase days" hitSlop={8} onPress={() => bump(1)} style={styles.stepperBtn}>
        <Icon name="add" size={15} color={semantic.primary} />
      </Pressable>
    </View>
  );
}

function AllocationRow({
  row,
  saving,
  onSave,
}: {
  row: LeaveAllocationRow;
  saving: boolean;
  onSave: (entitled: number) => void;
}) {
  const [draft, setDraft] = useState(String(row.entitled));

  const parsed = Number(draft);
  const isValidNumber = draft.trim() !== '' && !Number.isNaN(parsed) && parsed >= 0;
  // Not just "value changed": an unallocated row's field is pre-filled with
  // the leave type's default entitlement, which is very often the number
  // the admin actually wants — comparing only against row.entitled would
  // leave Save permanently disabled if they never edit that pre-filled
  // value, so nothing gets persisted even though the screen looks "set."
  const dirty = isValidNumber && (!row.allocated || parsed !== row.entitled);

  const entitledForBar = isValidNumber ? parsed : row.entitled;
  const pct = entitledForBar > 0 ? Math.min(100, Math.round((row.used / entitledForBar) * 100)) : 0;
  const remaining = Math.max(0, entitledForBar - row.used);
  const fillColor = pct >= 100 ? colors.error : pct >= 75 ? colors.warning : colors.success;

  return (
    <Card flat style={styles.row}>
      <View style={styles.rowTop}>
        <View>
          <Avatar name={row.staffName} size={36} />
          {!row.allocated ? <View style={styles.unsavedDot} /> : null}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }} numberOfLines={1}>
            {row.staffName}
          </Text>
          <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
            {row.used} used · {remaining} remaining
          </Text>
        </View>
        <TextField value={draft} onChangeText={setDraft} keyboardType="numeric" style={styles.rowInput} />
        <Button
          label=""
          icon="checkmark"
          accessibilityLabel={`Save ${row.staffName}'s entitled days`}
          variant={dirty ? 'primary' : 'ghost'}
          size="sm"
          disabled={!dirty}
          loading={saving}
          onPress={() => onSave(parsed)}
        />
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: fillColor }]} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  chipActive: { backgroundColor: colors.white },
  chipLabel: { ...typography.captionStrong, color: colors.white },
  chipLabelActive: { color: semantic.primary },

  bulkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: semantic.primaryMuted,
    borderWidth: 1,
    borderColor: colors.gold300,
  },
  bulkIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkLabel: { ...typography.bodyStrong, color: semantic.textPrimary, flex: 1 },

  row: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowInput: { width: 56, textAlign: 'center', paddingHorizontal: spacing.xs, minHeight: 36, paddingVertical: 0 },
  unsavedDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.warning,
    borderWidth: 1.5,
    borderColor: semantic.surface,
  },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  stepperBtn: {
    width: 26,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperInput: { textAlign: 'center', paddingHorizontal: 2, minHeight: 32, paddingVertical: 0 },

  progressTrack: { height: 6, borderRadius: radius.pill, backgroundColor: semantic.surfaceAlt, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill },
});
