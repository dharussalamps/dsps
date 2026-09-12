import { useNavigation } from '@react-navigation/native';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { Button, CalendarModal, Card, EmptyState, Hero, HeroDoodle, Icon, type IconName, Screen, ScreenHeader, SectionHeader, TextField } from '@/components';
import { listStaff, type StaffSummary } from '@/features/staff/api';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';
import type { AuditEntry } from './api';
import { useAuditEntities, useAuditLog } from './hooks';

type ActionTone = 'success' | 'info' | 'error' | 'neutral';

const actionToneColor: Record<ActionTone, { fg: string; bg: string }> = {
  success: { fg: colors.success, bg: colors.successBg },
  info: { fg: colors.info, bg: colors.infoBg },
  error: { fg: colors.error, bg: colors.errorBg },
  neutral: { fg: colors.ink500, bg: colors.cream100 },
};

function actionMeta(action: string): { icon: IconName; tone: ActionTone } {
  const a = action.toLowerCase();
  if (/(delete|remove|revoke|reject|deactivat)/.test(a)) return { icon: 'trash-outline', tone: 'error' };
  if (/(update|edit|revise|reissue|reset|reopen)/.test(a)) return { icon: 'create-outline', tone: 'info' };
  if (/(insert|create|add|assign|approve|grant|submit|allocate)/.test(a)) return { icon: 'add-circle-outline', tone: 'success' };
  return { icon: 'ellipse-outline', tone: 'neutral' };
}

function entityIcon(entity: string): IconName {
  const e = entity.toLowerCase();
  if (e.includes('student')) return 'school-outline';
  if (e.includes('staff') || e.includes('account')) return 'people-outline';
  if (e.includes('attendance')) return 'checkbox-outline';
  if (e.includes('mark')) return 'ribbon-outline';
  if (e.includes('leave')) return 'airplane-outline';
  if (e.includes('role')) return 'key-outline';
  if (e.includes('announcement')) return 'megaphone-outline';
  if (e.includes('term') || e.includes('calendar')) return 'calendar-outline';
  if (e.includes('grade') || e.includes('class') || e.includes('subject')) return 'layers-outline';
  if (e.includes('guardian')) return 'heart-outline';
  if (e.includes('cover')) return 'swap-horizontal-outline';
  if (e.includes('achievement') || e.includes('membership') || e.includes('benefit')) return 'trophy-outline';
  if (e.includes('inventory')) return 'cube-outline';
  if (e.includes('event') || e.includes('diary')) return 'book-outline';
  if (e.includes('responsibilit')) return 'briefcase-outline';
  if (e.includes('setting')) return 'settings-outline';
  return 'document-text-outline';
}

