// AdminSpec.md section 8: POST /import-records — "One-time spreadsheet
// import. Accepts CSV, validates, returns a reconciliation report of
// accepted and rejected rows. Never partially commits."
//
// FR-ADM-06 (P1) names both students *and* staff; only students were wired
// up here (see docs/AdminSpec.md section 17's note on this file). Staff
// import follows the identical parse -> validate -> call import_<entity>()
// RPC shape, now added alongside it — see 20260908000009_import_staff.sql
// for the RPC.
//
// Body: { entity: 'students' | 'staff', csv: string }. Uses the caller's
// own Authorization header — both RPCs check their own permission
// (student.edit / staff.manage respectively).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsPreflightResponse, dbErrorToResponse, errorResponse, jsonResponse } from '../_shared/http.ts';

const bodySchema = z.object({
  entity: z.enum(['students', 'staff']),
  csv: z.string().min(1),
});

const studentRowSchema = z.object({
  admission_no: z.string().trim().min(1),
  full_name: z.string().trim().min(1),
  preferred_name: z.string().trim().optional(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  gender: z.enum(['male', 'female']).optional().or(z.literal('')),
  class_name: z.string().trim().optional(),
  guardian_nic_number: z.string().trim().optional(),
  guardian_name: z.string().trim().optional(),
  guardian_relationship: z.string().trim().optional(),
  guardian_phone: z.string().trim().optional(),
  guardian_phone_alt: z.string().trim().optional(),
  guardian_email: z.string().trim().email().optional().or(z.literal('')),
  guardian_occupation: z.string().trim().optional(),
  guardian_economic_status: z.string().trim().optional(),
  guardian_address: z.string().trim().optional(),
  guardian_gs_division: z.string().trim().optional(),
});

const staffRowSchema = z.object({
  staff_no: z.string().trim().min(1),
  full_name: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  email: z.string().trim().email().optional().or(z.literal('')),
  joined_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
});

const entityConfig = {
  students: { rowSchema: studentRowSchema, rpc: 'import_students', idField: 'admission_no' as const },
  staff: { rowSchema: staffRowSchema, rpc: 'import_staff', idField: 'staff_no' as const },
};

/** Minimal RFC 4180 CSV parser: handles quoted fields, escaped quotes, and commas/newlines inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

function rowsToObjects(rows: string[][]): Record<string, string>[] {
  const [header, ...dataRows] = rows;
  return dataRows.map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((key, i) => (obj[key.trim()] = (r[i] ?? '').trim()));
    return obj;
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse();
  if (req.method !== 'POST') return errorResponse(405, { code: 'method_not_allowed', message: 'Use POST.' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse(401, { code: 'unauthenticated', message: 'Missing Authorization header.' });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    const issue = err instanceof z.ZodError ? err.issues[0] : undefined;
    return errorResponse(400, { code: 'invalid_payload', message: issue?.message ?? 'Invalid request body.' });
  }

  const config = entityConfig[body.entity];
  const rawRows = rowsToObjects(parseCsv(body.csv));

  // validRows and preRejected are built from the same rawRows pass, but
  // the RPC only ever sees validRows — it has no way to know each row's
  // *original* 1-based position in the CSV, only its position within the
  // filtered array it was given. originalIndexOfValidRow bridges that back
  // after the RPC responds, so row_index in the final report always means
  // "this line in the uploaded file", not "this line among the valid ones".
  const validRows: Record<string, string>[] = [];
  const originalIndexOfValidRow: number[] = [];
  const preRejected: { row_index: number; id: string; accepted: false; error: string }[] = [];

  rawRows.forEach((raw, i) => {
    const result = config.rowSchema.safeParse(raw);
    if (result.success) {
      validRows.push(result.data as unknown as Record<string, string>);
      originalIndexOfValidRow.push(i + 1);
    } else {
      preRejected.push({
        row_index: i + 1,
        id: raw[config.idField] ?? '',
        accepted: false,
        error: result.error.issues[0]?.message ?? 'Invalid row',
      });
    }
  });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  let dbResults: { row_index: number; id: string; accepted: boolean; error: string | null }[] = [];
  if (validRows.length > 0) {
    const { data, error } = await supabase.rpc(config.rpc, { p_rows: validRows });
    if (error) return dbErrorToResponse(error);
    // data comes back in the same order as validRows (the RPC processes
    // p_rows via jsonb_array_elements, which preserves array order), so
    // position-based remapping is safe here. Each RPC names its own id
    // column (admission_no / staff_no) — normalized to `id` here.
    type RpcRow = { row_index: number; accepted: boolean; error: string | null; [key: string]: unknown };
    dbResults = ((data ?? []) as RpcRow[]).map((r, k) => ({
      row_index: originalIndexOfValidRow[k],
      id: String(r[config.idField] ?? ''),
      accepted: r.accepted,
      error: r.error,
    }));
  }

  const allResults = [...preRejected, ...dbResults].sort((a, b) => a.row_index - b.row_index);

  return jsonResponse({
    total: rawRows.length,
    accepted: allResults.filter((r) => r.accepted).length,
    rejected: allResults.filter((r) => !r.accepted).length,
    results: allResults,
  });
});
