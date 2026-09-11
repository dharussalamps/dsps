import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, TextField } from '@/components';
import { linkGuardianToStudent, updateGuardian } from '@/features/guardians/api';
import { useGuardianByNic } from '@/features/guardians/hooks';
import { colors, semantic, spacing, typography } from '@/theme/tokens';
import type { GuardianContact } from './api';

type Props = {
  studentId: string;
  guardian: GuardianContact;
  onSaved: () => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
};

const RELATIONSHIP_OPTIONS = ['Father', 'Mother', 'Grandparent', 'Brother/Sister', 'Guardian'];
const ECONOMIC_STATUS_OPTIONS = ['Low', 'L-M', 'Middle', 'U-M', 'High'];

/**
 * Edits a guardian's own record in place. Since a guardian is one record
 * shared across every child of theirs (see AddGuardianSection), saving here
 * changes what every one of their children's profiles shows.
 *
 * NIC number comes first, same reasoning as AddGuardianSection: changing it
 * to a NIC that already belongs to a different guardian (a sibling's parent
 * record, entered separately by mistake) means this student should link to
 * that existing record instead of writing a second copy of the same person.
 * Finding that match prefills the rest of the form from it — but unlike the
 * add flow, the fields stay editable here: Save writes any changes back to
 * that matched guardian's record, then links it to the student.
 */
export function EditGuardianSection({ studentId, guardian, onSaved, onCancel, onDirtyChange }: Props) {
  const [nicNumber, setNicNumber] = useState(guardian.nicNumber ?? '');
  const [fullName, setFullName] = useState(guardian.fullName);
  const [relationship, setRelationship] = useState(guardian.relationship ?? '');
  const [phonePrimary, setPhonePrimary] = useState(guardian.phonePrimary);
  const [phoneAlt, setPhoneAlt] = useState(guardian.phoneAlt ?? '');
  const [email, setEmail] = useState(guardian.email ?? '');
  const [occupation, setOccupation] = useState(guardian.occupation ?? '');
  const [economicStatus, setEconomicStatus] = useState(guardian.economicStatus ?? '');
  const [address, setAddress] = useState(guardian.address ?? '');
  const [gsDivision, setGsDivision] = useState(guardian.gsDivision ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedMatchId, setAppliedMatchId] = useState<string | null>(null);

  const match = useGuardianByNic(nicNumber);
  const matched = match.data && match.data.id !== guardian.guardianId ? match.data : null;

  if (matched && matched.id !== appliedMatchId) {
    setAppliedMatchId(matched.id);
    setFullName(matched.fullName);
    setRelationship(matched.relationship ?? '');
    setPhonePrimary(matched.phonePrimary);
    setPhoneAlt(matched.phoneAlt ?? '');
    setEmail(matched.email ?? '');
    setOccupation(matched.occupation ?? '');
    setEconomicStatus(matched.economicStatus ?? '');
    setAddress(matched.address ?? '');
    setGsDivision(matched.gsDivision ?? '');
  }

  const canSave = !!fullName.trim() && !!phonePrimary.trim();

  const dirty =
    nicNumber !== (guardian.nicNumber ?? '') ||
    fullName !== guardian.fullName ||
    relationship !== (guardian.relationship ?? '') ||
    phonePrimary !== guardian.phonePrimary ||
    phoneAlt !== (guardian.phoneAlt ?? '') ||
    email !== (guardian.email ?? '') ||
    occupation !== (guardian.occupation ?? '') ||
    economicStatus !== (guardian.economicStatus ?? '') ||
    address !== (guardian.address ?? '') ||
    gsDivision !== (guardian.gsDivision ?? '');

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-notify when dirtiness itself changes; cleanup resets on unmount too.
  }, [dirty]);

  async function save() {
    if (!canSave) return;
    setError(null);
    setSaving(true);
    try {
      const targetId = matched ? matched.id : guardian.guardianId;
      await updateGuardian(targetId, {
        fullName,
        relationship: relationship || undefined,
        phonePrimary,
        phoneAlt: phoneAlt || undefined,
        nicNumber: nicNumber || undefined,
        email: email || undefined,
        occupation: occupation || undefined,
        economicStatus: economicStatus || undefined,
        address: address || undefined,
        gsDivision: gsDivision || undefined,
      });
      if (matched) {
        await linkGuardianToStudent(studentId, matched.id, guardian.isPrimary);
      }
      onSaved();
    } catch {
      setError('Could not save this guardian. You may not have permission to do this.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <TextField label="NIC number" value={nicNumber} onChangeText={setNicNumber} autoFocus autoCapitalize="none" />
      {match.isFetching ? (
        <Text style={{ ...typography.caption, color: semantic.textSecondary }}>Checking…</Text>
      ) : matched ? (
        <Text style={{ ...typography.caption, color: semantic.textSecondary }}>Existing guardian found — details below are filled in from their record.</Text>
      ) : null}

      <TextField label="Full name" value={fullName} onChangeText={setFullName} />

      <View style={{ gap: spacing.xs }}>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>Relationship</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {RELATIONSHIP_OPTIONS.map((opt) => (
            <Button key={opt} label={opt} size="sm" variant={relationship === opt ? 'primary' : 'outline'} onPress={() => setRelationship(opt)} />
          ))}
        </View>
      </View>

      <TextField label="Contact number" value={phonePrimary} onChangeText={setPhonePrimary} keyboardType="phone-pad" />
      <TextField label="Alternate number (optional)" value={phoneAlt} onChangeText={setPhoneAlt} keyboardType="phone-pad" />
      <TextField label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <TextField label="Occupation (optional)" value={occupation} onChangeText={setOccupation} />

      <View style={{ gap: spacing.xs }}>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>Economic status (optional)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {ECONOMIC_STATUS_OPTIONS.map((opt) => (
            <Button key={opt} label={opt} size="sm" variant={economicStatus === opt ? 'primary' : 'outline'} onPress={() => setEconomicStatus(opt)} />
          ))}
        </View>
      </View>

      <TextField label="GS division (optional)" value={gsDivision} onChangeText={setGsDivision} />
      <TextField label="Address (optional)" value={address} onChangeText={setAddress} multiline />

      {error ? <Text style={{ ...typography.caption, color: colors.error }}>{error}</Text> : null}

      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
        <Button label={matched ? 'Save & link' : 'Save'} size="sm" onPress={() => void save()} loading={saving} disabled={!canSave} style={{ flex: 1 }} />
        <Button label="Cancel" size="sm" variant="ghost" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
