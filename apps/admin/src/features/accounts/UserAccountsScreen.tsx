import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Button, Card, EmptyState, ScreenHeader, StatusPill, TextField } from '@/components';
import { useClasses } from '@/features/students/hooks';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { semantic, spacing, typography } from '@/theme/tokens';
import { SafeAreaView } from 'react-native-safe-area-context';
import { assignRole, createStaffAccount, setStaffStatus, type AccountRow } from './api';
import { useAccounts, useRoles } from './hooks';

type ScopeType = 'school' | 'grade' | 'class' | 'self';

export function UserAccountsScreen() {
  const me = useAuthStore((s) => s.staff);
  const accounts = useAccounts();
  const roles = useRoles();
  const classes = useClasses();
  const grades = useQuery({
    queryKey: ['grades', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('grades').select('id, number, name').order('number');
      if (error) throw error;
      return data ?? [];
    },
  });
  const queryClient = useQueryClient();

  const [creating, setCreating] = useState(false);
  const [staffNo, setStaffNo] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const [assigningFor, setAssigningFor] = useState<string | null>(null);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [scopeType, setScopeType] = useState<ScopeType>('school');
  const [scopeId, setScopeId] = useState<string | null>(null);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['accounts', 'list'] });
  }

  async function submitCreate() {
    if (!staffNo.trim() || !fullName.trim() || !phone.trim()) return;
    setSaving(true);
    try {
      await createStaffAccount({ staffNo: staffNo.trim(), fullName: fullName.trim(), phone: phone.trim() });
      setCreating(false);
      setStaffNo('');
      setFullName('');
      setPhone('');
      await invalidate();
    } finally {
      setSaving(false);
    }
  }

  async function submitAssign(staffId: string) {
    if (!me || !roleId) return;
    setSaving(true);
    try {
      await assignRole({ staffId, roleId, scopeType, scopeId: scopeType === 'school' || scopeType === 'self' ? null : scopeId, grantedBy: me.id });
      setAssigningFor(null);
      setRoleId(null);
      setScopeId(null);
      await invalidate();
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(account: AccountRow) {
    await setStaffStatus(account.id, account.status === 'active' ? 'inactive' : 'active');
    await invalidate();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'left', 'right']}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <ScreenHeader title="User accounts">
          <Button label={creating ? 'Cancel' : 'Create'} size="sm" onPress={() => setCreating((v) => !v)} />
        </ScreenHeader>
        {creating ? (
          <Card>
            <TextField label="Staff number" value={staffNo} onChangeText={setStaffNo} autoCapitalize="none" />
            <TextField label="Full name" value={fullName} onChangeText={setFullName} />
            <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Button label="Save" onPress={() => void submitCreate()} loading={saving} />
          </Card>
        ) : null}
      </View>

      {accounts.isLoading ? (
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={accounts.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl }}
          ListEmptyComponent={<EmptyState title="No staff accounts" />}
          renderItem={({ item }) => (
            <Card flat>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ gap: 2, flex: 1 }}>
                  <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{item.fullName}</Text>
                  <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
                    {item.staffNo} · {item.hasLogin ? 'Has login' : 'No login yet'}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                    {item.roles.map((r) => (
                      <StatusPill key={r} label={r} tone="gold" />
                    ))}
                  </View>
                </View>
                <StatusPill label={item.status} tone={item.status === 'active' ? 'success' : 'neutral'} />
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm }}>
                <Button label={assigningFor === item.id ? 'Cancel' : 'Assign role'} size="sm" variant="outline" onPress={() => setAssigningFor(assigningFor === item.id ? null : item.id)} />
                <Button label={item.status === 'active' ? 'Deactivate' : 'Reactivate'} size="sm" variant="ghost" onPress={() => void toggleStatus(item)} />
              </View>

              {assigningFor === item.id ? (
                <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                  <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>ROLE</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                    {(roles.data ?? []).map((r) => (
                      <Button key={r.id} label={r.name} size="sm" variant={roleId === r.id ? 'primary' : 'outline'} onPress={() => setRoleId(r.id)} />
                    ))}
                  </View>
                  <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>SCOPE</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                    {(['school', 'grade', 'class', 'self'] as ScopeType[]).map((st) => (
                      <Button
                        key={st}
                        label={st}
                        size="sm"
                        variant={scopeType === st ? 'primary' : 'outline'}
                        onPress={() => {
                          setScopeType(st);
                          setScopeId(null);
                        }}
                      />
                    ))}
                  </View>
                  {scopeType === 'grade' ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                      {(grades.data ?? []).map((g) => (
                        <Button key={g.id} label={g.name} size="sm" variant={scopeId === g.id ? 'primary' : 'outline'} onPress={() => setScopeId(g.id)} />
                      ))}
                    </View>
                  ) : null}
                  {scopeType === 'class' ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                      {(classes.data ?? []).map((c) => (
                        <Button key={c.id} label={c.name} size="sm" variant={scopeId === c.id ? 'primary' : 'outline'} onPress={() => setScopeId(c.id)} />
                      ))}
                    </View>
                  ) : null}
                  <Button label="Grant" size="sm" onPress={() => void submitAssign(item.id)} loading={saving} />
                </View>
              ) : null}
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
}
