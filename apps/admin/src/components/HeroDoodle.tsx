import { StyleSheet } from 'react-native';
import { Icon, type IconName } from './Icon';

type Props = {
  /** Larger icon, top-right corner. */
  topIcon: IconName;
  /** Smaller icon, bottom-left corner. */
  bottomIcon: IconName;
};

/**
 * Low-opacity, tone-on-tone corner icons behind a Hero's content — the same
 * decorative "watermark" treatment on every screen's header, with icons
 * chosen per feature so it still reads as relevant to that screen rather
 * than generic decoration. Tinted black-at-low-opacity (not white) so it
 * reads as a recessed emboss in the maroon panel instead of standing out.
 *
 * Render as the first child of a `<Hero style={{ overflow: 'hidden' }}>` so
 * the icons clip to the hero's rounded-bottom shape and sit behind whatever
 * comes after (a ScreenHeader painted later in source order layers on top).
 */
export function HeroDoodle({ topIcon, bottomIcon }: Props) {
  return (
    <>
      <Icon name={topIcon} size={148} color="rgba(0,0,0,0.14)" style={[styles.icon, { top: -26, right: -22, transform: [{ rotate: '10deg' }] }]} />
      <Icon name={bottomIcon} size={116} color="rgba(0,0,0,0.14)" style={[styles.icon, { bottom: -18, left: -16, transform: [{ rotate: '-16deg' }] }]} />
    </>
  );
}

const styles = StyleSheet.create({
  icon: { position: 'absolute' },
});
