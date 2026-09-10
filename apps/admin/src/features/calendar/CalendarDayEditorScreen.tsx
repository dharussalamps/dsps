import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Button, Card, Hero, Screen, ScreenHeader, TextField } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { spacing, typography, semantic } from '@/theme/tokens';
import { setCalendarDay, type CalendarDayType } from './api';
import { useCalendarDay } from './hooks';

type Route = RouteProp<RootStackParamList, 'CalendarDayEditor'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const dayTypes: CalendarDayType[] = ['school', 'holiday', 'half_day', 'exam', 'closure'];

export function CalendarDayEditorScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const staff = useAuthStore((s) => s.staff);
  const day = useCalendarDay(params.date);

  // Uncontrolled-until-touched: render straight from the fetched day until
  // the user picks something themselves, rather than syncing query data
  // into state via an effect (which just adds a render for the same
  // result, and can't tell "loaded" apart from "user picked the default").
  const [dayTypeOverride, setDayTypeOverride] = useState<CalendarDayType | null>(null);
  const [labelOverride, setLabelOverride] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dayType = dayTypeOverride ?? day.data?.dayType ?? 'school';
  const label = labelOverride ?? day.data?.label ?? '';

  const isPast = params.date < new Date().toISOString().slice(0, 10);
  const isRealChange = day.data != null && dayType !== day.data.dayType;

  // FR-CAL-07: "changing the type of a past day recalculates affected
  // attendance percentages, and the user is warned before saving."
  function save() {
    if (isPast && isRealChange) {
      Alert.alert(
        'This day has already passed',
        'Changing its type will recalculate attendance percentages for everyone affected the next time summaries run.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save anyway', onPress: () => void doSave() },
        ],
      );
      return;
    }
    void doSave();
  }

  async function doSave() {
    if (!staff) return;
    setSaving(true);
    try {
      await setCalendarDay(params.date, dayType, label.trim(), staff.id);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero>
        <ScreenHeader title="Edit day" subtitle={params.date} tone="onPrimary" back={navigation.canGoBack()} />
      </Hero>
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
      <Card>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>DAY TYPE</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {dayTypes.map((t) => (
            <Button key={t} label={t.replace('_', ' ')} size="sm" variant={dayType === t ? 'primary' : 'outline'} onPress={() => setDayTypeOverride(t)} />
          ))}
        </View>
        <TextField label="Label (optional)" value={label} onChangeText={setLabelOverride} />
        <Button label={saved ? 'Saved' : 'Save'} icon={saved ? 'checkmark' : undefined} onPress={save} loading={saving} />
        {dayType !== 'school' ? (
          <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
            Changing a past school day recomputes attendance percentages the next time summaries run.
          </Text>
        ) : null}
      </Card>
      <Button label="Back to calendar" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    </Screen>
  );
}
