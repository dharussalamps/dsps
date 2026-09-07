import { Screen, ScreenHeader, EmptyState, StatusPill } from '@/components';

type Props = {
  title: string;
  buildTask?: number;
};

/**
 * Stand-in for a route whose real screen hasn't been built yet. Keeping
 * every route in AdminSpec.md section 10 registered from the start (rather
 * than adding routes as screens are built) means navigation code written
 * against one screen never has to guess whether the target exists.
 */
export function PlaceholderScreen({ title, buildTask }: Props) {
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
    </Screen>
  );
}