function formatLabel(raw: string): string {
  return raw
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

const today = () => format(new Date(), 'yyyy-MM-dd');

function DateChip({
  label,
  value,
  onChange,
  maxDate,
  minDate,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxDate?: string;
  minDate?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ flex: 1, gap: spacing.xs }}>
      <Text style={styles.filterLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.dateTrigger, pressed && styles.dateTriggerPressed]}
        >
          <Icon name="calendar-outline" size={15} color={semantic.primary} />
          <Text style={[styles.dateTriggerLabel, !value && styles.dateTriggerPlaceholder]} numberOfLines={1}>
            {value ? format(parseISO(value), 'd MMM yyyy') : 'Any date'}
          </Text>
        </Pressable>
        {value ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label.toLowerCase()}`} hitSlop={8} onPress={() => onChange('')}>
            <Icon name="close-circle" size={18} color={colors.ink300} />
          </Pressable>
        ) : null}
      </View>
      <CalendarModal visible={open} value={value || undefined} onChange={onChange} onClose={() => setOpen(false)} maxDate={maxDate} minDate={minDate} />
    </View>
  );
}

/** FR-ADM-05: "the principal may search the audit log by actor, entity, or date range." */
export function AuditLogScreen() {
  const navigation = useNavigation();
  const [entity, setEntity] = useState<string | null>(null);
  const [actor, setActor] = useState<StaffSummary | null>(null);
  const [actorQuery, setActorQuery] = useState('');
  const [actorResults, setActorResults] = useState<StaffSummary[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const entities = useAuditEntities();
  const audit = useAuditLog({
    entity: entity ?? undefined,
    actorId: actor?.id,
    fromDate: fromDate ? `${fromDate}T00:00:00` : undefined,
    toDate: toDate ? `${toDate}T23:59:59` : undefined,
  });

  async function searchActor(q: string) {
    setActorQuery(q);
    setActor(null);
    setActorResults(q.trim() ? await listStaff(q) : []);
  }

  function clearFilters() {
    setEntity(null);
    setActor(null);
    setActorQuery('');
    setActorResults([]);
    setFromDate('');
    setToDate('');
  }

  const hasFilters = !!entity || !!actor || !!fromDate || !!toDate;

  const filterPanel = showFilters ? (
    <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
      <View style={{ gap: spacing.sm }}>
        <Text style={styles.filterLabel}>ENTITY</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {(entities.data ?? []).map((e) => (
            <Button
              key={e}
              label={formatLabel(e)}
              icon={entityIcon(e)}
              size="sm"
              variant={entity === e ? 'primary' : 'outline'}
              onPress={() => setEntity(entity === e ? null : e)}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={styles.filterLabel}>ACTOR</Text>
        <TextField
          placeholder="Search by name"
          value={actorQuery}
          onChangeText={(v) => void searchActor(v)}
          onClear={actorQuery ? () => { setActorQuery(''); setActor(null); setActorResults([]); } : undefined}
        />
        {actorQuery && !actor ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {actorResults.map((s) => (
              <Button key={s.id} label={s.fullName} icon="person-outline" size="sm" variant="outline" onPress={() => { setActor(s); setActorQuery(s.fullName); }} />
            ))}
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <DateChip label="FROM" value={fromDate} onChange={setFromDate} maxDate={toDate || today()} />
        <DateChip label="TO" value={toDate} onChange={setToDate} minDate={fromDate || undefined} maxDate={today()} />
      </View>

      {hasFilters ? <Button label="Clear filters" icon="close-circle-outline" size="sm" variant="ghost" onPress={clearFilters} /> : null}
    </Card>
  ) : null;

  const sections = useMemo(() => {
    const rows = audit.data ?? [];
    const map = new Map<string, AuditEntry[]>();
    for (const row of rows) {
      const key = format(parseISO(row.createdAt), 'yyyy-MM-dd');
      const bucket = map.get(key);
      if (bucket) bucket.push(row);
      else map.set(key, [row]);
    }
    return Array.from(map.entries()).map(([key, data]) => {
      const date = parseISO(key);
      const title = isToday(date) ? 'Today' : isYesterday(date) ? 'Yesterday' : format(date, 'EEEE, d MMM yyyy');
      return { key, title, data };
    });
  }, [audit.data]);

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="key-outline" bottomIcon="shield-checkmark-outline" />
        <ScreenHeader
          title="Audit log"
          subtitle={`${audit.data?.length ?? 0} entries${hasFilters ? ' (filtered)' : ''}`}
          tone="onPrimary"
          back={navigation.canGoBack()}
          hideBell
        >
          <Button label={showFilters ? 'Hide' : 'Filters'} icon="filter-outline" size="sm" variant="secondary" onPress={() => setShowFilters((v) => !v)} />
        </ScreenHeader>
      </Hero>

      {audit.isLoading ? (
        <View style={{ padding: spacing.lg }}>
          {filterPanel}
          <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.xs }}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={filterPanel}
          ListEmptyComponent={
            <EmptyState icon="time-outline" title="No audit entries" message={hasFilters ? 'Try widening your filters.' : 'Changes to records will appear here.'} />
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeaderWrap}>
              <SectionHeader icon="calendar-outline" label={section.title.toUpperCase()} accessory={<Text style={styles.sectionCount}>{section.data.length}</Text>} />
            </View>
          )}
          renderItem={({ item }) => {
            const meta = actionMeta(item.action);
            const tone = actionToneColor[meta.tone];
            return (
              <Card flat style={styles.entryCard}>
                <View style={[styles.entryIconChip, { backgroundColor: tone.bg }]}>
                  <Icon name={meta.icon} size={13} color={tone.fg} />
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm }}>
                    <Text style={{ ...typography.bodyStrong, fontSize: 13, color: semantic.textPrimary, flex: 1 }} numberOfLines={1}>
                      {formatLabel(item.action)} · {formatLabel(item.entity)}
                    </Text>
                    <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{format(parseISO(item.createdAt), 'h:mm a')}</Text>
                  </View>
                  <Text style={{ ...typography.caption, color: semantic.textSecondary }} numberOfLines={1}>
                    {item.actorName ?? 'System'}
                    {item.reason ? `  ·  ${item.reason}` : ''}
                  </Text>
                </View>
              </Card>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterLabel: { ...typography.captionStrong, color: semantic.textSecondary, letterSpacing: 0.4 },
  dateTrigger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
    paddingHorizontal: spacing.md,
  },
  dateTriggerPressed: { backgroundColor: semantic.surfaceAlt },
  dateTriggerLabel: { ...typography.body, color: semantic.textPrimary, flex: 1 },
  dateTriggerPlaceholder: { color: colors.ink300 },
  sectionHeaderWrap: { paddingBottom: spacing.xs, paddingTop: 2 },
  sectionCount: { ...typography.captionStrong, color: semantic.textSecondary },
  entryCard: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  entryIconChip: { width: 26, height: 26, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
