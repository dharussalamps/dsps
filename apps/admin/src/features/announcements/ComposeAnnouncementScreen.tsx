import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Text, View } from 'react-native';
import { Button, Card, Hero, Screen, ScreenHeader, TextField } from '@/components';
import { useClasses } from '@/features/students/hooks';
import { supabase } from '@/lib/supabase';
import { parseDMY } from '@/lib/date';
import type { RootStackParamList } from '@/navigation/types';
import { spacing, typography, semantic } from '@/theme/tokens';
import { composeAnnouncement, type AudienceType } from './api';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const audienceLabels: Record<AudienceType, string> = {
  all_staff: 'Whole school',
  section: 'A section (grade)',
  class: 'A class',
  individuals: 'Specific staff',
};

export function ComposeAnnouncementScreen() {
  const navigation = useNavigation<Nav>();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AudienceType>('all_staff');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [priority, setPriority] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [publishDate, setPublishDate] = useState('');
  const [publishTime, setPublishTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
  const staffList = useQuery({
    queryKey: ['staff', 'all-for-compose'],
    queryFn: async () => {
      const { data, error: sErr } = await supabase.from('staff').select('id, full_name').eq('status', 'active').order('full_name');
      if (sErr) throw sErr;
      return data ?? [];
    },
    enabled: audience === 'individuals',
  });

  function toggleId(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submit() {
    setError(null);
    if (!title.trim() || !body.trim()) {
      setError('Title and message are required.');
      return;
    }
    if (audience !== 'all_staff' && selectedIds.length === 0) {
      setError('Choose at least one recipient.');
      return;
    }
    let publishAt: string | undefined;
    if (scheduling && publishDate.trim()) {
      const isoPublishDate = parseDMY(publishDate);
      if (!isoPublishDate) {
        setError('Enter the scheduled date as DD/MM/YYYY.');
        return;
      }
      const parsed = new Date(`${isoPublishDate}T${publishTime.trim() || '00:00'}:00`);
      if (Number.isNaN(parsed.getTime())) {
        setError('Check the scheduled date and time.');
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
        audienceIds: selectedIds,
        priority: priority ? 1 : 0,
        publishAt,
      });
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
      <Hero>
        <ScreenHeader title="New announcement" tone="onPrimary" back={navigation.canGoBack()} />
      </Hero>
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
      <Card>
        <TextField label="Title" value={title} onChangeText={setTitle} />
        <TextField label="Message" value={body} onChangeText={setBody} multiline />

        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>AUDIENCE</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {(Object.keys(audienceLabels) as AudienceType[]).map((a) => (
            <Button
              key={a}
              label={audienceLabels[a]}
              size="sm"
              variant={audience === a ? 'primary' : 'outline'}
              onPress={() => {
                setAudience(a);
                setSelectedIds([]);
              }}
            />
          ))}
        </View>

        {audience === 'section' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {(grades.data ?? []).map((g) => (
              <Button key={g.id} label={g.name} size="sm" variant={selectedIds.includes(g.id) ? 'primary' : 'outline'} onPress={() => toggleId(g.id)} />
            ))}
          </View>
        ) : null}
        {audience === 'class' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {(classes.data ?? []).map((c) => (
              <Button key={c.id} label={c.name} size="sm" variant={selectedIds.includes(c.id) ? 'primary' : 'outline'} onPress={() => toggleId(c.id)} />
            ))}
          </View>
        ) : null}
        {audience === 'individuals' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {(staffList.data ?? []).map((s) => (
              <Button key={s.id} label={s.full_name} size="sm" variant={selectedIds.includes(s.id) ? 'primary' : 'outline'} onPress={() => toggleId(s.id)} />
            ))}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm }}>
          <Button
            label={priority ? 'High priority' : 'Mark high priority'}
            icon={priority ? 'checkmark' : undefined}
            size="sm"
            variant={priority ? 'primary' : 'outline'}
            onPress={() => setPriority((v) => !v)}
          />
          <Button label={scheduling ? 'Publish now instead' : 'Schedule for later'} size="sm" variant={scheduling ? 'primary' : 'outline'} onPress={() => setScheduling((v) => !v)} />
        </View>
        {scheduling ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <TextField label="Date" placeholder="DD/MM/YYYY" value={publishDate} onChangeText={setPublishDate} />
            </View>
            <View style={{ flex: 1 }}>
              <TextField label="Time (HH:MM)" placeholder="08:00" value={publishTime} onChangeText={setPublishTime} />
            </View>
          </View>
        ) : null}

        {error ? <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{error}</Text> : null}
        <Button label={scheduling ? 'Schedule' : 'Publish'} onPress={() => void submit()} loading={submitting} />
      </Card>
      </View>
    </Screen>
  );
}
