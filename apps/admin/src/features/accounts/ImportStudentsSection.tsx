import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, TextField } from '@/components';
import { supabase } from '@/lib/supabase';
import { spacing, typography, semantic, colors } from '@/theme/tokens';

type Entity = 'students' | 'staff';

type ImportResult = {
  total: number;
  accepted: number;
  rejected: number;
  results: { row_index: number; id: string; accepted: boolean; error: string | null }[];
};

const COLUMNS: Record<Entity, string> = {
  students: 'admission_no, full_name, preferred_name, date_of_birth, class_name, guardian_name, guardian_relationship, guardian_phone',
  staff: 'staff_no, full_name, phone, email, joined_on',
};

/**
 * section 8/build task 5: spreadsheet import. Section 10's screen table
 * has no dedicated route for this — it's a one-time administrative
 * operation, not a regular navigation destination — so it's folded into
 * UserAccountsScreen (already account-management-scoped) rather than a
 * new route. No file picker is installed, so this pastes CSV text
 * directly. FR-ADM-06 (P1) names both students and staff — both are wired
 * here (see backend/supabase/functions/import-records for the shared
 * per-row-savepoint pattern each entity's RPC uses).
 */
export function ImportStudentsSection() {
  const [entity, setEntity] = useState<Entity>('students');
  const [csv, setCsv] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!csv.trim()) return;
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke<ImportResult>('import-records', {
        body: { entity, csv },
      });
      if (fnError) throw fnError;
      setResult(data ?? null);
    } catch {
      setError('Import failed. Check the CSV and try again.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card>
      <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>IMPORT (CSV)</Text>
      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
        <Button label="Students" size="sm" variant={entity === 'students' ? 'primary' : 'outline'} onPress={() => setEntity('students')} />
        <Button label="Staff" size="sm" variant={entity === 'staff' ? 'primary' : 'outline'} onPress={() => setEntity('staff')} />
      </View>
      <Text style={{ ...typography.caption, color: semantic.textSecondary }}>Columns: {COLUMNS[entity]}</Text>
      <TextField placeholder="Paste CSV here, including the header row" value={csv} onChangeText={setCsv} multiline style={{ minHeight: 100 }} />
      <Button label="Import" onPress={() => void submit()} loading={importing} disabled={!csv.trim()} />

      {error ? <Text style={{ ...typography.caption, color: colors.error }}>{error}</Text> : null}

      {result ? (
        <View style={{ gap: spacing.xs }}>
          <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
            {result.accepted} accepted, {result.rejected} rejected of {result.total}
          </Text>
          {result.results
            .filter((r) => !r.accepted)
            .map((r) => (
              <Text key={r.row_index} style={{ ...typography.caption, color: colors.error }}>
                Row {r.row_index} ({r.id || 'no id'}): {r.error}
              </Text>
            ))}
        </View>
      ) : null}
    </Card>
  );
}
