import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Button, Card, DateField, EmptyState, Hero, HeroDoodle, Icon, Screen, ScreenHeader, TextField } from '@/components';
import { useClasses } from '@/features/students/hooks';
import { useConfirmDiscardOnLeave } from '@/hooks/useConfirmDiscardOnLeave';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import type { RootStackParamList } from '@/navigation/types';
import { colors, elevation, minTapTarget, radius, semantic, spacing, typography } from '@/theme/tokens';
import { formatDMYInput, parseDMY, toDMY } from '@/lib/date';
import { isValidEmail } from '@/lib/validate';
import {
  assignRole,
  createStaffAccount,
  createStaffLogin,
  revokeRole,
  roleScopeType,
  setStaffStatus,
  sortRoleOptions,
  updateStaffAccount,
  type AccountRow,
} from './api';
import { AccountCard, confirmRevoke } from './AccountCard';
import { useAccounts, useRoles } from './hooks';
import { ImportStaffSection } from './ImportStaffSection';

type ScopeType = 'school' | 'grade' | 'class' | 'self';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function UserAccountsScreen() {
  const navigation = useNavigation<Nav>();
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
  const [showImport, setShowImport] = useState(false);
  const [query, setQuery] = useState('');
  const [staffNo, setStaffNo] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [joinedOn, setJoinedOn] = useState('');
  const [saving, setSaving] = useState(false);

  const [assigningFor, setAssigningFor] = useState<string | null>(null);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [scopeType, setScopeType] = useState<ScopeType>('school');
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [creatingLoginFor, setCreatingLoginFor] = useState<string | null>(null);
  const [importDirty, setImportDirty] = useState(false);
  const [dirtyAccountIds, setDirtyAccountIds] = useState<Set<string>>(new Set());

  const creatingDirty =
    creating &&
    (!!staffNo.trim() || !!fullName.trim() || !!phone.trim() || !!email.trim() || !!address.trim() || !!birthDate.trim() || !!joinedOn.trim());
  const assigningDirty = assigningFor != null && !!roleId;

  useConfirmDiscardOnLeave(creatingDirty || importDirty || assigningDirty || dirtyAccountIds.size > 0);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['accounts', 'list'] });
  }

  async function submitCreate() {
    if (!staffNo.trim() || !fullName.trim() || !phone.trim()) return;
    if (email.trim() && !isValidEmail(email)) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }
    const isoBirthDate = birthDate.trim() ? parseDMY(birthDate) : undefined;
    if (birthDate.trim() && !isoBirthDate) {
      Alert.alert('Invalid birth date', 'Enter birth date as DD/MM/YYYY.');
      return;
    }
    const isoJoinedOn = joinedOn.trim() ? parseDMY(joinedOn) : undefined;
    if (joinedOn.trim() && !isoJoinedOn) {
      Alert.alert('Invalid joined date', 'Enter the joined date as DD/MM/YYYY.');
      return;
    }

    // Instant feedback against what's already loaded — the DB's unique indexes
    // (20260914060000_staff_email_phone_unique.sql) are the real backstop for a race
    // between two admins, but there's no reason to wait on a round trip for the common case.
    const staffNoNorm = staffNo.trim().toLowerCase();
    const phoneNorm = phone.trim();
    const emailNorm = email.trim().toLowerCase();
    const existing = accounts.data ?? [];
    if (existing.some((a) => a.staffNo.trim().toLowerCase() === staffNoNorm)) {
      Alert.alert('Staff number already in use', 'Another staff member already has this staff number.');
      return;
    }
    if (existing.some((a) => a.phone.trim() === phoneNorm)) {
      Alert.alert('Phone number already in use', 'Another staff member already has this phone number.');
      return;
    }
    if (emailNorm && existing.some((a) => (a.email ?? '').trim().toLowerCase() === emailNorm)) {
      Alert.alert('Email already in use', 'Another staff member already has this email address.');
      return;
    }

    setSaving(true);
    try {
      await createStaffAccount({
        staffNo: staffNo.trim(),
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        birthDate: isoBirthDate ?? undefined,
        joinedOn: isoJoinedOn ?? undefined,
      });
      setCreating(false);
      setStaffNo('');
      setFullName('');
      setPhone('');
      setEmail('');
      setAddress('');
      setBirthDate('');
      setJoinedOn('');
      await invalidate();
    } catch (err) {
      Alert.alert('Could not create staff account', err instanceof Error ? err.message : 'Please try again.');
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

  async function doRevoke(staffRoleId: string) {
    await revokeRole(staffRoleId);
    await invalidate();
  }

  async function doUpdate(
    staffId: string,
    input: { staffNo: string; fullName: string; phone: string; email?: string; address?: string; birthDate?: string; joinedOn?: string },
  ) {
    await updateStaffAccount(staffId, input);
    await invalidate();
  }

  async function doCreateLogin(account: AccountRow) {
    setCreatingLoginFor(account.id);
    try {
      const { email, temporaryPassword, emailSent, created } = await createStaffLogin(account.id);
      await invalidate();
      Alert.alert(
        created ? 'Login created' : 'New login issued',
        emailSent
          ? `An email with their sign-in details has been sent to ${email}.\n\nIf it doesn't arrive, here's the temporary password to relay yourself: ${temporaryPassword}`
          : `Couldn't email them automatically — give ${account.fullName} these details yourself:\n\nEmail: ${email}\nTemporary password: ${temporaryPassword}\n\nThey'll be asked to choose their own password immediately after signing in — this one won't be shown again.`,
      );
    } catch (err) {
      Alert.alert('Could not create login', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setCreatingLoginFor(null);
    }
  }

  const term = query.trim().toLowerCase();
  const filteredAccounts = term
    ? (accounts.data ?? []).filter((a) => a.fullName.toLowerCase().includes(term) || a.staffNo.toLowerCase().includes(term))
    : accounts.data ?? [];

  const emailError = creating && email.trim() && !isValidEmail(email) ? 'Enter a valid email address.' : undefined;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="key-outline" bottomIcon="shield-checkmark-outline" />
        <ScreenHeader title="Staff accounts" tone="onPrimary" back={navigation.canGoBack()} hideBell>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showImport ? 'Hide import' : 'Import staff'}
              hitSlop={8}
              onPress={() => setShowImport((v) => !v)}
              style={[styles.headerButton, showImport && styles.headerButtonActive]}
            >
              <Icon name="cloud-upload-outline" size={22} color={colors.white} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={creating ? 'Cancel create staff account' : 'Create staff account'}
              hitSlop={8}
              onPress={() => setCreating((v) => !v)}
              style={[styles.headerButton, creating && styles.headerButtonActive]}
            >
              <Icon name={creating ? 'close' : 'person-add-outline'} size={22} color={colors.white} />
            </Pressable>
          </View>
        </ScreenHeader>
      </Hero>

      <View style={styles.searchCard}>
        <Icon name="search-outline" size={18} color={semantic.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or staff number"
          placeholderTextColor={colors.ink300}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
        {query.length > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery('')}>
            <Icon name="close-circle" size={18} color={colors.ink300} />
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={filteredAccounts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.xl }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          creating || showImport ? (
            <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
              {creating ? (
                <Card>
                  <TextField label="Staff number" value={staffNo} onChangeText={setStaffNo} autoCapitalize="none" />
                  <TextField label="Full name" value={fullName} onChangeText={setFullName} />
                  <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                  <TextField
                    label="Email"
                    hint={emailError ? undefined : 'Needed to create their login later'}
                    error={emailError}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                  <TextField label="Address (optional)" value={address} onChangeText={setAddress} multiline />
                  <DateField
                    label="Birth date (optional)"
                    value={birthDate}
                    onChangeText={(t) => setBirthDate(formatDMYInput(t))}
                    onPickIso={(iso) => setBirthDate(toDMY(iso))}
                    maxDate={today}
                    mode="yearFirst"
                  />
                  <DateField
                    label="Joined date (optional)"
                    value={joinedOn}
                    onChangeText={(t) => setJoinedOn(formatDMYInput(t))}
                    onPickIso={(iso) => setJoinedOn(toDMY(iso))}
                    maxDate={today}
                    mode="yearFirst"
                  />
                  <Button label="Save" onPress={() => void submitCreate()} loading={saving} />
                </Card>
              ) : null}
              {showImport ? <ImportStaffSection onDirtyChange={setImportDirty} /> : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          accounts.isLoading ? (
            <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
          ) : (
            <EmptyState title={term ? 'No staff match your search' : 'No staff accounts'} />
          )
        }
        renderItem={({ item }) => (
            <AccountCard
              account={item}
              isAssigning={assigningFor === item.id}
              onToggleAssigning={() => {
                setAssigningFor(assigningFor === item.id ? null : item.id);
                setRoleId(null);
                setScopeId(null);
              }}
              roles={sortRoleOptions(roles.data ?? [])}
              roleId={roleId}
              onSelectRole={(id) => {
                setRoleId(id);
                const role = (roles.data ?? []).find((r) => r.id === id);
                setScopeType(roleScopeType(role?.key));
                setScopeId(null);
              }}
              scopeType={scopeType}
              scopeId={scopeId}
              onSelectScopeId={setScopeId}
              grades={grades.data ?? []}
              classes={classes.data ?? []}
              onGrant={() => void submitAssign(item.id)}
              saving={saving}
              onToggleStatus={() => void toggleStatus(item)}
              onRevokeRole={(staffRoleId, roleName, scope) => confirmRevoke(item.fullName, roleName, scope, () => void doRevoke(staffRoleId))}
              onCreateLogin={() => void doCreateLogin(item)}
              isCreatingLogin={creatingLoginFor === item.id}
              onUpdate={(input) => doUpdate(item.id, input)}
              onDirtyChange={(dirty) =>
                setDirtyAccountIds((prev) => {
                  if (dirty === prev.has(item.id)) return prev;
                  const next = new Set(prev);
                  if (dirty) next.add(item.id);
                  else next.delete(item.id);
                  return next;
                })
              }
            />
          )}
        />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerButtonActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: -spacing.lg,
    minHeight: minTapTarget,
    backgroundColor: semantic.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    ...elevation.raised,
  },
  searchInput: { flex: 1, ...typography.body, color: semantic.textPrimary, paddingVertical: spacing.sm },
});
