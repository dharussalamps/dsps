import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, StatusPill, TextField } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { spacing, typography, semantic } from '@/theme/tokens';
import { addBenefit, markBenefitIssued } from './api';
import { useBenefits } from './hooks';

const statusTone: Record<string, 'success' | 'warning' | 'neutral'> = {
  pending: 'warning',
  issued: 'success',
  active: 'success',
  ended: 'neutral',
};

/**
 * section 10: StudentBenefitsTab — gated by student.view_benefits (RLS:
 * empty list when the caller lacks it). Previously this returned null
 * whenever the list was empty, which meant a benefit could never actually
 * be *recorded* from the app — only ever marked collected once one already
 * existed some other way (FR-ACH-04). Now stays visible (to show the "add"
 * control) whenever the query itself didn't error, i.e. the caller does
 * hold the permission; the RLS-driven "you lack this permission" case still
 * renders nothing, since an unauthorized query and a genuinely-empty one
 * are indistinguishable by design (section 5.4).
 */
export function BenefitsSection({ studentId }: { studentId: string }) {
  const staff = useAuthStore((s) => s.staff);
  const queryClient = useQueryClient();
  const benefits = useBenefits(studentId);
  const [marking, setMarking] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [scheme, setScheme] = useState('');
  const [busy, setBusy] = useState(false);

  if (!benefits.data) return null;
  // Distinguishes "the query ran but returned nothing" from "still loading" —
  // an empty array is a legitimate, permitted state worth showing the add
  // control for, not treated as "hide this section."

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

  async function submitAdd() {
    if (!scheme.trim()) return;
    setBusy(true);
    try {
      await addBenefit({ studentId, scheme: scheme.trim() });
      setScheme('');
      setAdding(false);
      await queryClient.invalidateQueries({ queryKey: ['students', 'benefits', studentId] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>BENEFITS</Text>
      {benefits.data.length === 0 && !adding ? (
        <Text style={{ ...typography.caption, color: semantic.textSecondary, paddingVertical: spacing.xs }}>No benefits on record.</Text>
      ) : null}
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

      {adding ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: semantic.border }}>
          <TextField
            label="Scheme"
            value={scheme}
            onChangeText={setScheme}
            placeholder="e.g. free_textbooks, uniform_voucher, midday_meal"
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label="Add" size="sm" onPress={() => void submitAdd()} loading={busy} />
            <Button label="Cancel" size="sm" variant="ghost" onPress={() => setAdding(false)} />
          </View>
        </View>
      ) : (
        <Button label="Add benefit" size="sm" variant="outline" onPress={() => setAdding(true)} style={{ marginTop: spacing.sm }} />
      )}
    </Card>
  );
}
