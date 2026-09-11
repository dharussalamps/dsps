import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, FlatList, Text } from 'react-native';
import { Card, EmptyState, Hero, HeroDoodle, Screen, ScreenHeader } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { semantic, spacing, typography } from '@/theme/tokens';
import { useClasses } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ClassListScreen() {
  const navigation = useNavigation<Nav>();
  const classes = useClasses();

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="school-outline" bottomIcon="people-outline" />
        <ScreenHeader title="Classes" tone="onPrimary" back={navigation.canGoBack()} />
      </Hero>
      {classes.isLoading ? (
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={classes.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          ListEmptyComponent={<EmptyState title="No classes in scope" />}
          renderItem={({ item }) => (
            <Card onPress={() => navigation.navigate('ClassDetail', { classId: item.id })}>
              <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{item.name}</Text>
              <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{item.gradeName}</Text>
            </Card>
          )}
        />
      )}
    </Screen>
  );
}
