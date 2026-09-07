import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Button, EmptyState, ScreenHeader, TextField } from '@/components';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackParamList } from '@/navigation/types';
import { semantic, spacing, typography } from '@/theme/tokens';
import { StudentListItem } from './StudentListItem';
import { useClasses, useStudentSearch } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function StudentSearchScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const [query, setQuery] = useState('');
  const search = useStudentSearch(query);
  const classes = useClasses();
  const showResults = query.trim().length >= 2;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'left', 'right']}>
      <View style={{ padding: spacing.lg, gap: spacing.lg, flex: 1 }}>
        <ScreenHeader title={t('nav.students')} />
        <TextField
          placeholder="Search by name or admission number"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />

        {showResults ? (
          <FlatList
            data={search.data ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ gap: spacing.sm }}
            renderItem={({ item }) => (
              <StudentListItem student={item} onPress={() => navigation.navigate('StudentProfile', { studentId: item.id })} />
            )}
            ListEmptyComponent={
              search.isLoading ? (
                <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
              ) : (
                <EmptyState title="No students found" message="Try a different name or admission number." />
              )
            }
          />
        ) : (
          <FlatList
            data={classes.data ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ gap: spacing.sm }}
            ListHeaderComponent={
              <Text style={{ ...typography.captionStrong, color: semantic.textSecondary, marginBottom: spacing.sm }}>
                BROWSE BY CLASS
              </Text>
            }
            ListEmptyComponent={
              classes.isLoading ? (
                <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
              ) : (
                <EmptyState title="No classes in scope" />
              )
            }
            renderItem={({ item }) => (
              <Button
                label={`${item.name} — ${item.gradeName}`}
                variant="outline"
                onPress={() => navigation.navigate('ClassDetail', { classId: item.id })}
              />
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
