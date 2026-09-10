import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, Card, Icon, StatusPill, TextField } from '@/components';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';
import type { AccountRow, RoleOption } from './api';

type ScopeType = 'school' | 'grade' | 'class' | 'self';

const scopeMeta: Record<ScopeType, { label: string; icon: 'school-outline' | 'layers-outline' | 'people-outline' | 'person-outline' }> = {
  school: { label: 'Whole school', icon: 'school-outline' },
  grade: { label: 'A grade', icon: 'layers-outline' },
  class: { label: 'A class', icon: 'people-outline' },
  self: { label: 'Just them', icon: 'person-outline' },
};

type Props = {
  account: AccountRow;
  isAssigning: boolean;
  onToggleAssigning: () => void;
  roles: RoleOption[];
  roleId: string | null;
  onSelectRole: (id: string) => void;
  scopeType: ScopeType;
  onSelectScope: (s: ScopeType) => void;
  scopeId: string | null;
  onSelectScopeId: (id: string) => void;
  grades: { id: string; name: string }[];
  classes: { id: string; name: string }[];
  onGrant: () => void;
  saving: boolean;
  onToggleStatus: () => void;
  onRevokeRole: (staffRoleId: string, roleName: string, scopeType: string) => void;
  onCreateLogin: () => void;
  isCreatingLogin: boolean;
  onUpdate: (input: { staffNo: string; fullName: string; phone: string; email?: string; birthDate?: string }) => Promise<void>;
};

/** A staff member's account row: identity, active roles, and inline role-management actions. */
export function AccountCard({
  account,
  isAssigning,
  onToggleAssigning,
  roles,
  roleId,
  onSelectRole,
  scopeType,
  onSelectScope,
  scopeId,
  onSelectScopeId,
  grades,
  classes,
  onGrant,
  saving,
  onToggleStatus,
  onRevokeRole,
  onCreateLogin,
  isCreatingLogin,
  onUpdate,
}: Props) {
  const isActive = account.status === 'active';

  const [isEditing, setIsEditing] = useState(false);
  const [staffNo, setStaffNo] = useState(account.staffNo);
  const [fullName, setFullName] = useState(account.fullName);
  const [phone, setPhone] = useState(account.phone);
  const [email, setEmail] = useState(account.email ?? '');
  const [birthDate, setBirthDate] = useState(account.birthDate ?? '');
  const [editSaving, setEditSaving] = useState(false);

  function openEdit() {
    setStaffNo(account.staffNo);
    setFullName(account.fullName);
    setPhone(account.phone);
    setEmail(account.email ?? '');
    setBirthDate(account.birthDate ?? '');
    setIsEditing(true);
  }

  async function saveEdit() {
    if (!staffNo.trim() || !fullName.trim() || !phone.trim()) return;
    setEditSaving(true);
    try {
      await onUpdate({
        staffNo: staffNo.trim(),
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        birthDate: birthDate.trim() || undefined,
      });
      setIsEditing(false);
    } catch (err) {
      Alert.alert('Could not save changes', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <Card style={styles.card}>
      <View style={[styles.accentBar, { backgroundColor: isActive ? colors.teal500 : colors.ink300 }]} />

      <View style={styles.header}>
        <Avatar name={account.fullName} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.nameRow}>
            <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary, flexShrink: 1 }} numberOfLines={1}>
              {account.fullName}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isEditing ? 'Cancel editing staff details' : 'Edit staff details'}
              hitSlop={8}
              onPress={() => (isEditing ? setIsEditing(false) : openEdit())}
            >
              <Icon name={isEditing ? 'close-circle' : 'create-outline'} size={15} color={semantic.textSecondary} />
            </Pressable>
          </View>
          <View style={styles.loginRow}>
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{account.staffNo}</Text>
            <View style={styles.dot} />
            <Icon
              name={account.hasLogin ? 'checkmark-circle' : 'time-outline'}
              size={13}
              color={account.hasLogin ? colors.teal700 : semantic.textSecondary}
            />
            <Text style={{ ...typography.caption, color: account.hasLogin ? colors.teal700 : semantic.textSecondary }}>
              {account.hasLogin ? 'Has login' : 'Awaiting login'}
            </Text>
          </View>
          {!account.hasLogin ? (
            account.email ? (
              <Button
                label="Create login"
                icon="key-outline"
                size="sm"
                variant="outline"
                loading={isCreatingLogin}
                onPress={onCreateLogin}
                style={styles.createLoginButton}
              />
            ) : (
              <Button
                label="Add email to enable login"
                icon="mail-outline"
                size="sm"
                variant="ghost"
                textColor={colors.warning}
                onPress={openEdit}
                style={styles.createLoginButton}
              />
            )
          ) : (
            <Button
              label="Resend login"
              icon="refresh-outline"
              size="sm"
              variant="ghost"
              loading={isCreatingLogin}
              onPress={() => confirmResendLogin(account.fullName, onCreateLogin)}
              style={styles.createLoginButton}
            />
          )}
        </View>
        <StatusPill label={isActive ? 'Active' : 'Inactive'} tone={isActive ? 'success' : 'neutral'} />
      </View>

      {isEditing ? (
        <View style={styles.editPanel}>
          <View style={styles.assignPanelHeader}>
            <Icon name="create-outline" size={15} color={semantic.primary} />
            <Text style={{ ...typography.captionStrong, color: semantic.primary }}>EDIT DETAILS</Text>
          </View>
          <TextField label="Staff number" value={staffNo} onChangeText={setStaffNo} autoCapitalize="none" />
          <TextField label="Full name" value={fullName} onChangeText={setFullName} />
          <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <TextField label="Email (optional)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <TextField label="Birth date (optional)" placeholder="YYYY-MM-DD" value={birthDate} onChangeText={setBirthDate} />
          <View style={styles.chipRow}>
            <Button label="Save changes" icon="checkmark" size="sm" onPress={() => void saveEdit()} loading={editSaving} style={{ flex: 1 }} />
            <Button label="Cancel" size="sm" variant="ghost" onPress={() => setIsEditing(false)} />
          </View>
        </View>
      ) : null}

      <View style={styles.rolesWrap}>
        {account.roles.length === 0 ? (
          <View style={styles.noRole}>
            <Icon name="alert-circle-outline" size={14} color={colors.warning} />
            <Text style={{ ...typography.caption, color: colors.warning }}>No role assigned yet</Text>
          </View>
        ) : (
          account.roles.map((r) => (
            <View key={r.staffRoleId} style={styles.roleChip}>
              <Icon name="shield-checkmark-outline" size={13} color={colors.gold900} />
              <Text style={styles.roleChipLabel}>
                {r.roleName} · {r.scopeType}
              </Text>
              <Button
                label=""
                accessibilityLabel={`Revoke ${r.roleName} (${r.scopeType})`}
                icon="close"
                size="sm"
                variant="ghost"
                style={styles.roleChipRemove}
                onPress={() => onRevokeRole(r.staffRoleId, r.roleName, r.scopeType)}
              />
            </View>
          ))
        )}
      </View>

      <View style={styles.divider} />

      <View style={styles.actions}>
        <Button
          label={isAssigning ? 'Cancel' : 'Assign role'}
          icon={isAssigning ? 'close-circle' : 'person-add-outline'}
          size="sm"
          variant="outline"
          onPress={onToggleAssigning}
          style={{ flex: 1 }}
        />
        <Button
          label={isActive ? 'Deactivate' : 'Reactivate'}
          icon="power-outline"
          size="sm"
          variant="ghost"
          textColor={isActive ? colors.error : colors.teal700}
          onPress={onToggleStatus}
          style={{ flex: 1 }}
        />
      </View>

      {isAssigning ? (
        <View style={styles.assignPanel}>
          <View style={styles.assignPanelHeader}>
            <Icon name="ribbon-outline" size={15} color={semantic.primary} />
            <Text style={{ ...typography.captionStrong, color: semantic.primary }}>GRANT A NEW ROLE</Text>
          </View>

          <Text style={styles.sectionLabel}>ROLE</Text>
          <View style={styles.chipRow}>
            {roles.map((r) => (
              <Button key={r.id} label={r.name} size="sm" variant={roleId === r.id ? 'primary' : 'outline'} onPress={() => onSelectRole(r.id)} />
            ))}
          </View>

          <Text style={styles.sectionLabel}>APPLIES TO</Text>
          <View style={styles.chipRow}>
            {(Object.keys(scopeMeta) as ScopeType[]).map((st) => (
              <Button
                key={st}
                label={scopeMeta[st].label}
                icon={scopeMeta[st].icon}
                size="sm"
                variant={scopeType === st ? 'primary' : 'outline'}
                onPress={() => onSelectScope(st)}
              />
            ))}
          </View>

          {scopeType === 'grade' ? (
            <View style={styles.chipRow}>
              {grades.map((g) => (
                <Button key={g.id} label={g.name} size="sm" variant={scopeId === g.id ? 'primary' : 'outline'} onPress={() => onSelectScopeId(g.id)} />
              ))}
            </View>
          ) : null}
          {scopeType === 'class' ? (
            <View style={styles.chipRow}>
              {classes.map((c) => (
                <Button key={c.id} label={c.name} size="sm" variant={scopeId === c.id ? 'primary' : 'outline'} onPress={() => onSelectScopeId(c.id)} />
              ))}
            </View>
          ) : null}

          <Button label="Grant role" icon="checkmark" onPress={onGrant} loading={saving} />
        </View>
      ) : null}
    </Card>
  );
}

