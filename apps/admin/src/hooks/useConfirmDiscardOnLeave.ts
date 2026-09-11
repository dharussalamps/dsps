import { useNavigation } from '@react-navigation/native';
import { useEffect } from 'react';
import { Alert } from 'react-native';

/**
 * Warns before leaving a screen (header back, hardware back, swipe-back
 * gesture, or a programmatic goBack) while `hasUnsavedChanges` is true, and
 * lets the user cancel the navigation. Forward navigation (navigate/push)
 * isn't covered by beforeRemove and doesn't trigger this — only actions
 * that would remove the current screen do.
 */
export function useConfirmDiscardOnLeave(hasUnsavedChanges: boolean, message = 'You have unsaved changes. If you leave now, they will be lost.') {
  const navigation = useNavigation();

  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (!hasUnsavedChanges) return;
      e.preventDefault();
      Alert.alert('Discard changes?', message, [
        { text: "Don't leave", style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
  }, [navigation, hasUnsavedChanges, message]);
}
