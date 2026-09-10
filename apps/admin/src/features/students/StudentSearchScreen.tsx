import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Button, EmptyState, Hero, Screen, ScreenHeader, TextField } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { colors, semantic, spacing, typography } from '@/theme/tokens';
import { ImportStudentsSection } from './ImportStudentsSection';
import { StudentListItem } from './StudentListItem';
import { useClasses, useStudentSearch } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function StudentSearchScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const [query, setQuery] = useState('');
  const [showImport, setShowImport] = useState(false);
  const search = useStudentSearch(query);
  const classes = useClasses();
  const showResults = query.trim().length >= 2;

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero>
        <ScreenHeader title={t('nav.students')} tone="onPrimary">
          <Button
            label={showImport ? 'Cancel' : 'Import'}
            size="sm"
            variant="secondary"
            icon={showImport ? 'close' : 'cloud-upload-outline'}
            onPress={() => setShowImport((v) => !v)}
          />
        </ScreenHeader>
        <TextField
          placeholder="Search by name or admission number"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          style={styles.searchInput}
        />
      </Hero>

      <View style={{ flex: 1 }}>
        {showImport ? (
          <View style={{ padding: spacing.lg, paddingBottom: 0 }}>
            <ImportStudentsSection />
          </View>
        ) : null}

        {showResults ? (
          <FlatList
            data={search.data ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
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
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
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
                icon="school-outline"
                variant="outline"
                onPress={() => navigation.navigate('ClassDetail', { classId: item.id })}
              />
            )}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = {
  searchInput: { backgroundColor: colors.white, borderWidth: 0 },
} as const;
