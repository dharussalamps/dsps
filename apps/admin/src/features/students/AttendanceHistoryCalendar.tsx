import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addMonths, eachDayOfInterval, endOfMonth, format, getDay, startOfMonth } from 'date-fns';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, TextField } from '@/components';
import { fetchStudentAttendanceMonth, amendStudentAttendance, type StudentAttendanceDay } from '@/features/attendance/api';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';

type Props = { studentId: string };

const STATUS_STYLE: Record<StudentAttendanceDay['status'], { bg: string; fg: string; label: string }> = {
  present: { bg: colors.successBg, fg: colors.success, label: 'Present' },
  absent: { bg: colors.errorBg, fg: colors.error, label: 'Absent' },
  late: { bg: colors.warningBg, fg: colors.warning, label: 'Late' },
};

/**
 * FR-ATT-14: "attendance history for a student is presented as a monthly
 * calendar of school days only, distinguishing present, absent, late and
 * early leave." Cells simply have nothing to render on a non-school day —
 * there's no student_attendance row for one, so "school days only" falls
 * out of the data rather than needing a separate is_school_day check per
 * cell.
 */
export function AttendanceHistoryCalendar({ studentId }: Props) {
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const monthStart = format(monthCursor, 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(monthCursor), 'yyyy-MM-dd');

  const days = useQuery({
    queryKey: ['attendance', 'student-month', studentId, monthStart],
    queryFn: () => fetchStudentAttendanceMonth(studentId, monthStart, monthEnd),
  });

  const byDate = useMemo(() => new Map((days.data ?? []).map((d) => [d.onDate, d])), [days.data]);
  const grid = useMemo(() => buildGrid(monthCursor), [monthCursor]);
  const selectedDay = selected ? byDate.get(selected) : undefined;

  const presentCount = (days.data ?? []).filter((d) => d.status === 'present').length;
  const total = days.data?.length ?? 0;
  const pct = total > 0 ? Math.round((presentCount / total) * 100) : null;

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>ATTENDANCE HISTORY</Text>
        {pct != null ? <Text style={{ ...typography.captionStrong, color: semantic.textPrimary }}>{pct}% this month</Text> : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm }}>
        <Pressable onPress={() => setMonthCursor((m) => addMonths(m, -1))} hitSlop={12}>
          <Text style={{ ...typography.bodyStrong, color: semantic.primary }}>‹</Text>
        </Pressable>
        <Text style={{ ...typography.subtitle, color: semantic.textPrimary }}>{format(monthCursor, 'MMMM yyyy')}</Text>
        <Pressable onPress={() => setMonthCursor((m) => addMonths(m, 1))} hitSlop={12}>
          <Text style={{ ...typography.bodyStrong, color: semantic.primary }}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => (
          <Text key={`${w}-${i}`} style={styles.weekLabel}>
            {w}
          </Text>
        ))}
      </View>

      {grid.map((week, i) => (
        <View key={i} style={styles.weekRow}>
          {week.map((cell, j) => {
            if (!cell) return <View key={j} style={styles.cell} />;
            const iso = format(cell, 'yyyy-MM-dd');
            const day = byDate.get(iso);
            const style = day ? STATUS_STYLE[day.status] : null;
            return (
              <Pressable
                key={j}
                style={[styles.cell, style ? { backgroundColor: style.bg, borderRadius: radius.sm } : null]}
                onPress={() => day && setSelected(iso === selected ? null : iso)}
                disabled={!day}
              >
                <Text style={[styles.cellText, style ? { color: style.fg, fontWeight: '700' } : { color: semantic.textSecondary }]}>
                  {cell.getDate()}
                </Text>
                {day?.earlyLeave ? <View style={styles.earlyLeaveDot} /> : null}
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md }}>
        {(Object.keys(STATUS_STYLE) as (keyof typeof STATUS_STYLE)[]).map((k) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: STATUS_STYLE[k].bg, borderWidth: 1, borderColor: STATUS_STYLE[k].fg }} />
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{STATUS_STYLE[k].label}</Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <View style={styles.earlyLeaveDot} />
          <Text style={{ ...typography.caption, color: semantic.textSecondary }}>Early leave</Text>
        </View>
      </View>

      {selectedDay ? (
        <DayEditor
          studentId={studentId}
          onDate={selected as string}
          day={selectedDay}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ['attendance', 'student-month', studentId, monthStart] });
            setSelected(null);
          }}
        />
      ) : null}
    </Card>
  );
}

function DayEditor({
  studentId,
  onDate,
  day,
  onSaved,
}: {
  studentId: string;
  onDate: string;
  day: StudentAttendanceDay;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState(day.status);
  const [reason, setReason] = useState(day.reason ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // FR-ATT-06: after the edit window only attendance.amend_locked can
  // write, and only with a reason — enforced server-side by RLS; a rejected
  // write surfaces here rather than being pre-guessed client-side.
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await amendStudentAttendance(studentId, onDate, { status, reason: reason.trim() || null });
      onSaved();
    } catch {
      setError('This day can no longer be edited directly — ask an administrator to amend it, with a reason.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: semantic.border, gap: spacing.sm }}>
      <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{format(new Date(onDate), 'EEEE d MMMM')}</Text>
      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
        {(['present', 'absent', 'late'] as const).map((s) => (
          <Button key={s} label={STATUS_STYLE[s].label} size="sm" variant={status === s ? 'primary' : 'outline'} onPress={() => setStatus(s)} />
        ))}
      </View>
      <TextField label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="e.g. medical appointment" />
      {day.earlyLeave ? (
        <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
          Early leave at {day.earlyLeave.leftAt}{day.earlyLeave.reason ? ` · ${day.earlyLeave.reason}` : ''}
        </Text>
      ) : null}
      {error ? <Text style={{ ...typography.caption, color: colors.error }}>{error}</Text> : null}
      <Button label="Save" onPress={() => void save()} loading={busy} size="sm" />
    </View>
  );
}

function buildGrid(monthCursor: Date): (Date | null)[][] {
  const start = startOfMonth(monthCursor);
  const end = endOfMonth(monthCursor);
  const days = eachDayOfInterval({ start, end });
  const leadingBlanks = getDay(start); // 0 = Sunday
  const cells: (Date | null)[] = [...Array(leadingBlanks).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const styles = StyleSheet.create({
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  weekLabel: { ...typography.caption, color: semantic.textSecondary, width: 36, textAlign: 'center' },
  cell: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  cellText: { ...typography.caption },
  earlyLeaveDot: { position: 'absolute', bottom: 2, width: 5, height: 5, borderRadius: 3, backgroundColor: colors.info },
});
