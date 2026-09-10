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

const COLUMNS = 'admission_no, full_name, preferred_name, date_of_birth, class_name, guardian_name, guardian_relationship, guardian_phone';

/**
 * section 8/build task 5: spreadsheet import. Section 10's screen table
 * has no dedicated route for this — it's a one-time administrative
 * operation, not a regular navigation destination — so it's folded into
 * StudentSearchScreen (already student-management-scoped) rather than a
 * new route (see backend/supabase/functions/import-records for the shared
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
      <Text style={{ ...typography.caption, color: semantic.textSecondary }}>Columns: {COLUMNS}</Text>
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
