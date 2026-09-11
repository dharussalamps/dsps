import { useEffect, useState } from 'react';
import { Keyboard, Text, View } from 'react-native';
import { Button, TextField } from '@/components';
import { createGuardian, linkGuardianToStudent } from '@/features/guardians/api';
import { useGuardianByNic } from '@/features/guardians/hooks';
import { colors, semantic, spacing, typography } from '@/theme/tokens';

type Props = { studentId: string; onLinked: () => void; onDirtyChange?: (dirty: boolean) => void };

const RELATIONSHIP_OPTIONS = ['Father', 'Mother', 'Grandparent', 'Brother/Sister', 'Guardian'];
const ECONOMIC_STATUS_OPTIONS = ['Low', 'L-M', 'Middle', 'U-M', 'High'];

/**
 * A guardian is one record shared across every child of theirs (section
 * 4.3's guardian model), so adding one here always writes to the guardians
 * table itself, not something scoped to this student. NIC number comes
 * first: once it matches an existing guardian (a sibling's parent, say) the
 * rest of the form autofills and locks — Save then just links that record
 * instead of creating a duplicate. No match means the form stays editable
 * to create a new guardian.
 */
export function AddGuardianSection({ studentId, onLinked, onDirtyChange }: Props) {
  const [nicNumber, setNicNumber] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [phonePrimary, setPhonePrimary] = useState('');
  const [phoneAlt, setPhoneAlt] = useState('');
  const [email, setEmail] = useState('');
  const [occupation, setOccupation] = useState('');
  const [economicStatus, setEconomicStatus] = useState('');
  const [address, setAddress] = useState('');
  const [gsDivision, setGsDivision] = useState('');

  const match = useGuardianByNic(nicNumber);
  const matched = match.data ?? null;
  const locked = !!matched;

  const dirty =
    !!nicNumber.trim() ||
    !!fullName.trim() ||
    !!relationship ||
    !!phonePrimary.trim() ||
    !!phoneAlt.trim() ||
    !!email.trim() ||
    !!occupation.trim() ||
    !!economicStatus ||
    !!address.trim() ||
    !!gsDivision.trim() ||
    isPrimary;

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-notify when dirtiness itself changes; cleanup resets on unmount too.
  }, [dirty]);

  function reset() {
    Keyboard.dismiss();
    setNicNumber('');
    setIsPrimary(false);
    setError(null);
    setFullName('');
    setRelationship('');
    setPhonePrimary('');
    setPhoneAlt('');
    setEmail('');
    setOccupation('');
    setEconomicStatus('');
    setAddress('');
    setGsDivision('');
  }

  async function save() {
    setError(null);

    if (matched) {
      setSaving(true);
      try {
        await linkGuardianToStudent(studentId, matched.id, isPrimary);
        reset();
        onLinked();
      } catch {
        setError('Could not link this guardian. You may not have permission to do this.');
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!nicNumber.trim() || !fullName.trim() || !phonePrimary.trim()) return;
    setSaving(true);
    try {
      const id = await createGuardian({
        fullName,
        relationship: relationship || undefined,
        phonePrimary,
        phoneAlt: phoneAlt || undefined,
        nicNumber,
        email: email || undefined,
        occupation: occupation || undefined,
        economicStatus: economicStatus || undefined,
        address: address || undefined,
        gsDivision: gsDivision || undefined,
      });
      await linkGuardianToStudent(studentId, id, isPrimary);
      reset();
      onLinked();
    } catch {
      setError('Could not add this guardian. You may not have permission to do this, or their NIC number may already be on file.');
    } finally {
      setSaving(false);
    }
  }

  const canSave = locked || (!!nicNumber.trim() && !!fullName.trim() && !!phonePrimary.trim());

  return (
    <View style={{ gap: spacing.sm, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: semantic.border }}>
      <TextField label="NIC number" value={nicNumber} onChangeText={setNicNumber} autoFocus autoCapitalize="none" />
      {match.isFetching ? (
        <Text style={{ ...typography.caption, color: semantic.textSecondary }}>Checking…</Text>
      ) : matched ? (
        <Text style={{ ...typography.caption, color: semantic.textSecondary }}>Existing guardian found — details below are locked in.</Text>
      ) : nicNumber.trim().length >= 5 ? (
        <Text style={{ ...typography.caption, color: semantic.textSecondary }}>No guardian found for this ID — fill in the form below.</Text>
      ) : null}

      <TextField label="Full name" value={locked ? matched.fullName : fullName} onChangeText={setFullName} editable={!locked} />

      <View style={{ gap: spacing.xs }}>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>Relationship</Text>
        {locked ? (
          <Text style={{ ...typography.body, color: semantic.textPrimary }}>{matched.relationship || '—'}</Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {RELATIONSHIP_OPTIONS.map((opt) => (
              <Button key={opt} label={opt} size="sm" variant={relationship === opt ? 'primary' : 'outline'} onPress={() => setRelationship(opt)} />
            ))}
          </View>
        )}
      </View>

      <TextField
        label="Contact number"
        value={locked ? matched.phonePrimary : phonePrimary}
        onChangeText={setPhonePrimary}
        keyboardType="phone-pad"
        editable={!locked}
      />
      <TextField
        label="Alternate number (optional)"
        value={locked ? matched.phoneAlt ?? '' : phoneAlt}
        onChangeText={setPhoneAlt}
        keyboardType="phone-pad"
        editable={!locked}
      />
      <TextField
        label="Email (optional)"
        value={locked ? matched.email ?? '' : email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        editable={!locked}
      />
      <TextField label="Occupation (optional)" value={locked ? matched.occupation ?? '' : occupation} onChangeText={setOccupation} editable={!locked} />

      <View style={{ gap: spacing.xs }}>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>Economic status (optional)</Text>
        {locked ? (
          <Text style={{ ...typography.body, color: semantic.textPrimary }}>{matched.economicStatus || '—'}</Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {ECONOMIC_STATUS_OPTIONS.map((opt) => (
              <Button
                key={opt}
                label={opt}
                size="sm"
                variant={economicStatus === opt ? 'primary' : 'outline'}
                onPress={() => setEconomicStatus(opt)}
              />
            ))}
          </View>
        )}
      </View>

      <TextField label="GS division (optional)" value={locked ? matched.gsDivision ?? '' : gsDivision} onChangeText={setGsDivision} editable={!locked} />
      <TextField label="Address (optional)" value={locked ? matched.address ?? '' : address} onChangeText={setAddress} multiline editable={!locked} />

      <Button
        label="Primary guardian"
        size="sm"
        variant={isPrimary ? 'primary' : 'outline'}
        icon={isPrimary ? 'star' : 'star-outline'}
        onPress={() => setIsPrimary((v) => !v)}
      />

      {error ? <Text style={{ ...typography.caption, color: colors.error }}>{error}</Text> : null}

      <Button label={locked ? 'Link guardian' : 'Save'} size="sm" onPress={() => void save()} loading={saving} disabled={!canSave} />
    </View>
  );
}
