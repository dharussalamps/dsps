import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSyncStore } from '@/store/syncStore';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { drainQueue } from '@/lib/offline/queue';

// The pill itself stays visually compact; hitSlop pads the actual tappable
// area out to the 44dp minimum (section 14, Definition of done) without
// changing how it looks. ~26px tall pill + 9px on each side clears 44.
const RETRY_HIT_SLOP = { top: 9, bottom: 9, left: 9, right: 9 };

/**
 * Always-visible sync indicator (AdminSpec.md section 9, rule 5): a synced
 * tick, a pending badge with count, or an error banner — "the user must
 * never wonder whether their marking was saved." Drop this into any screen
 * that can have offline-queued work (marking, early leave, marks entry).
 */
export function SyncStatusBadge() {
  const { t } = useTranslation();
  const { pendingCount, hasStuckError, isOnline, isSyncing } = useSyncStore();

  if (hasStuckError) {
    return (
      <Pressable onPress={() => void drainQueue()} hitSlop={RETRY_HIT_SLOP} style={[styles.base, styles.error]}>
        <Text style={styles.errorText}>{t('common.syncError')}</Text>
      </Pressable>
    );
  }

  if (pendingCount > 0) {
    return (
      <View style={[styles.base, styles.pending]}>
        <Text style={styles.pendingText}>
          {isSyncing ? t('common.loading') : t('common.syncPending', { count: pendingCount })}
        </Text>
        {!isOnline ? <Text style={styles.offlineText}>· {t('common.offline')}</Text> : null}
      </View>
    );
  }

  return (
    <View style={[styles.base, styles.synced]}>
      <Text style={styles.syncedText}>✓ {t('common.synced')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  synced: { backgroundColor: colors.successBg },
  syncedText: { ...typography.captionStrong, color: colors.success },
  pending: { backgroundColor: colors.gold100 },
  pendingText: { ...typography.captionStrong, color: colors.gold900 },
  offlineText: { ...typography.caption, color: colors.gold900 },
  error: { backgroundColor: colors.errorBg },
  errorText: { ...typography.captionStrong, color: colors.error },
});
