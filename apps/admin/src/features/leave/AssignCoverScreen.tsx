import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Hero, HeroDoodle, Screen, ScreenHeader, TextField } from '@/components';
import { useClassesForCurrentYear } from '@/features/academicStructure/hooks';
import { listStaff, type StaffSummary } from '@/features/staff/api';
import { useConfirmDiscardOnLeave } from '@/hooks/useConfirmDiscardOnLeave';
import { parseDMY } from '@/lib/date';
import type { RootStackParamList } from '@/navigation/types';
import { spacing, typography, semantic } from '@/theme/tokens';
import { assignCover } from './api';

type Route = RouteProp<RootStackParamList, 'AssignCover'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Screen #26: "Assign cover teacher" — FR-COV-01, standalone (not only via leave approval). */
export function AssignCoverScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const classes = useClassesForCurrentYear();

  const [classId, setClassId] = useState<string | null>(params?.classId ?? null);
  const [staff, setStaff] = useState<StaffSummary | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StaffSummary[]>([]);
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useConfirmDiscardOnLeave(!!staff || !!startsOn.trim() || !!endsOn.trim() || !!reason.trim());

  async function search(q: string) {
    setQuery(q);
    setResults(await listStaff(q));
  }

  async function save() {
    if (!classId || !staff || !startsOn.trim() || !endsOn.trim()) return;
    const isoStartsOn = parseDMY(startsOn);
    const isoEndsOn = parseDMY(endsOn);
    if (!isoStartsOn || !isoEndsOn) {
      setError('Enter both dates as DD/MM/YYYY.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await assignCover({ classId, staffId: staff.id, startsOn: isoStartsOn, endsOn: isoEndsOn, reason: reason.trim() || undefined });
      navigation.goBack();
    } catch {
      setError('Could not assign cover. You may not have permission over this class.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="airplane-outline" bottomIcon="calendar-outline" />
        <ScreenHeader title="Assign cover teacher" subtitle="Grants class-teacher rights for a date range" tone="onPrimary" back={navigation.canGoBack()} />
      </Hero>
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>

      <Card>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>CLASS</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs }}>
          {(classes.data ?? []).map((c) => (
            <Button key={c.id} label={c.name} size="sm" variant={classId === c.id ? 'primary' : 'outline'} onPress={() => setClassId(c.id)} />
          ))}
        </View>
      </Card>

      <Card>
        <TextField label="Cover teacher (search)" value={query} onChangeText={(v) => void search(v)} />
        {query && !staff ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs }}>
            {results.map((s) => (
              <Button key={s.id} label={s.fullName} size="sm" variant="outline" onPress={() => { setStaff(s); setQuery(s.fullName); }} />
            ))}
          </View>
        ) : null}
      </Card>

      <Card>
        <TextField label="Starts on" placeholder="DD/MM/YYYY" value={startsOn} onChangeText={setStartsOn} />
        <TextField label="Ends on" placeholder="DD/MM/YYYY" value={endsOn} onChangeText={setEndsOn} />
        <TextField label="Reason (optional)" value={reason} onChangeText={setReason} />
      </Card>

      {error ? <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{error}</Text> : null}
      <Button label="Assign cover" onPress={() => void save()} loading={busy} disabled={!classId || !staff || !startsOn.trim() || !endsOn.trim()} />
      </View>
    </Screen>
  );
}
