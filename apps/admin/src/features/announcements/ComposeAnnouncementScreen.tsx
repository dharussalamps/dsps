import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, DateField, Hero, HeroDoodle, Icon, type IconName, Screen, ScreenHeader, SectionHeader, TextField, TimeField } from '@/components';
import { useClasses } from '@/features/students/hooks';
import { listStaff, type StaffSummary } from '@/features/staff/api';
import { useConfirmDiscardOnLeave } from '@/hooks/useConfirmDiscardOnLeave';
import { supabase } from '@/lib/supabase';
import { formatDMYInput, parseDMY, toDMY } from '@/lib/date';
import type { RootStackParamList } from '@/navigation/types';
import { colors, radius, spacing, typography, semantic } from '@/theme/tokens';
import { composeAnnouncement, updateAnnouncement, type AudienceType } from './api';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ComposeAnnouncement'>;

/** Only what the form displays/submits for a picked recipient — a search result (a full
 * StaffSummary) satisfies this structurally. Mirrors EventForm's ResponsibleRef. */
type StaffRef = Pick<StaffSummary, 'id' | 'fullName'>;

const audienceConfig: Record<AudienceType, { label: string; icon: IconName; hint: string }> = {
  all_staff: { label: 'Whole school', icon: 'school-outline', hint: 'Every active staff member.' },
  section: { label: 'A section', icon: 'layers-outline', hint: 'Staff scoped to the grade(s) you pick.' },
  class: { label: 'A class', icon: 'easel-outline', hint: 'The class teacher(s) for the class(es) you pick.' },
  individuals: { label: 'Specific staff', icon: 'person-outline', hint: 'Only the people you pick below.' },
};

