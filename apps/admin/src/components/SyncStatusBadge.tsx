import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSyncStore } from '@/store/syncStore';
import { colors, typography } from '@/theme/tokens';
import { drainQueue } from '@/lib/offline/queue';
import { Icon } from './Icon';

// The icon itself stays visually compact; hitSlop pads the actual tappable
// area out to the 44dp minimum (section 14, Definition of done) without
// changing how it looks.
const RETRY_HIT_SLOP = { top: 13, bottom: 13, left: 13, right: 13 };

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
      <Pressable
        onPress={() => void drainQueue()}
        hitSlop={RETRY_HIT_SLOP}
        style={[styles.bubble, styles.bubbleActionable]}
        accessibilityRole="button"
        accessibilityLabel={t('common.syncError')}
      >
        <Icon name="alert-circle-outline" size={16} color={colors.gold500} />
      </Pressable>
    );
  }

  if (pendingCount > 0) {
    const icon = !isOnline ? 'cloud-offline-outline' : isSyncing ? 'sync-outline' : 'time-outline';
    const label = !isOnline
      ? `${t('common.syncPending', { count: pendingCount })} · ${t('common.offline')}`
      : isSyncing
        ? t('common.loading')
        : t('common.syncPending', { count: pendingCount });
    return (
      <View style={styles.bubble} accessible accessibilityLabel={label}>
        <Icon name={icon} size={16} color={colors.white} />
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{pendingCount}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.bubble} accessible accessibilityLabel={t('common.synced')}>
      <Icon name="checkmark-circle-outline" size={16} color={colors.white} />
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  bubbleActionable: { backgroundColor: 'rgba(255,255,255,0.24)' },
  countBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold500,
  },
  countBadgeText: { ...typography.caption, fontSize: 10, lineHeight: 12, color: colors.white },
});
