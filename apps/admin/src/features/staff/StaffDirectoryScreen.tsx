import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Text, View } from 'react-native';
import { Button, Card, EmptyState, ScreenHeader, StatusPill, TextField } from '@/components';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackParamList } from '@/navigation/types';
import { semantic, spacing, typography } from '@/theme/tokens';
import { useDutyRoster, useStaffDirectory } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Tab = 'people' | 'duties';

export function StaffDirectoryScreen() {
  const navigation = useNavigation<Nav>();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('people');
  const staff = useStaffDirectory(query);
  const duties = useDutyRoster();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'left', 'right']}>
      <View style={{ padding: spacing.lg, gap: spacing.lg, flex: 1 }}>
        <ScreenHeader title="Staff directory" />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button label="By person" size="sm" variant={tab === 'people' ? 'primary' : 'outline'} onPress={() => setTab('people')} />
          <Button label="By duty" size="sm" variant={tab === 'duties' ? 'primary' : 'outline'} onPress={() => setTab('duties')} />
        </View>

        {tab === 'people' ? (
          <>
            <TextField placeholder="Search by name or staff number" value={query} onChangeText={setQuery} autoCapitalize="none" />
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
                    {item.status !== 'active' ? <StatusPill label={item.status} tone="neutral" /> : null}
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
    </SafeAreaView>
  );
}