export function confirmRevoke(fullName: string, roleName: string, scopeType: string, onConfirm: () => void) {
  Alert.alert('Revoke this role?', `${roleName} (${scopeType}) will be removed from ${fullName}.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Revoke', style: 'destructive', onPress: onConfirm },
  ]);
}

function confirmResendLogin(fullName: string, onConfirm: () => void) {
  Alert.alert(
    'Issue a new login?',
    `${fullName}'s current password will stop working immediately — a new temporary one will be issued and emailed to them (or shown to you if that fails).`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Issue new login', style: 'destructive', onPress: onConfirm },
    ],
  );
}

const styles = StyleSheet.create({
  card: { padding: 0, overflow: 'hidden' },
  accentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    paddingLeft: spacing.lg + 4,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  loginRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editPanel: {
    gap: spacing.sm,
    margin: spacing.lg,
    marginTop: 0,
    marginLeft: spacing.lg + 4,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: semantic.surfaceAlt,
  },
  createLoginButton: { alignSelf: 'flex-start', marginTop: spacing.xs, minHeight: 30, paddingHorizontal: spacing.sm },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: semantic.textSecondary },
  rolesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingLeft: spacing.lg + 4,
  },
  noRole: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.gold100,
    borderRadius: radius.pill,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: 2,
  },
  roleChipLabel: { ...typography.captionStrong, color: colors.gold900 },
  roleChipRemove: { minHeight: 24, paddingHorizontal: 4 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: semantic.border, marginHorizontal: spacing.lg },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingLeft: spacing.lg + 4,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
  assignPanel: {
    gap: spacing.sm,
    margin: spacing.lg,
    marginTop: 0,
    marginLeft: spacing.lg + 4,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: semantic.surfaceAlt,
  },
  assignPanelHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  sectionLabel: { ...typography.overline, color: semantic.textSecondary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
