import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Hero, HeroDoodle, Icon, Screen, ScreenHeader, SectionHeader, TextField, pillToneColors } from '@/components';
import { useConfirmDiscardOnLeave } from '@/hooks/useConfirmDiscardOnLeave';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { spacing, typography, semantic, colors, radius } from '@/theme/tokens';
import { deleteCalendarDay, setCalendarDay, type CalendarDayType } from './api';
import { DAY_TYPE_META } from './dayTypeMeta';
import { useCalendarDay } from './hooks';

type Route = RouteProp<RootStackParamList, 'CalendarDayEditor'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const dayTypes: CalendarDayType[] = ['school', 'holiday', 'half_day', 'exam', 'closure'];

export function CalendarDayEditorScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const staff = useAuthStore((s) => s.staff);
  const day = useCalendarDay(params.date);
  const queryClient = useQueryClient();

  // Uncontrolled-until-touched: render straight from the fetched day until
  // the user picks something themselves, rather than syncing query data
  // into state via an effect (which just adds a render for the same
  // result, and can't tell "loaded" apart from "user picked the default").
  const [dayTypeOverride, setDayTypeOverride] = useState<CalendarDayType | null>(null);
  const [labelOverride, setLabelOverride] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function invalidateCalendarDayCaches() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['calendar', 'day'] }),
      queryClient.invalidateQueries({ queryKey: ['calendar', 'all-days'] }),
      queryClient.invalidateQueries({ queryKey: ['calendar', 'days-range'] }),
    ]);
  }

  const dayType = dayTypeOverride ?? day.data?.dayType ?? 'school';
  const label = labelOverride ?? day.data?.label ?? '';

  const isPast = params.date < new Date().toISOString().slice(0, 10);
  const isRealChange = day.data != null && dayType !== day.data.dayType;

  useConfirmDiscardOnLeave(!saved && (dayType !== (day.data?.dayType ?? 'school') || label !== (day.data?.label ?? '')));

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
      await invalidateCalendarDayCaches();
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  function confirmRemoveOverride() {
    Alert.alert('Remove this override?', `${format(parseISO(params.date), 'EEE, d MMM yyyy')} will follow the normal term/working-day rules again.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void removeOverride() },
    ]);
  }

  async function removeOverride() {
    setDeleting(true);
    try {
      await deleteCalendarDay(params.date);
      await invalidateCalendarDayCaches();
      navigation.goBack();
    } finally {
      setDeleting(false);
    }
  }

  const currentMeta = day.data ? DAY_TYPE_META[day.data.dayType] : null;

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="calendar-outline" bottomIcon="time-outline" />
        <ScreenHeader
          title="Edit day"
          subtitle={format(parseISO(params.date), 'EEE, d MMM yyyy')}
          tone="onPrimary"
          back={navigation.canGoBack()}
        />
        {currentMeta ? (
          <View style={styles.currentBadge}>
            <Icon name={currentMeta.icon} size={14} color={colors.white} />
            <Text style={styles.currentBadgeText}>Currently {currentMeta.label.toLowerCase()}</Text>
          </View>
        ) : null}
      </Hero>
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
        <Card>
          <SectionHeader icon="options-outline" label="DAY TYPE" />
          <View style={styles.typeGrid}>
            {dayTypes.map((t) => {
              const meta = DAY_TYPE_META[t];
              const active = dayType === t;
              const tone = pillToneColors[meta.tone];
              return (
                <Pressable
                  key={t}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setDayTypeOverride(t)}
                  style={[
                    styles.typeCard,
                    { borderColor: active ? tone.fg : semantic.border, backgroundColor: active ? tone.bg : semantic.surface },
                  ]}
                >
                  <Icon name={meta.icon} size={22} color={active ? tone.fg : semantic.textSecondary} />
                  <Text style={[styles.typeCardLabel, { color: active ? tone.fg : semantic.textPrimary }]}>{meta.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <TextField label="Label (optional)" placeholder="e.g. Eid holiday" value={label} onChangeText={setLabelOverride} />

          {dayType !== 'school' ? (
            <View style={styles.infoBanner}>
              <Icon name="information-circle-outline" size={16} color={colors.warning} />
              <Text style={styles.infoBannerText}>
                Changing a past school day recomputes attendance percentages the next time summaries run.
              </Text>
            </View>
          ) : null}

          <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
            <Button label={saved ? 'Saved' : 'Save'} icon={saved ? 'checkmark' : undefined} onPress={save} loading={saving} />
            {day.data ? (
              <Button
                label="Remove override"
                size="sm"
                variant="ghost"
                icon="trash-outline"
                textColor={colors.error}
                onPress={confirmRemoveOverride}
                loading={deleting}
              />
            ) : null}
          </View>
        </Card>
        <Button label="Back to calendar" variant="ghost" icon="arrow-back-outline" onPress={() => navigation.goBack()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  currentBadge: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  currentBadgeText: { ...typography.captionStrong, color: colors.white },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  typeCard: {
    width: '30%',
    flexGrow: 1,
    minHeight: 78,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  typeCardLabel: { ...typography.captionStrong, textAlign: 'center' },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.warningBg,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  infoBannerText: { ...typography.caption, color: colors.warning, flex: 1 },
});
