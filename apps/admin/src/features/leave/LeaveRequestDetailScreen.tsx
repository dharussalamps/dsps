import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar, Button, Card, Hero, HeroDoodle, Icon, type IconName, Screen, ScreenHeader, SectionHeader, StatusPill, TextField } from '@/components';
import { useStaffDirectory } from '@/features/staff/hooks';
import { useConfirmDiscardOnLeave } from '@/hooks/useConfirmDiscardOnLeave';
import type { RootStackParamList } from '@/navigation/types';
import { colors, elevation, radius, spacing, typography, semantic } from '@/theme/tokens';
import { approveLeave, MATERNITY_PHASE_LABEL, RECLASSIFIABLE_LEAVE_KEYS, rejectLeave, type LeaveRequestDetail } from './api';
import { useLeaveRequestDetail, useLeaveTypeBalance, useLeaveTypes } from './hooks';
import { leaveTypeIcon, LeaveBalanceCard } from './LeaveDisplay';

type CoverTeacher = { staffId: string; fullName: string };

type Route = RouteProp<RootStackParamList, 'LeaveRequestDetail'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

type RecommendationTone = 'success' | 'warning' | 'error';
type Recommendation = { tone: RecommendationTone; icon: IconName; title: string; reasons: string[] };

/**
 * A plain-language verdict for the approver, built from exactly the signals
 * already shown on this screen (balance, same-dates overlap, cover
 * arrangement) — not a new data source, just a synthesis of them so the
 * principal doesn't have to cross-reference three cards themselves before
 * deciding. Purely advisory: it never blocks Approve, it only explains what
 * to look at first.
 */
function buildRecommendation(d: LeaveRequestDetail, coverArranged: boolean): Recommendation {
  const reasons: string[] = [];
  let tone: RecommendationTone = 'success';

  if (d.balance) {
    const remaining = d.balance.entitled - d.balance.used;
    if (d.dayCount > remaining) {
      tone = 'error';
      reasons.push(
        remaining <= 0
          ? `No ${d.leaveTypeName} balance remains for ${d.staffName}.`
          : `This needs ${d.dayCount} day${d.dayCount === 1 ? '' : 's'}, but only ${remaining} remain${remaining === 1 ? 's' : ''}.`,
      );
    }
  }

  const overlapCount = d.overlappingStaff?.length ?? 0;
  if (overlapCount >= 3) {
    if (tone === 'success') tone = 'warning';
    reasons.push(`${overlapCount} other staff are already away on these dates.`);
  }

  if (d.requiresCover && !coverArranged) {
    if (tone === 'success') tone = 'warning';
    reasons.push('No cover teacher has been chosen yet for this class.');
  }

  if (reasons.length === 0) {
    reasons.push(
      d.requiresCover
        ? 'Balance is sufficient, staffing looks fine, and cover is arranged.'
        : 'Balance is sufficient and staffing looks fine for these dates.',
    );
  }

  const title = tone === 'error' ? 'Needs attention before approving' : tone === 'warning' ? 'Worth a second look' : 'Looks safe to approve';
  const icon: IconName = tone === 'error' ? 'alert-circle' : tone === 'warning' ? 'warning-outline' : 'checkmark-circle-outline';
  return { tone, icon, title, reasons };
}

const RECOMMEND_TONE: Record<RecommendationTone, { bg: string; fg: string }> = {
  success: { bg: colors.successBg, fg: colors.success },
  warning: { bg: colors.warningBg, fg: colors.warning },
  error: { bg: colors.errorBg, fg: colors.error },
};

function RecommendationBanner({ recommendation }: { recommendation: Recommendation }) {
  const tone = RECOMMEND_TONE[recommendation.tone];
  return (
    <View style={[styles.recommendCard, { backgroundColor: tone.bg, borderColor: tone.fg }]}>
      <View style={styles.recommendHeader}>
        <Icon name={recommendation.icon} size={20} color={tone.fg} />
        <Text style={[styles.recommendTitle, { color: tone.fg }]}>{recommendation.title}</Text>
      </View>
      {recommendation.reasons.map((reason) => (
        <Text key={reason} style={[styles.recommendReason, { color: tone.fg }]}>
          •  {reason}
        </Text>
      ))}
    </View>
  );
}

