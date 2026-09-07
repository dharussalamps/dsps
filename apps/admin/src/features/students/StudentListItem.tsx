import { StyleSheet, Text, View } from 'react-native';
import { Card, StatusPill } from '@/components';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';
import type { StudentSummary } from './api';

type Props = {
  student: StudentSummary & { rollNo?: string | null };
  onPress: () => void;
};

export function StudentListItem({ student, onPress }: Props) {
  const displayName = student.preferredName || student.fullName;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <Card onPress={onPress} flat style={styles.card}>
      <View style={styles.row}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.meta}>
            {student.admissionNo}
            {student.rollNo ? ` · Roll ${student.rollNo}` : ''}
          </Text>
        </View>
        {student.status !== 'active' ? <StatusPill label={student.status} tone="neutral" /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.maroon100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.subtitle, color: colors.maroon700 },
  info: { flex: 1, gap: 2 },
  name: { ...typography.bodyStrong, color: semantic.textPrimary },
  meta: { ...typography.caption, color: semantic.textSecondary },
});
