import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Screen, ScreenHeader, TextField } from '@/components';
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

  async function save() {
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
    <Screen>
      <ScreenHeader title="Edit day" subtitle={params.date} />
      <Card>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>DAY TYPE</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {dayTypes.map((t) => (
            <Button key={t} label={t.replace('_', ' ')} size="sm" variant={dayType === t ? 'primary' : 'outline'} onPress={() => setDayTypeOverride(t)} />
          ))}
        </View>
        <TextField label="Label (optional)" value={label} onChangeText={setLabelOverride} />
        <Button label={saved ? 'Saved ✓' : 'Save'} onPress={() => void save()} loading={saving} />
        {dayType !== 'school' ? (
          <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
            Changing a past school day recomputes attendance percentages the next time summaries run.
          </Text>
        ) : null}
      </Card>
      <Button label="Back to calendar" variant="ghost" onPress={() => navigation.goBack()} />
    </Screen>
  );
}