/**
 * Tap-to-change leave type, folded into the top summary card instead of its
 * own section — a school day approving a dozen requests shouldn't need a
 * whole extra card per request just to occasionally reclassify one. Only
 * rendered when the requested type is reclassifiable (see
 * RECLASSIFIABLE_LEAVE_KEYS); the popup itself only ever offers the other
 * reclassifiable types as alternatives.
 */
function LeaveTypeRow({
  effectiveType,
  originalName,
  isReassigned,
  options,
  onSelect,
}: {
  effectiveType: { id: string; key: string; name: string };
  originalName: string;
  isReassigned: boolean;
  options: { id: string; key: string; name: string }[];
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={typeRowStyles.trigger}>
        <View style={typeRowStyles.iconWrap}>
          <Icon name={leaveTypeIcon(effectiveType.key)} size={13} color={semantic.primary} />
        </View>
        <Text style={typeRowStyles.label} numberOfLines={1}>
          {effectiveType.name}
        </Text>
        {isReassigned ? <StatusPill label="Changed" tone="gold" /> : null}
        <Icon name="chevron-down" size={14} color={semantic.textSecondary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={pickerStyles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={pickerStyles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={pickerStyles.sheetTitle}>Change leave type</Text>
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>Originally requested as {originalName}.</Text>
            {options.map((t) => {
              const isSelected = t.id === effectiveType.id;
              return (
                <Pressable
                  key={t.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    onSelect(t.id);
                    setOpen(false);
                  }}
                  style={[pickerStyles.row, isSelected && pickerStyles.rowSelected]}
                >
                  <View style={[typeRowStyles.rowIconWrap, isSelected && typeRowStyles.rowIconWrapSelected]}>
                    <Icon name={leaveTypeIcon(t.key)} size={16} color={isSelected ? colors.white : semantic.primary} />
                  </View>
                  <Text style={[pickerStyles.rowLabel, isSelected && pickerStyles.rowLabelSelected, { flex: 1 }]}>{t.name}</Text>
                  {isSelected ? <Icon name="checkmark" size={16} color={semantic.primary} /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/**
 * A searchable modal picker for the cover teacher, instead of dumping every
 * active staff member onto the card as a wrapped row of buttons — that
 * doesn't scale once a school has more than a couple dozen staff. Reuses
 * the same server-side name/staff-number search (useStaffDirectory) as the
 * Staff Directory screen, so typing a few letters narrows a hundred-teacher
 * list down instantly instead of requiring a scroll-and-hunt.
 */
function CoverTeacherPicker({ excludeStaffId, value, onChange }: { excludeStaffId: string; value: CoverTeacher | null; onChange: (v: CoverTeacher | null) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const search = useStaffDirectory(query);
  const results = (search.data ?? []).filter((s) => s.status === 'active' && s.id !== excludeStaffId);

  function close() {
    setOpen(false);
    setQuery('');
  }

  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={pickerStyles.trigger}>
        {value ? (
          <Avatar name={value.fullName} size={26} />
        ) : (
          <View style={pickerStyles.triggerIconWrap}>
            <Icon name="person-add-outline" size={15} color={semantic.primary} />
          </View>
        )}
        <Text style={[pickerStyles.triggerLabel, !value && pickerStyles.triggerPlaceholder]} numberOfLines={1}>
          {value ? value.fullName : 'Select cover teacher'}
        </Text>
        <Icon name="chevron-down" size={16} color={semantic.textSecondary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={pickerStyles.backdrop} onPress={close}>
          <Pressable style={pickerStyles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={pickerStyles.sheetTitle}>Select cover teacher</Text>

            <View style={pickerStyles.searchRow}>
              <Icon name="search-outline" size={16} color={semantic.textSecondary} />
              <TextInput
                style={pickerStyles.searchInput}
                placeholder="Search by name or staff number"
                placeholderTextColor={colors.ink300}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoFocus
              />
              {query.length > 0 ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery('')}>
                  <Icon name="close-circle" size={16} color={colors.ink300} />
                </Pressable>
              ) : null}
            </View>

            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              style={pickerStyles.list}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                search.isLoading ? (
                  <ActivityIndicator color={semantic.primary} style={{ marginVertical: spacing.lg }} />
                ) : (
                  <Text style={pickerStyles.emptyText}>No staff found.</Text>
                )
              }
              renderItem={({ item }) => {
                const isSelected = item.id === value?.staffId;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => {
                      onChange({ staffId: item.id, fullName: item.fullName });
                      close();
                    }}
                    style={[pickerStyles.row, isSelected && pickerStyles.rowSelected]}
                  >
                    <Avatar name={item.fullName} size={30} />
                    <View style={{ flex: 1 }}>
                      <Text style={[pickerStyles.rowLabel, isSelected && pickerStyles.rowLabelSelected]} numberOfLines={1}>
                        {item.fullName}
                      </Text>
                      <Text style={pickerStyles.rowSub} numberOfLines={1}>
                        {item.staffNo}
                      </Text>
                    </View>
                    {isSelected ? <Icon name="checkmark" size={16} color={semantic.primary} /> : null}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export function LeaveRequestDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const detail = useLeaveRequestDetail(params.requestId);
  const queryClient = useQueryClient();
  const leaveTypes = useLeaveTypes();

  const [selectedCover, setSelectedCover] = useState<CoverTeacher | null>(null);
  const [coverNotNeeded, setCoverNotNeeded] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [reassignTypeId, setReassignTypeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { bypassNextLeave } = useConfirmDiscardOnLeave(!!selectedCover || coverNotNeeded || !!remarks.trim() || reassignTypeId !== null);
  const reassignedBalance = useLeaveTypeBalance(detail.data?.staffId, reassignTypeId ?? undefined);

  if (detail.isLoading) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero style={{ overflow: 'hidden' }}>
          <HeroDoodle topIcon="airplane-outline" bottomIcon="calendar-outline" />
          <ScreenHeader title="Leave request" tone="onPrimary" back={navigation.canGoBack()} hideBell />
        </Hero>
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      </Screen>
    );
  }
  if (!detail.data) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero style={{ overflow: 'hidden' }}>
          <HeroDoodle topIcon="airplane-outline" bottomIcon="calendar-outline" />
          <ScreenHeader title="Leave request" tone="onPrimary" back={navigation.canGoBack()} hideBell />
        </Hero>
        <Text style={{ ...typography.body, color: semantic.textSecondary, padding: spacing.lg }}>Request not found.</Text>
      </Screen>
    );
  }

  const d = detail.data;
  const coverArranged = !d.requiresCover || !!selectedCover || coverNotNeeded;

  // Reclassification: the principal may reassign a pending Casual/Medical/
  // Duty request into one of the other two at approval time (see
  // RECLASSIFIABLE_LEAVE_KEYS) — the request's own balance/day-count don't
  // change, only which leave type's balance it draws down.
  const isReassigned = reassignTypeId !== null;
  const canReclassify = RECLASSIFIABLE_LEAVE_KEYS.includes(d.leaveTypeKey);
  const reclassifyOptions = (leaveTypes.data ?? []).filter((t) => RECLASSIFIABLE_LEAVE_KEYS.includes(t.key));
  const effectiveType = (isReassigned && reclassifyOptions.find((t) => t.id === reassignTypeId)) || {
    id: d.leaveTypeId,
    key: d.leaveTypeKey,
    name: d.leaveTypeName,
  };
  const effectiveBalance = isReassigned ? (reassignedBalance.data ?? null) : d.balance;
  const effectiveBalanceLoading = isReassigned && reassignedBalance.isLoading;

  const recommendation = buildRecommendation({ ...d, balance: effectiveBalance, leaveTypeName: effectiveType.name }, coverArranged);
  const balanceForCard = effectiveBalance
    ? { leaveTypeId: effectiveType.id, leaveTypeKey: effectiveType.key, leaveTypeName: effectiveType.name, entitled: effectiveBalance.entitled, used: effectiveBalance.used }
    : null;
  const onBehalf = d.requestedBy !== d.staffId;
  const overlapList = d.overlappingStaff ?? [];
  const visibleOverlap = overlapList.slice(0, 5);
  const extraOverlap = overlapList.length - visibleOverlap.length;
  const typeLabel = d.maternityPhase ? `${d.leaveTypeName} · ${MATERNITY_PHASE_LABEL[d.maternityPhase]}` : d.leaveTypeName;

  async function approve() {
    setError(null);
    setBusy(true);
    try {
      await approveLeave(d!.id, selectedCover?.staffId ?? null, coverNotNeeded, remarks, isReassigned ? effectiveType.id : undefined);
      await queryClient.invalidateQueries({ queryKey: ['leave'] });
      // Skips useConfirmDiscardOnLeave's own "Discard changes?" prompt for
      // this goBack() — the cover/remarks fields are still non-empty at this
      // point (their state hasn't re-rendered yet), but the approval already
      // saved, so there's nothing to warn about discarding.
      bypassNextLeave();
      navigation.goBack();
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? '';
      if (message.includes('cover_required')) {
        setError('This teacher has their own class. Choose a cover teacher, or confirm none is needed.');
      } else {
        setError('Could not approve this request.');
      }
    } finally {
      setBusy(false);
    }
  }

  function confirmApprove() {
    const coverNote = !d.requiresCover
      ? ''
      : selectedCover
        ? ` ${selectedCover.fullName} will be assigned to cover the class.`
        : ' No cover teacher will be assigned for this class.';
    const typeNote = isReassigned ? ` It will be approved as ${effectiveType.name}, not the originally requested ${d.leaveTypeName}.` : '';
    Alert.alert(
      'Approve this leave request?',
      `${d.staffName}'s ${typeLabel} from ${d.startsOn} to ${d.endsOn} (${d.halfDay ? 'half day' : `${d.dayCount} day${d.dayCount === 1 ? '' : 's'}`}) will be approved.${typeNote}${coverNote}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => void approve() },
      ],
    );
  }

  function confirmReject() {
    Alert.alert(
      'Reject this leave request?',
      `${d.staffName}'s ${typeLabel} from ${d.startsOn} to ${d.endsOn} will be rejected.${remarks.trim() ? ` They'll see your remarks: "${remarks.trim()}"` : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: () => void reject() },
      ],
    );
  }

  async function reject() {
    setBusy(true);
    try {
      await rejectLeave(d!.id, remarks);
      await queryClient.invalidateQueries({ queryKey: ['leave'] });
      bypassNextLeave();
      navigation.goBack();
    } catch {
      setError('Could not reject this request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="airplane-outline" bottomIcon="calendar-outline" />
        <ScreenHeader title={d.staffName} subtitle={typeLabel} tone="onPrimary" back={navigation.canGoBack()} hideBell>
          <StatusPill label={d.status} tone={d.status === 'pending' ? 'warning' : 'neutral'} />
        </ScreenHeader>

        <View style={styles.heroSummaryRow}>
          <Avatar name={d.staffName} size={34} tone="onPrimary" />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroDates} numberOfLines={1}>
              {d.startsOn} → {d.endsOn}
            </Text>
          </View>
          <View style={styles.heroDayBadge}>
            <Icon name="calendar-clear-outline" size={11} color={semantic.primary} />
            <Text style={styles.heroDayBadgeText}>{d.halfDay ? '½ day' : `${d.dayCount}d`}</Text>
          </View>
        </View>
      </Hero>
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Icon name="chatbox-ellipses-outline" size={14} color={semantic.textSecondary} />
            <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>REASON</Text>
          </View>
          {canReclassify && d.status === 'pending' ? (
            <LeaveTypeRow
              effectiveType={effectiveType}
              originalName={d.leaveTypeName}
              isReassigned={isReassigned}
              options={reclassifyOptions}
              onSelect={(id) => setReassignTypeId(id === d.leaveTypeId ? null : id)}
            />
          ) : null}
        </View>
        <Text style={{ ...typography.body, color: semantic.textPrimary }}>{d.reason}</Text>
        <StatusPill label={onBehalf ? `Filed by ${d.requestedByName}` : 'Self-requested'} tone={onBehalf ? 'gold' : 'neutral'} />
      </Card>

      {d.status === 'pending' ? (
        <>
          <RecommendationBanner recommendation={recommendation} />

          <View style={{ gap: spacing.sm }}>
            <SectionHeader icon="wallet-outline" label={isReassigned ? `${effectiveType.name.toUpperCase()} BALANCE` : 'LEAVE BALANCE'} />
            {effectiveBalanceLoading ? (
              <Card flat>
                <ActivityIndicator color={semantic.primary} />
              </Card>
            ) : balanceForCard ? (
              <LeaveBalanceCard balance={balanceForCard} />
            ) : (
              <Card flat>
                <Text style={{ ...typography.body, color: semantic.textSecondary }}>No {effectiveType.name} balance on record for this year.</Text>
              </Card>
            )}
          </View>

          <View style={{ gap: spacing.sm }}>
            <SectionHeader icon="people-outline" label="STAFF ALSO ON LEAVE THESE DATES" />
            <Card flat>
              {overlapList.length === 0 ? (
                <Text style={{ ...typography.body, color: semantic.textSecondary }}>No other staff on leave for these dates.</Text>
              ) : (
                <View style={{ gap: spacing.sm }}>
                  {visibleOverlap.map((s) => (
                    <View key={s.staffId} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Avatar name={s.fullName} size={28} />
                      <Text style={{ ...typography.body, color: semantic.textPrimary }} numberOfLines={1}>
                        {s.fullName}
                      </Text>
                    </View>
                  ))}
                  {extraOverlap > 0 ? (
                    <Text style={{ ...typography.caption, color: semantic.textSecondary }}>+{extraOverlap} more away too</Text>
                  ) : null}
                </View>
              )}
            </Card>
          </View>

          {d.requiresCover ? (
            <View style={{ gap: spacing.sm }}>
              <SectionHeader icon="person-add-outline" label="COVER TEACHER" />
              <Card flat style={{ gap: spacing.sm }}>
                <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
                  {d.staffName} manages a class — choose who covers it, or confirm none is needed.
                </Text>
                <CoverTeacherPicker
                  excludeStaffId={d.staffId}
                  value={selectedCover}
                  onChange={(v) => {
                    setSelectedCover(v);
                    setCoverNotNeeded(false);
                  }}
                />
                <Button
                  label="No cover needed"
                  icon={coverNotNeeded ? 'checkmark' : undefined}
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    setCoverNotNeeded((v) => !v);
                    setSelectedCover(null);
                  }}
                />
              </Card>
            </View>
          ) : null}

          {error ? <Text style={{ ...typography.caption, color: colors.error }}>{error}</Text> : null}

          <View style={{ gap: spacing.sm }}>
            <SectionHeader icon="create-outline" label="YOUR DECISION" />
            <Card>
              <TextField label="Remarks (optional)" value={remarks} onChangeText={setRemarks} multiline />
              {!coverArranged ? (
                <View style={styles.disabledHint}>
                  <Icon name="information-circle-outline" size={15} color={colors.warning} />
                  <Text style={{ ...typography.caption, color: colors.warning, flex: 1 }}>
                    Choose a cover teacher or tick "No cover needed" above before approving.
                  </Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button label="Approve" onPress={confirmApprove} loading={busy} disabled={!coverArranged} style={{ flex: 1 }} />
                <Button label="Reject" variant="danger" onPress={confirmReject} loading={busy} style={{ flex: 1 }} />
              </View>
            </Card>
          </View>
        </>
      ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  heroDates: { ...typography.captionStrong, color: colors.white },
  heroDayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
  },
  heroDayBadgeText: { ...typography.captionStrong, color: semantic.primary },

  recommendCard: { borderRadius: radius.lg, borderWidth: 1.5, padding: spacing.md, gap: 4 },
  recommendHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 2 },
  recommendTitle: { ...typography.bodyStrong },
  recommendReason: { ...typography.caption },

  disabledHint: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});

const typeRowStyles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
  },
  iconWrap: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...typography.captionStrong, color: semantic.primary },
  rowIconWrap: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconWrapSelected: { backgroundColor: semantic.primary },
});

const pickerStyles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
    paddingHorizontal: spacing.md,
  },
  triggerLabel: { ...typography.body, color: semantic.textPrimary, flex: 1 },
  triggerPlaceholder: { color: colors.ink300 },
  triggerIconWrap: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(24,10,13,0.55)', alignItems: 'center', justifyContent: 'center' },
  sheet: {
    width: 340,
    maxWidth: '90%',
    maxHeight: '75%',
    backgroundColor: semantic.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    ...elevation.raised,
  },
  sheetTitle: { ...typography.title, color: semantic.textPrimary },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: semantic.surfaceAlt,
    paddingHorizontal: spacing.sm,
  },
  searchInput: { flex: 1, ...typography.body, color: semantic.textPrimary, paddingVertical: spacing.sm },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semantic.border,
  },
  rowSelected: { backgroundColor: semantic.primaryMuted, borderRadius: radius.md, paddingHorizontal: spacing.sm },
  rowLabel: { ...typography.body, color: semantic.textPrimary },
  rowLabelSelected: { color: semantic.primary, fontWeight: '700' },
  rowSub: { ...typography.caption, color: semantic.textSecondary },
  emptyText: { ...typography.caption, color: semantic.textSecondary, paddingVertical: spacing.md, textAlign: 'center' },
});
