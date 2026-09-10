import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Text, View } from 'react-native';
import { Button, Card, EmptyState, Hero, Screen, ScreenHeader, StatusPill, TextField } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { colors, semantic, spacing, typography } from '@/theme/tokens';
import { todayIso } from '@/features/attendance/hooks';
import { useDutyRoster, useStaffDirectory, useTodayPresence } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Tab = 'people' | 'duties';

const presenceTone: Record<string, 'success' | 'warning' | 'neutral'> = { present: 'success', late: 'warning', on_leave: 'neutral' };
const presenceLabel: Record<string, string> = { present: 'In today', late: 'Late today', on_leave: 'On leave' };

export function StaffDirectoryScreen() {
  const navigation = useNavigation<Nav>();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('people');
  const staff = useStaffDirectory(query);
  const duties = useDutyRoster();
  // FR-STF-03: "the directory indicates each colleague's presence for the current day."
  const presence = useTodayPresence(todayIso());

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero>
        <ScreenHeader title="Staff directory" tone="onPrimary" back={navigation.canGoBack()} />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button
            label="By person"
            size="sm"
            variant={tab === 'people' ? 'secondary' : 'outline'}
            textColor={tab === 'people' ? undefined : colors.white}
            style={tab === 'people' ? undefined : { borderColor: 'rgba(255,255,255,0.6)' }}
            onPress={() => setTab('people')}
          />
          <Button
            label="By duty"
            size="sm"
            variant={tab === 'duties' ? 'secondary' : 'outline'}
            textColor={tab === 'duties' ? undefined : colors.white}
            style={tab === 'duties' ? undefined : { borderColor: 'rgba(255,255,255,0.6)' }}
            onPress={() => setTab('duties')}
          />
        </View>
        {tab === 'people' ? (
          <TextField
            placeholder="Search by name or staff number"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            style={{ backgroundColor: colors.white, borderWidth: 0 }}
          />
        ) : null}
      </Hero>

      <View style={{ flex: 1, padding: spacing.lg }}>
        {tab === 'people' ? (
          <>
            {staff.isLoading ? (
              <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
            ) : (
              <FlatList
                data={staff.data ?? []}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ gap: spacing.sm }}
                ListEmptyComponent={<EmptyState title="No staff found" />}
                renderItem={({ item }) => (
                  <Card onPress={() => navigation.navigate('StaffProfile', { staffId: item.id })} flat style={{ padding: spacing.md }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ gap: 2 }}>
                        <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{item.fullName}</Text>
                        <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{item.staffNo}</Text>
                      </View>
                      <Button label="Call" size="sm" variant="outline" onPress={() => Linking.openURL(`tel:${item.phone}`)} />
                    </View>
                    <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: 2 }}>
                      {item.status !== 'active' ? <StatusPill label={item.status} tone="neutral" /> : null}
                      {presence.data?.[item.id] ? (
                        <StatusPill label={presenceLabel[presence.data[item.id]] ?? presence.data[item.id]} tone={presenceTone[presence.data[item.id]] ?? 'neutral'} />
                      ) : null}
                    </View>
                  </Card>
                )}
              />
            )}
          </>
        ) : duties.isLoading ? (
          <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <FlatList
            data={duties.data ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ gap: spacing.sm }}
            ListEmptyComponent={<EmptyState title="No duties assigned" />}
            renderItem={({ item }) => (
              <Card onPress={() => navigation.navigate('StaffProfile', { staffId: item.staffId })} flat style={{ padding: spacing.md }}>
                <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{item.title}</Text>
                <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
                  {item.staffName}
                  {item.scheduleNote ? ` · ${item.scheduleNote}` : ''}
                </Text>
              </Card>
            )}
          />
        )}
      </View>
    </Screen>
  );
}
