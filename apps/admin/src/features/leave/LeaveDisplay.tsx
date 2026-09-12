import { format, subMonths } from 'date-fns';
import { StyleSheet, Text, View } from 'react-native';
import { Card, Icon, StatusPill, type IconName } from '@/components';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';
import { MATERNITY_KEY, SHORT_LEAVE_KEY, type LeaveBalance, type LeaveRequestRow } from './api';

/**
 * Shared building blocks for showing a staff member's leave picture — used by
 * MyLeaveScreen (self-service) and StaffProfileScreen's Leave tab (viewing
 * someone else's, subject to RLS). Kept in one place so both stay visually
 * and behaviorally consistent instead of drifting apart.
 */

export const statusTone: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  withdrawn: 'neutral',
};

export const statusAccentColor: Record<string, string> = {
  pending: colors.warning,
  approved: colors.success,
  rejected: colors.error,
  withdrawn: colors.ink300,
};

const LEAVE_TYPE_ICON: Record<string, IconName> = {
  [SHORT_LEAVE_KEY]: 'flash-outline',
  casual: 'sunny-outline',
  medical: 'medkit-outline',
  duty: 'briefcase-outline',
  [MATERNITY_KEY]: 'heart-outline',
};
export function leaveTypeIcon(key: string | undefined): IconName {
  return (key && LEAVE_TYPE_ICON[key]) || 'document-text-outline';
}

/** Requested display order for leave-type sections (LeaveRequestsScreen) — Casual, Medical and Duty first as named by the principal, everything else after in the order it's otherwise ranked, not alphabetical. */
const LEAVE_TYPE_GROUP_ORDER = [SHORT_LEAVE_KEY, 'casual', 'medical', 'duty', MATERNITY_KEY];
function leaveTypeGroupIndex(key: string): number {
  const i = LEAVE_TYPE_GROUP_ORDER.indexOf(key);
  return i === -1 ? LEAVE_TYPE_GROUP_ORDER.length : i;
}

export type LeaveTypeSection = { key: string; title: string; data: LeaveRequestRow[] };

/** Buckets requests into one section per leave type, so casual/medical/duty and every other type the principal has configured each get their own group instead of one flat list. */
export function groupRequestsByLeaveType(requests: LeaveRequestRow[]): LeaveTypeSection[] {
  const byKey = new Map<string, LeaveTypeSection>();
  for (const r of requests) {
    const key = r.leaveTypeKey || 'other';
    if (!byKey.has(key)) byKey.set(key, { key, title: r.leaveTypeName || 'Other', data: [] });
    byKey.get(key)!.data.push(r);
  }
  return Array.from(byKey.values()).sort((a, b) => leaveTypeGroupIndex(a.key) - leaveTypeGroupIndex(b.key));
}

export function LeaveBalanceCard({ balance }: { balance: LeaveBalance }) {
  const pct = balance.entitled > 0 ? Math.min(100, Math.round((balance.used / balance.entitled) * 100)) : 0;
  const remaining = Math.max(0, balance.entitled - balance.used);
  const fillColor = pct >= 100 ? colors.error : pct >= 75 ? colors.warning : colors.success;
  const isMonthly = balance.leaveTypeKey === SHORT_LEAVE_KEY;
  const periodWord = isMonthly ? 'month' : 'year';

  return (
    <Card flat style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
          <View style={styles.balanceIconWrap}>
            <Icon name={leaveTypeIcon(balance.leaveTypeKey)} size={16} color={semantic.primary} />
          </View>
          <View style={{ gap: 2, flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Text style={{ ...typography.body, color: semantic.textPrimary }}>{balance.leaveTypeName}</Text>
              <StatusPill label={isMonthly ? 'Monthly' : 'Annual'} tone={isMonthly ? 'gold' : 'info'} />
            </View>
          </View>
        </View>
        <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
          {balance.used} / {balance.entitled} used
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: fillColor }]} />
      </View>
      <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
        {remaining} remaining this {periodWord}
        {isMonthly ? ' · resets next month' : ''}
      </Text>
    </Card>
  );
}

/** Last 6 calendar months, oldest first, with approved day_count summed per month. startsOn is already an ISO 'yyyy-MM-dd' string, so slicing to 'yyyy-MM' avoids a parse/timezone round trip. */
export function buildMonthlyTrend(requests: LeaveRequestRow[]) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const monthDate = subMonths(now, 5 - i);
    return { key: format(monthDate, 'yyyy-MM'), label: format(monthDate, 'MMM'), days: 0 };
  });
  const byKey = new Map(months.map((m) => [m.key, m]));
  for (const r of requests) {
    if (r.status !== 'approved') continue;
    const bucket = byKey.get(r.startsOn.slice(0, 7));
    if (bucket) bucket.days += r.dayCount;
  }
  return months;
}

export function LeaveTrendCard({ requests }: { requests: LeaveRequestRow[] }) {
  const months = buildMonthlyTrend(requests);
  const maxDays = Math.max(1, ...months.map((m) => m.days));
  const approvedCount = requests.filter((r) => r.status === 'approved').length;
  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const rejectedCount = requests.filter((r) => r.status === 'rejected').length;

  return (
    <Card flat style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        <TrendStat label="Approved" value={approvedCount} color={colors.success} />
        <TrendStat label="Pending" value={pendingCount} color={colors.warning} />
        <TrendStat label="Rejected" value={rejectedCount} color={colors.error} />
      </View>
      <View style={styles.trendChart}>
        {months.map((m) => (
          <View key={m.key} style={styles.trendColumn}>
            <View style={styles.trendBarTrack}>
              <View style={[styles.trendBar, { height: `${(m.days / maxDays) * 100}%` }]} />
            </View>
            <Text style={styles.trendMonthLabel}>{m.label}</Text>
          </View>
        ))}
      </View>
      <Text style={{ ...typography.caption, color: semantic.textSecondary, textAlign: 'center' }}>
        Approved days taken per month, last 6 months
      </Text>
    </Card>
  );
}

function TrendStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Text style={{ ...typography.subtitle, color }}>{value}</Text>
      <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  progressTrack: { height: 6, borderRadius: radius.pill, backgroundColor: semantic.surfaceAlt, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill },
  balanceIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendChart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  trendColumn: { flex: 1, alignItems: 'center', gap: spacing.xs },
  trendBarTrack: { width: 18, height: 60, borderRadius: radius.sm, backgroundColor: semantic.surfaceAlt, justifyContent: 'flex-end', overflow: 'hidden' },
  trendBar: { width: '100%', borderRadius: radius.sm, backgroundColor: semantic.primary },
  trendMonthLabel: { fontSize: 11, color: semantic.textSecondary },
});
