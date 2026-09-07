import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { Button, Card, EmptyState, Screen, ScreenHeader, TextField } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { spacing, typography, semantic } from '@/theme/tokens';
import { addDiaryEntry } from './api';
import { useEvent } from './hooks';

type Route = RouteProp<RootStackParamList, 'EventDetail'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export function EventDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const staff = useAuthStore((s) => s.staff);
  const event = useEvent(params.eventId);

  const [addingToDiary, setAddingToDiary] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function saveDiary() {
    if (!staff || !event.data) return;
    setSaving(true);
    try {
      await addDiaryEntry({ onDate: event.data.startsOn, title: event.data.title, body: note.trim(), eventId: event.data.id, authorId: staff.id });
      setAddingToDiary(false);
      setNote('');
      navigation.navigate('Diary');
    } finally {
      setSaving(false);
    }
  }

  if (event.isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      </Screen>
    );
  }
  if (!event.data) {
    return (
      <Screen>
        <EmptyState title="Event not found" />
      </Screen>
    );
  }

  const e = event.data;

  return (
    <Screen>
      <ScreenHeader title={e.title} subtitle={e.startsOn} />
      <Card>
        {e.description ? <Text style={{ ...typography.body, color: semantic.textPrimary }}>{e.description}</Text> : null}
        {e.location ? <Text style={{ ...typography.caption, color: semantic.textSecondary }}>📍 {e.location}</Text> : null}
        {e.responsibleName ? <Text style={{ ...typography.caption, color: semantic.textSecondary }}>Responsible: {e.responsibleName}</Text> : null}
      </Card>

      {addingToDiary ? (
        <Card>
          <TextField label="Diary note" value={note} onChangeText={setNote} multiline />
          <Button label="Save to diary" onPress={() => void saveDiary()} loading={saving} />
        </Card>
      ) : (
        <Button label="Add to diary" variant="outline" onPress={() => setAddingToDiary(true)} />
      )}
    </Screen>
  );
}
