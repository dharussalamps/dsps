import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, TextField } from '@/components';
import { pickCsvFile } from '@/lib/csvFile';
import { supabase } from '@/lib/supabase';
import { spacing, typography, semantic, colors } from '@/theme/tokens';

type ImportResult = {
  total: number;
  accepted: number;
  rejected: number;
  results: { row_index: number; id: string; accepted: boolean; error: string | null }[];
};

const CSV_COLUMNS = [
  'admission_no',
  'full_name',
  'preferred_name',
  'date_of_birth',
  'gender',
  'class_name',
  'guardian_nic_number',
  'guardian_name',
  'guardian_relationship',
  'guardian_phone',
  'guardian_phone_alt',
  'guardian_email',
  'guardian_occupation',
  'guardian_economic_status',
  'guardian_address',
  'guardian_gs_division',
];

function duplicateMessage(error: string | null): string | null {
  if (error === 'duplicate_admission_no') return 'Already exists in the system — skipped, no changes made.';
  return null;
}

/**
 * section 8/build task 5: spreadsheet import. Section 10's screen table
 * has no dedicated route for this — it's a one-time administrative
 * operation, not a regular navigation destination — so it's folded into
 * AddStudentScreen (already student-creation-scoped, and gated the same
 * way — see useCanCreateStudents) rather than a new route (see
 * backend/supabase/functions/import-records for the shared
 * per-row-savepoint pattern the RPC uses).
 */
export function ImportStudentsSection() {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickFile() {
    setError(null);
    try {
      const picked = await pickCsvFile();
      if (!picked) return;
      setCsv(picked.content);
      setFileName(picked.name);
    } catch {
      setError('Could not read that file. Try a different one.');
    }
  }

  async function submit() {
    if (!csv.trim()) return;
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke<ImportResult>('import-records', {
        body: { entity: 'students', csv },
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
      <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>Columns:</Text>
      <View style={{ gap: 2 }}>
        {CSV_COLUMNS.map((c) => (
          <Text key={c} style={{ ...typography.caption, color: semantic.textPrimary }}>
            {c}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Button label="Choose file" size="sm" variant="outline" onPress={() => void pickFile()} />
        {fileName ? (
          <Text style={{ ...typography.caption, color: semantic.textSecondary, flexShrink: 1 }} numberOfLines={1}>
            {fileName}
          </Text>
        ) : null}
      </View>
      <TextField
        placeholder="Or paste CSV here, including the header row"
        value={csv}
        onChangeText={(v) => {
          setCsv(v);
          setFileName(null);
        }}
        multiline
        style={{ minHeight: 100 }}
      />
      <Button label="Import" onPress={() => void submit()} loading={importing} disabled={!csv.trim()} />

      {error ? <Text style={{ ...typography.caption, color: colors.error }}>{error}</Text> : null}

      {result ? (
        <View style={{ gap: spacing.xs }}>
          <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
            {result.accepted} student{result.accepted === 1 ? '' : 's'} created, {result.rejected} skipped of {result.total} rows
          </Text>
          {result.results
            .filter((r) => !r.accepted)
            .map((r) => {
              const dup = duplicateMessage(r.error);
              return (
                <Text key={r.row_index} style={{ ...typography.caption, color: dup ? colors.warning : colors.error }}>
                  Row {r.row_index} ({r.id || 'no id'}): {dup ?? r.error}
                </Text>
              );
            })}
        </View>
      ) : null}
    </Card>
  );
}
