import { StyleSheet, Text, View } from 'react-native';
import { Card, StatusPill } from '@/components';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';
import type { StudentSummary } from './api';

type Props = {
  student: StudentSummary & { rollNo?: string | null; className?: string | null };
  onPress: () => void;
  /** Shorter row (smaller avatar, tighter padding) — e.g. a search-results list, where rows are denser than a class roster. */
  compact?: boolean;
};

export function StudentListItem({ student, onPress, compact }: Props) {
  const displayName = student.preferredName || student.fullName;
  const initial = displayName.charAt(0).toUpperCase();
  const avatarSize = compact ? 32 : 44;

  return (
    <Card onPress={onPress} flat style={compact ? { ...styles.card, ...styles.cardCompact } : styles.card}>
      <View style={[styles.row, compact && styles.rowCompact]}>
        <View style={[styles.avatar, { width: avatarSize, height: avatarSize }]}>
          <Text style={[styles.avatarText, compact && styles.avatarTextCompact]}>{initial}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.meta}>
            {student.admissionNo}
            {student.className ? ` · ${student.className}` : ''}
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
  cardCompact: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowCompact: { gap: spacing.sm },
  avatar: {
    borderRadius: radius.pill,
    backgroundColor: colors.maroon100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.subtitle, color: colors.maroon700 },
  avatarTextCompact: { fontSize: 14 },
  info: { flex: 1, gap: 2 },
  name: { ...typography.bodyStrong, color: semantic.textPrimary },
  meta: { ...typography.caption, color: semantic.textSecondary },
});
