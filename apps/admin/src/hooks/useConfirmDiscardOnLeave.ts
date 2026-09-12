import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

/**
 * Warns before leaving a screen (header back, hardware back, swipe-back
 * gesture, or a programmatic goBack) while `hasUnsavedChanges` is true, and
 * lets the user cancel the navigation. Forward navigation (navigate/push)
 * isn't covered by beforeRemove and doesn't trigger this — only actions
 * that would remove the current screen do.
 *
 * Returns `bypassNextLeave()` for the one case `hasUnsavedChanges` can't
 * express on its own: navigating away programmatically right after a
 * successful save, in the same tick the "unsaved" fields are still holding
 * their last values (e.g. a leave request's cover/remarks fields right
 * after `approveLeave()` succeeds, before that state is cleared and
 * re-rendered) — without it, that goBack() would trip its own "Discard
 * changes?" prompt on a change that already saved. Call it immediately
 * before that goBack(); it's a one-shot ref, not tied to render timing, so
 * it works even though the state update clearing the fields hasn't
 * re-rendered yet.
 */
export function useConfirmDiscardOnLeave(hasUnsavedChanges: boolean, message = 'You have unsaved changes. If you leave now, they will be lost.') {
  const navigation = useNavigation();
  const bypassRef = useRef(false);

  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (bypassRef.current) {
        bypassRef.current = false;
        return;
      }
      if (!hasUnsavedChanges) return;
      e.preventDefault();
      Alert.alert('Discard changes?', message, [
        { text: "Don't leave", style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
  }, [navigation, hasUnsavedChanges, message]);

  return { bypassNextLeave: () => { bypassRef.current = true; } };
}
