import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addMonths, eachDayOfInterval, endOfMonth, format, getDay, isSameDay, startOfMonth } from 'date-fns';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Icon, SectionHeader, TextField } from '@/components';
import { fetchStudentAttendanceMonth, amendStudentAttendance, type StudentAttendanceDay } from '@/features/attendance/api';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';

type Props = { studentId: string };

const STATUS_STYLE: Record<'present' | 'absent', { bg: string; fg: string; label: string }> = {
  present: { bg: colors.successBg, fg: colors.success, label: 'Present' },
  absent: { bg: colors.errorBg, fg: colors.error, label: 'Absent' },
};

/** Late still counts as attended for this calendar's display — 'late' isn't broken out as its own color/legend entry here. */
function cellStyle(status: StudentAttendanceDay['status']) {
  return STATUS_STYLE[status === 'late' ? 'present' : status];
}

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

  const presentCount = (days.data ?? []).filter((d) => d.status !== 'absent').length;
  const total = days.data?.length ?? 0;
  const pct = total > 0 ? Math.round((presentCount / total) * 100) : null;

  return (
    <Card>
      <SectionHeader
        icon="checkmark-done-outline"
        label="ATTENDANCE HISTORY"
        accessory={
          pct != null ? (
            <View style={styles.pctBadge}>
              <Text style={styles.pctBadgeText}>{pct}% this month</Text>
            </View>
          ) : undefined
        }
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={() => setMonthCursor((m) => addMonths(m, -1))}
          hitSlop={8}
          style={({ pressed }) => [styles.monthNavBtn, pressed && styles.monthNavBtnPressed]}
        >
          <Icon name="chevron-back" size={20} color={semantic.primary} />
        </Pressable>
        <Text style={{ ...typography.subtitle, color: semantic.textPrimary }}>{format(monthCursor, 'MMMM yyyy')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={() => setMonthCursor((m) => addMonths(m, 1))}
          hitSlop={8}
          style={({ pressed }) => [styles.monthNavBtn, pressed && styles.monthNavBtnPressed]}
        >
          <Icon name="chevron-forward" size={20} color={semantic.primary} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => (
          <Text key={`${w}-${i}`} style={styles.weekLabel}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {grid.map((week, i) => (
          <View key={i} style={styles.weekRow}>
            {week.map((cell, j) => {
              if (!cell) return <View key={j} style={styles.cell} />;
              const iso = format(cell, 'yyyy-MM-dd');
              const day = byDate.get(iso);
              const style = day ? cellStyle(day.status) : null;
              const today = isSameDay(cell, new Date());
              const isSelected = iso === selected;
              return (
                <Pressable
                  key={j}
                  style={[
                    styles.cell,
                    styles.cellCircle,
                    style ? { backgroundColor: style.bg } : null,
                    today ? styles.cellToday : null,
                    isSelected ? styles.cellSelected : null,
                  ]}
                  onPress={() => day && setSelected(iso === selected ? null : iso)}
                  disabled={!day}
                >
                  <Text
                    style={[
                      styles.cellText,
                      style ? { color: style.fg, fontWeight: '700' } : { color: semantic.textSecondary },
                      isSelected ? { color: colors.white } : null,
                    ]}
                  >
                    {cell.getDate()}
                  </Text>
                  {day?.earlyLeave ? <View style={styles.earlyLeaveDot} /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.legendRow}>
        {(Object.keys(STATUS_STYLE) as (keyof typeof STATUS_STYLE)[]).map((k) => (
          <View key={k} style={[styles.legendChip, { backgroundColor: STATUS_STYLE[k].bg }]}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: STATUS_STYLE[k].fg }} />
            <Text style={[styles.legendChipText, { color: STATUS_STYLE[k].fg }]}>{STATUS_STYLE[k].label}</Text>
          </View>
        ))}
        <View style={[styles.legendChip, { backgroundColor: colors.infoBg }]}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.info }} />
          <Text style={[styles.legendChipText, { color: colors.info }]}>Early leave</Text>
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
        {(['present', 'absent'] as const).map((s) => (
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
  monthNavBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavBtnPressed: { backgroundColor: semantic.border },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weekLabel: { ...typography.overline, color: semantic.textSecondary, width: 28, textAlign: 'center', letterSpacing: 0 },
  grid: { gap: 1, marginTop: spacing.xs },
  cell: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  cellCircle: { borderRadius: radius.pill },
  cellToday: { borderWidth: 1.5, borderColor: semantic.primary },
  cellSelected: { backgroundColor: semantic.primary },
  cellText: { ...typography.caption },
  earlyLeaveDot: { position: 'absolute', bottom: 1, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.info },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: semantic.border },
  legendChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  legendChipText: { ...typography.caption, fontWeight: '600' },
  pctBadge: { backgroundColor: colors.successBg, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  pctBadgeText: { ...typography.captionStrong, color: colors.success },
});
