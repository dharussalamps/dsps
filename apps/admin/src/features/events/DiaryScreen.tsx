import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Button, Card, EmptyState, ScreenHeader, TextField } from '@/components';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';
import { semantic, spacing, typography } from '@/theme/tokens';
import { addDiaryEntry } from './api';
import { useDiaryEntries } from './hooks';

const CURRENT_YEAR = new Date().getFullYear();

export function DiaryScreen() {
  const staff = useAuthStore((s) => s.staff);
  const queryClient = useQueryClient();
  // FR-DRY-02: "diary entries are presented as a chronological record filterable by year."
  const [year, setYear] = useState(CURRENT_YEAR);
  const entries = useDiaryEntries(year);

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!staff || !title.trim()) return;
    setSaving(true);
    try {
      await addDiaryEntry({ onDate: new Date().toISOString().slice(0, 10), title: title.trim(), body: body.trim(), authorId: staff.id });
      setAdding(false);
      setTitle('');
      setBody('');
      await queryClient.invalidateQueries({ queryKey: ['diary', year] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'left', 'right']}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <ScreenHeader title="School diary" subtitle={String(year)}>
          <Button label={adding ? 'Cancel' : 'Add entry'} size="sm" onPress={() => setAdding((v) => !v)} />
        </ScreenHeader>
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          <Button label="◂" size="sm" variant="outline" onPress={() => setYear((y) => y - 1)} />
          <Button label={String(year)} size="sm" variant="ghost" onPress={() => setYear(CURRENT_YEAR)} />
          <Button label="▸" size="sm" variant="outline" onPress={() => setYear((y) => y + 1)} disabled={year >= CURRENT_YEAR} />
        </View>
        {adding ? (
          <Card>
            <TextField label="Title" value={title} onChangeText={setTitle} />
            <TextField label="Notes" value={body} onChangeText={setBody} multiline />
            <Button label="Save" onPress={() => void submit()} loading={saving} />
          </Card>
        ) : null}
      </View>

      {entries.isLoading ? (
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={entries.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl }}
          ListEmptyComponent={<EmptyState title="No diary entries this year" />}
          renderItem={({ item }) => (
            <Card flat>
              <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{item.title}</Text>
              <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
                {item.onDate} · {item.authorName}
              </Text>
              {item.body ? <Text style={{ ...typography.body, color: semantic.textPrimary }}>{item.body}</Text> : null}
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
}
