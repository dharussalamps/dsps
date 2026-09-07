import * as Network from 'expo-network';

export async function isOnline(): Promise<boolean> {
  const state = await Network.getNetworkStateAsync();
  // isInternetReachable is the more accurate signal where the platform
  // provides it; fall back to isConnected where it doesn't.
  return state.isInternetReachable ?? state.isConnected ?? false;
}

/** Fires with the current online/offline boolean whenever it changes. Returns an unsubscribe function. */
export function onConnectivityChange(callback: (online: boolean) => void): () => void {
  const subscription = Network.addNetworkStateListener((state) => {
    callback(state.isInternetReachable ?? state.isConnected ?? false);
  });
  return () => subscription.remove();
}
