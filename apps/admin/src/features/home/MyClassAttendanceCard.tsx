import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Text, View } from 'react-native';
import { Button, Card, StatusPill } from '@/components';
import { todayIso, useExistingSubmission } from '@/features/attendance/hooks';
import type { RootStackParamList } from '@/navigation/types';
import { colors, typography, semantic, spacing } from '@/theme/tokens';
import type { MyClass } from './api';
import { useClassAttendanceTrend } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * AdminSpec.md section 10, Home composition: "Marking prompt if
 * unsubmitted; collapsed confirmation if submitted." One of these per
 * class the signed-in teacher owns or actively covers — always the first
 * block on Home (section 10's ordering rule: "the user's own outstanding
 * task always comes first").
 */
export function MyClassAttendanceCard({ myClass }: { myClass: MyClass }) {
  const navigation = useNavigation<Nav>();
  const onDate = todayIso();
  const submission = useExistingSubmission(myClass.classId, onDate);
  const trend = useClassAttendanceTrend(myClass.classId, true);

  if (submission.isLoading) return null;

  if (submission.data) {
    return (
      <Card flat>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{myClass.className} — marked</Text>
          <StatusPill
            label={submission.data.absentees.length > 0 ? `${submission.data.absentees.length} absent` : 'All present'}
            tone={submission.data.absentees.length > 0 ? 'warning' : 'success'}
          />
        </View>
        <AttendanceSparkline points={trend.data} />
      </Card>
    );
  }

  return (
    <Card style={{ borderColor: semantic.primary, borderWidth: 1.5 }}>
      <Text style={{ ...typography.subtitle, color: semantic.textPrimary }}>{myClass.className} attendance</Text>
      <Text style={{ ...typography.body, color: semantic.textSecondary }}>Not marked yet today.</Text>
      <Button label="Mark attendance" onPress={() => navigation.navigate('MarkAttendance', { classId: myClass.classId })} />
      <AttendanceSparkline points={trend.data} />
    </Card>
  );
}

/** 7-school-day attendance % trend, from class_attendance_trend(). Skipped entirely while there isn't at least one day with data yet. */
function AttendanceSparkline({ points }: { points?: { onDate: string; pct: number | null }[] }) {
  if (!points || points.every((p) => p.pct == null)) return null;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs, height: 28, marginTop: spacing.sm }}>
      {points.map((p) => (
        <View
          key={p.onDate}
          style={{
            flex: 1,
            height: Math.max(3, ((p.pct ?? 0) / 100) * 28),
            borderRadius: 2,
            backgroundColor: (p.pct ?? 0) >= 80 ? colors.teal700 : (p.pct ?? 0) >= 60 ? semantic.secondaryMuted : colors.error,
          }}
        />
      ))}
    </View>
  );
}