export function ComposeAnnouncementScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const editing = params?.editing;
  const [title, setTitle] = useState(editing?.title ?? '');
  const [body, setBody] = useState(editing?.body ?? '');
  const [audience, setAudience] = useState<AudienceType>('all_staff');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [classFilter, setClassFilter] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<StaffRef[]>([]);
  const [staffQuery, setStaffQuery] = useState('');
  const [staffResults, setStaffResults] = useState<StaffSummary[]>([]);
  const [priority, setPriority] = useState((editing?.priority ?? 0) > 0);
  const [scheduling, setScheduling] = useState(false);
  const [publishDate, setPublishDate] = useState('');
  const [publishTime, setPublishTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dirty = editing
    ? title !== editing.title || body !== editing.body || (priority ? 1 : 0) !== editing.priority
    : !!title.trim() || !!body.trim();
  const { bypassNextLeave } = useConfirmDiscardOnLeave(dirty);
  const queryClient = useQueryClient();

  const classes = useClasses();
  const grades = useQuery({
    queryKey: ['grades', 'all'],
    queryFn: async () => {
      const { data, error: gErr } = await supabase.from('grades').select('id, number, name').order('number');
      if (gErr) throw gErr;
      return data ?? [];
    },
    enabled: audience === 'section',
  });

  function toggleId(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function searchStaff(q: string) {
    setStaffQuery(q);
    if (!q.trim()) {
      setStaffResults([]);
      return;
    }
    const results = await listStaff(q);
    setStaffResults(results.filter((s) => s.status === 'active'));
  }

  function addStaff(s: StaffRef) {
    setSelectedStaff((prev) => (prev.some((r) => r.id === s.id) ? prev : [...prev, s]));
    setStaffQuery('');
    setStaffResults([]);
  }

  function removeStaff(id: string) {
    setSelectedStaff((prev) => prev.filter((r) => r.id !== id));
  }

  const filteredClasses = (classes.data ?? []).filter((c) => c.name.toLowerCase().includes(classFilter.trim().toLowerCase()));

  const recipientCount = audience === 'individuals' ? selectedStaff.length : selectedIds.length;
  const audienceSummary =
    audience === 'all_staff'
      ? 'Sending to the whole school'
      : recipientCount === 0
        ? 'Choose who receives this below'
        : audience === 'section'
          ? `Sending to ${recipientCount} section${recipientCount === 1 ? '' : 's'}`
          : audience === 'class'
            ? `Sending to ${recipientCount} class${recipientCount === 1 ? '' : 'es'}`
            : `Sending to ${recipientCount} staff member${recipientCount === 1 ? '' : 's'}`;

  async function submit() {
    setError(null);
    if (!title.trim() || !body.trim()) {
      setError('Title and message are required.');
      return;
    }

    if (editing) {
      setSubmitting(true);
      try {
        await updateAnnouncement({ id: editing.id, title: title.trim(), body: body.trim(), priority: priority ? 1 : 0 });
        await queryClient.invalidateQueries({ queryKey: ['announcements'] });
        bypassNextLeave();
        navigation.goBack();
      } catch (err: unknown) {
        const message = (err as { message?: string })?.message ?? '';
        setError(
          message.includes('edit_window_expired')
            ? 'The 15-minute edit window for this announcement has passed.'
            : message.includes('forbidden')
              ? 'You can only edit your own announcements.'
              : 'Could not save your changes.',
        );
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const audienceIds = audience === 'individuals' ? selectedStaff.map((s) => s.id) : selectedIds;
    if (audience !== 'all_staff' && audienceIds.length === 0) {
      setError('Choose at least one recipient.');
      return;
    }
    let publishAt: string | undefined;
    if (scheduling && publishDate.trim()) {
      const isoPublishDate = parseDMY(publishDate);
      if (!isoPublishDate) {
        setError('Pick a valid scheduled date.');
        return;
      }
      const parsed = new Date(`${isoPublishDate}T${publishTime.trim() || '00:00'}:00`);
      if (Number.isNaN(parsed.getTime())) {
        setError('Pick a valid scheduled time.');
        return;
      }
      publishAt = parsed.toISOString();
    }

    setSubmitting(true);
    try {
      await composeAnnouncement({
        title: title.trim(),
        body: body.trim(),
        audience,
        audienceIds,
        priority: priority ? 1 : 0,
        publishAt,
      });
      await queryClient.invalidateQueries({ queryKey: ['announcements'] });
      bypassNextLeave();
      navigation.goBack();
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? '';
      setError(
        message.includes('rate_limited')
          ? "You've published a lot of announcements in the last hour — try again shortly."
          : 'Could not publish this announcement.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="megaphone-outline" bottomIcon="chatbubble-ellipses-outline" />
        <ScreenHeader
          title={editing ? 'Edit announcement' : 'New announcement'}
          subtitle={editing ? 'Fix a typo or detail — within 15 minutes of posting' : 'Reach the people who need to know'}
          tone="onPrimary"
          back={navigation.canGoBack()}
          hideBell
        />
      </Hero>
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
      <Card style={{ gap: spacing.lg }}>
        <View style={{ gap: spacing.md }}>
          <TextField label="Title" placeholder="e.g. Sports Day rescheduled" value={title} onChangeText={setTitle} />
          <TextField label="Message" placeholder="What do they need to know?" value={body} onChangeText={setBody} multiline />
        </View>

        {editing ? (
          <View style={styles.noticeCard}>
            <Icon name="information-circle-outline" size={16} color={semantic.primary} />
            <Text style={{ ...typography.caption, color: semantic.textSecondary, flex: 1 }}>
              The audience and schedule can&apos;t be changed after posting — only the title, message, and priority, and only within 15 minutes of posting.
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            <SectionHeader icon="people-outline" label="AUDIENCE" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {(Object.keys(audienceConfig) as AudienceType[]).map((a) => (
                <Button
                  key={a}
                  label={audienceConfig[a].label}
                  icon={audienceConfig[a].icon}
                  size="sm"
                  variant={audience === a ? 'primary' : 'outline'}
                  onPress={() => {
                    setAudience(a);
                    setSelectedIds([]);
                    setClassFilter('');
                    setSelectedStaff([]);
                    setStaffQuery('');
                    setStaffResults([]);
                  }}
                />
              ))}
            </View>
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{audienceConfig[audience].hint}</Text>

            {audience === 'section' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs }}>
                {(grades.data ?? []).map((g) => (
                  <Button key={g.id} label={g.name} size="sm" variant={selectedIds.includes(g.id) ? 'primary' : 'outline'} onPress={() => toggleId(g.id)} />
                ))}
              </View>
            ) : null}

            {audience === 'class' ? (
              <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
                {selectedIds.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                    {selectedIds.map((id) => {
                      const c = (classes.data ?? []).find((x) => x.id === id);
                      if (!c) return null;
                      return (
                        <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                          <View style={styles.chip}>
                            <Icon name="easel-outline" size={13} color={semantic.primary} />
                            <Text style={styles.chipText}>{c.name}</Text>
                          </View>
                          <Button label="" accessibilityLabel={`Remove ${c.name}`} icon="close" size="sm" variant="ghost" onPress={() => toggleId(id)} />
                        </View>
                      );
                    })}
                  </View>
                ) : null}
                <TextField label="Filter classes" placeholder="e.g. Grade 6" value={classFilter} onChangeText={setClassFilter} onClear={() => setClassFilter('')} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, maxHeight: 180 }}>
                  {filteredClasses.map((c) => (
                    <Button key={c.id} label={c.name} size="sm" variant={selectedIds.includes(c.id) ? 'primary' : 'outline'} onPress={() => toggleId(c.id)} />
                  ))}
                  {filteredClasses.length === 0 ? (
                    <Text style={{ ...typography.caption, color: semantic.textSecondary }}>No classes match &ldquo;{classFilter}&rdquo;.</Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {audience === 'individuals' ? (
              <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
                {selectedStaff.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                    {selectedStaff.map((s) => (
                      <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                        <View style={styles.chip}>
                          <Icon name="person-outline" size={13} color={semantic.primary} />
                          <Text style={styles.chipText}>{s.fullName}</Text>
                        </View>
                        <Button label="" accessibilityLabel={`Remove ${s.fullName}`} icon="close" size="sm" variant="ghost" onPress={() => removeStaff(s.id)} />
                      </View>
                    ))}
                  </View>
                ) : null}
                <TextField label="Add staff (search by name)" placeholder="Start typing a name…" value={staffQuery} onChangeText={(v) => void searchStaff(v)} onClear={() => void searchStaff('')} />
                {staffQuery ? (
                  staffResults.filter((s) => !selectedStaff.some((r) => r.id === s.id)).length > 0 ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                      {staffResults
                        .filter((s) => !selectedStaff.some((r) => r.id === s.id))
                        .map((s) => (
                          <Button key={s.id} label={s.fullName} size="sm" variant="outline" onPress={() => addStaff({ id: s.id, fullName: s.fullName })} />
                        ))}
                    </View>
                  ) : (
                    <Text style={{ ...typography.caption, color: semantic.textSecondary }}>No staff match &ldquo;{staffQuery}&rdquo;.</Text>
                  )
                ) : null}
              </View>
            ) : null}
          </View>
        )}

        <View style={{ gap: spacing.sm }}>
          <SectionHeader icon="options-outline" label="OPTIONS" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            <Button
              label={priority ? 'High priority' : 'Mark high priority'}
              icon="flag"
              size="sm"
              variant={priority ? 'danger' : 'outline'}
              onPress={() => setPriority((v) => !v)}
            />
            {editing ? null : (
              <Button
                label={scheduling ? 'Publish now instead' : 'Schedule for later'}
                icon="time-outline"
                size="sm"
                variant={scheduling ? 'primary' : 'outline'}
                onPress={() => setScheduling((v) => !v)}
              />
            )}
          </View>
          {!editing && scheduling ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
              <View style={{ flex: 2 }}>
                <DateField
                  label="Date"
                  value={publishDate}
                  onChangeText={(t) => setPublishDate(formatDMYInput(t))}
                  onPickIso={(iso) => setPublishDate(toDMY(iso))}
                  minDate={new Date().toISOString().slice(0, 10)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TimeField label="Time" value={publishTime} onChange={setPublishTime} />
              </View>
            </View>
          ) : null}
        </View>

        {!editing ? (
          <View style={styles.summaryRow}>
            <Icon name="paper-plane-outline" size={15} color={semantic.primary} />
            <Text style={{ ...typography.captionStrong, color: semantic.primary, flex: 1 }}>{audienceSummary}</Text>
            {priority ? <Icon name="flag" size={14} color={colors.error} /> : null}
          </View>
        ) : null}

        {error ? <Text style={{ ...typography.caption, color: colors.error }}>{error}</Text> : null}
        <Button
          label={editing ? 'Save changes' : scheduling ? 'Schedule' : 'Publish'}
          icon={editing ? 'checkmark' : scheduling ? 'time-outline' : 'send'}
          onPress={() => void submit()}
          loading={submitting}
          disabled={editing ? !dirty : false}
        />
      </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: semantic.primaryMuted,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipText: { ...typography.captionStrong, color: semantic.primary },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: semantic.primaryMuted,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: semantic.primaryMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
