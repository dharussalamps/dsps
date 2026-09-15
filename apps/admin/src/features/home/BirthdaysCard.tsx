import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Text } from 'react-native';
import { WidgetTile } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { colors, semantic, spacing, typography } from '@/theme/tokens';
import type { Birthday } from './api';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const TINT = { fg: colors.maroon700, bg: colors.maroon100 };

/** Home "Today's birthdays" widget — only rendered by HomeScreen when there's at least one. */
export function BirthdaysCard({ birthdays }: { birthdays: Birthday[] }) {
  const navigation = useNavigation<Nav>();

  return (
    <WidgetTile icon="gift-outline" label="BIRTHDAYS" tint={TINT}>
      {birthdays.slice(0, 2).map((b) => (
        <Text
          key={`${b.personType}-${b.id}`}
          style={{ ...typography.caption, color: semantic.textPrimary }}
          numberOfLines={1}
          onPress={() =>
            b.personType === 'student'
              ? navigation.navigate('StudentProfile', { studentId: b.id })
              : navigation.navigate('StaffProfile', { staffId: b.id })
          }
        >
          🎂 {b.fullName}
        </Text>
      ))}
      {birthdays.length > 2 ? (
        <Text style={{ ...typography.caption, color: semantic.textSecondary, marginTop: spacing.xs }}>+{birthdays.length - 2} more</Text>
      ) : null}
    </WidgetTile>
  );
}
