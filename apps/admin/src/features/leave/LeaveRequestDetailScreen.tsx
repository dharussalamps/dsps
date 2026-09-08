import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button, Card, Screen, ScreenHeader, StatusPill, TextField } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { spacing, typography, semantic } from '@/theme/tokens';
import { approveLeave, rejectLeave } from './api';
import { useLeaveRequestDetail } from './hooks';

type Route = RouteProp<RootStackParamList, 'LeaveRequestDetail'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export function LeaveRequestDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const detail = useLeaveRequestDetail(params.requestId);
  const queryClient = useQueryClient();

  const [selectedCover, setSelectedCover] = useState<string | null>(null);
  const [coverNotNeeded, setCoverNotNeeded] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (detail.isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      </Screen>
    );
  }
  if (!detail.data) {
    return (
      <Screen>
        <Text style={{ ...typography.body, color: semantic.textSecondary }}>Request not found.</Text>
      </Screen>
    );
  }

  const d = detail.data;

  async function approve() {
    setError(null);
    setBusy(true);
    try {
      await approveLeave(d!.id, selectedCover, coverNotNeeded, remarks);
      await queryClient.invalidateQueries({ queryKey: ['leave'] });
      navigation.goBack();
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? '';
      if (message.includes('cover_required')) {
        setError('This teacher has their own class. Choose a cover teacher, or confirm none is needed.');
      } else {
        setError('Could not approve this request.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    try {
      await rejectLeave(d!.id, remarks);
      await queryClient.invalidateQueries({ queryKey: ['leave'] });
      navigation.goBack();
    } catch {
      setError('Could not reject this request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScreenHeader title={d.staffName} subtitle={d.leaveTypeName}>
        <StatusPill label={d.status} tone={d.status === 'pending' ? 'warning' : 'neutral'} />
      </ScreenHeader>

      <Card>
        <Text style={{ ...typography.body, color: semantic.textPrimary }}>
          {d.startsOn} → {d.endsOn} ({d.dayCount} days{d.halfDay ? ', half day' : ''})
        </Text>
        <Text style={{ ...typography.body, color: semantic.textSecondary }}>{d.reason}</Text>
      </Card>

      {d.status === 'pending' ? (
        <>
          <Card>
            <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>IMPACT</Text>
            <Text style={{ ...typography.body, color: semantic.textPrimary }}>
              {d.balance
                ? `${d.leaveTypeName}: ${d.balance.used} of ${d.balance.entitled} used, ${(d.balance.entitled - d.balance.used).toFixed(1)} remaining`
                : `${d.leaveTypeName}: no balance on record for this year`}
            </Text>
            <Text style={{ ...typography.body, color: semantic.textSecondary }}>
              {d.otherStaffOnLeave === 0
                ? 'No other staff on leave for these dates'
                : `${d.otherStaffOnLeave} other staff already on leave for these dates`}
            </Text>
          </Card>

          {d.requiresCover ? (
            <Card>
              <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>
                COVER TEACHER (this staff member has their own class)
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {d.suggestedCover.map((c) => (
                  <Button
                    key={c.staffId}
                    label={c.fullName}
                    size="sm"
                    variant={selectedCover === c.staffId ? 'primary' : 'outline'}
                    onPress={() => {
                      setSelectedCover(c.staffId);
                      setCoverNotNeeded(false);
                    }}
                  />
                ))}
              </View>
              <Button
                label={coverNotNeeded ? 'No cover needed ✓' : 'No cover needed'}
                variant="ghost"
                size="sm"
                onPress={() => {
                  setCoverNotNeeded((v) => !v);
                  setSelectedCover(null);
                }}
              />
            </Card>
          ) : null}

          {error ? <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{error}</Text> : null}

          <Card>
            <TextField label="Remarks (optional)" value={remarks} onChangeText={setRemarks} multiline />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button label="Approve" onPress={() => void approve()} loading={busy} style={{ flex: 1 }} />
              <Button label="Reject" variant="danger" onPress={() => void reject()} loading={busy} style={{ flex: 1 }} />
            </View>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
