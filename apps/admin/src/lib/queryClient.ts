import { QueryClient } from '@tanstack/react-query';

/**
 * Shared instance so code outside a component tree — authStore's signOut,
 * in particular (NFR-SEC-06: cached data must be cleared on sign-out) —
 * can call `queryClient.clear()` without needing the QueryClientProvider's
 * React context.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
    },
  },
});
