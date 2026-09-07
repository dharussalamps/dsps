import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, StatusPill } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { spacing, typography, semantic } from '@/theme/tokens';
import { markBenefitIssued } from './api';
import { useBenefits } from './hooks';

const statusTone: Record<string, 'success' | 'warning' | 'neutral'> = {
  pending: 'warning',
  issued: 'success',
  active: 'success',
  ended: 'neutral',
};

/** section 10: StudentBenefitsTab — gated by student.view_benefits (RLS: empty list when the caller lacks it, not shown at all). */
export function BenefitsSection({ studentId }: { studentId: string }) {
  const staff = useAuthStore((s) => s.staff);
  const queryClient = useQueryClient();
  const benefits = useBenefits(studentId);
  const [marking, setMarking] = useState<string | null>(null);

  if (!benefits.data || benefits.data.length === 0) return null;

  async function markIssued(id: string) {
    if (!staff) return;
    setMarking(id);
    try {
      await markBenefitIssued(id, staff.id);
      await queryClient.invalidateQueries({ queryKey: ['students', 'benefits', studentId] });
    } finally {
      setMarking(null);
    }
  }

  return (
    <Card>
      <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>BENEFITS</Text>
      {benefits.data.map((b) => (
        <View key={b.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs }}>
          <Text style={{ ...typography.body, color: semantic.textPrimary }}>{b.scheme.replace(/_/g, ' ')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <StatusPill label={b.status} tone={statusTone[b.status]} />
            {b.status === 'pending' ? (
              <Button label="Mark collected" size="sm" variant="outline" loading={marking === b.id} onPress={() => void markIssued(b.id)} />
            ) : null}
          </View>
        </View>
      ))}
    </Card>
  );
}
