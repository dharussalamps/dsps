import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Text, View } from 'react-native';
import { Button, Card, StatusPill } from '@/components';
import { todayIso, useExistingSubmission } from '@/features/attendance/hooks';
import type { RootStackParamList } from '@/navigation/types';
import { typography, semantic } from '@/theme/tokens';
import type { MyClass } from './api';

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
      </Card>
    );
  }

  return (
    <Card style={{ borderColor: semantic.primary, borderWidth: 1.5 }}>
      <Text style={{ ...typography.subtitle, color: semantic.textPrimary }}>{myClass.className} attendance</Text>
      <Text style={{ ...typography.body, color: semantic.textSecondary }}>Not marked yet today.</Text>
      <Button label="Mark attendance" onPress={() => navigation.navigate('MarkAttendance', { classId: myClass.classId })} />
    </Card>
  );
}
