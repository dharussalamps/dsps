import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button, Card, EmptyState, Hero, HeroDoodle, Icon, Screen, ScreenHeader, TextField } from '@/components';
import { useConfirmDiscardOnLeave } from '@/hooks/useConfirmDiscardOnLeave';
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

  useConfirmDiscardOnLeave(addingToDiary && !!note.trim());

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
      <Screen padded={false} edges={['left', 'right']}>
        <Hero style={{ overflow: 'hidden' }}>
          <HeroDoodle topIcon="star-outline" bottomIcon="calendar-outline" />
          <ScreenHeader title="Event" tone="onPrimary" back={navigation.canGoBack()} />
        </Hero>
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      </Screen>
    );
  }
  if (!event.data) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero style={{ overflow: 'hidden' }}>
          <HeroDoodle topIcon="star-outline" bottomIcon="calendar-outline" />
          <ScreenHeader title="Event" tone="onPrimary" back={navigation.canGoBack()} />
        </Hero>
        <View style={{ padding: spacing.lg }}>
          <EmptyState title="Event not found" />
        </View>
      </Screen>
    );
  }

  const e = event.data;

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="star-outline" bottomIcon="calendar-outline" />
        <ScreenHeader title={e.title} subtitle={e.startsOn} tone="onPrimary" back={navigation.canGoBack()} />
      </Hero>
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
      <Card>
        {e.description ? <Text style={{ ...typography.body, color: semantic.textPrimary }}>{e.description}</Text> : null}
        {e.location ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Icon name="location-outline" size={14} color={semantic.textSecondary} />
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{e.location}</Text>
          </View>
        ) : null}
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
      </View>
    </Screen>
  );
}
