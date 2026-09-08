import { useState } from 'react';
import { Linking, View } from 'react-native';
import { Button, TextField } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { spacing } from '@/theme/tokens';
import { logCall } from './api';

type Props = { studentId: string; guardianId?: string; phone: string };

/**
 * FR-STU-07/08: "a permitted user may place a telephone call to a guardian
 * directly from the student record" and then "is prompted to record its
 * purpose in one line, retained against the student." The device never
 * tells the app when a `tel:` call actually ends, so the prompt appears
 * immediately after dialing rather than waiting for a callback that
 * doesn't exist — the same practical compromise most call-logging mobile
 * apps make.
 */
export function GuardianCallButton({ studentId, guardianId, phone }: Props) {
  const staff = useAuthStore((s) => s.staff);
  const [prompting, setPrompting] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [saving, setSaving] = useState(false);

  function call() {
    Linking.openURL(`tel:${phone}`);
    setPrompting(true);
  }

  async function save() {
    if (!staff) return;
    setSaving(true);
    try {
      await logCall({ studentId, guardianId, purpose: purpose.trim(), callerId: staff.id });
      setPrompting(false);
      setPurpose('');
    } finally {
      setSaving(false);
    }
  }

  if (prompting) {
    return (
      <View style={{ gap: spacing.xs, minWidth: 180 }}>
        <TextField placeholder="Purpose of the call (optional)" value={purpose} onChangeText={setPurpose} autoFocus />
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          <Button label="Save" size="sm" onPress={() => void save()} loading={saving} />
          <Button label="Skip" size="sm" variant="ghost" onPress={() => setPrompting(false)} />
        </View>
      </View>
    );
  }

  return <Button label="Call" size="sm" variant="outline" onPress={call} />;
}
