import { useTranslation } from 'react-i18next';
import { Button, Screen, ScreenHeader, EmptyState, StatusPill } from '@/components';
import { useAuthStore } from '@/store/authStore';

type Props = {
  title: string;
  buildTask?: number;
  /** Home is the only always-reachable screen while every other route is a
   * placeholder, so it's the one place a dev/tester can sign out from. */
  showSignOut?: boolean;
};

/**
 * Stand-in for a route whose real screen hasn't been built yet. Keeping
 * every route in AdminSpec.md section 10 registered from the start (rather
 * than adding routes as screens are built) means navigation code written
 * against one screen never has to guess whether the target exists.
 */
export function PlaceholderScreen({ title, buildTask, showSignOut }: Props) {
  const { t } = useTranslation();
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <Screen>
      <ScreenHeader title={title} />
      <EmptyState
        title="Not built yet"
        message={
          buildTask
            ? `This screen lands with build task ${buildTask}. See docs/AdminSpec.md section 17 for progress.`
            : 'See docs/AdminSpec.md section 17 for build progress.'
        }
      />
      <StatusPill label="Coming soon" tone="gold" />
      {showSignOut ? <Button label={t('common.signOut')} variant="outline" onPress={() => void signOut()} /> : null}
    </Screen>
  );
}
