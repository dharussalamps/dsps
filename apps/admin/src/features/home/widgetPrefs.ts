import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { WIDGET_REGISTRY, type WidgetId } from './widgets';

const QUERY_KEY = ['home', 'widget-prefs'];

async function fetchWidgetOverrides(staffId: string): Promise<Record<string, boolean>> {
  const { data, error } = await supabase
    .from('staff_dashboard_prefs')
    .select('widget_overrides')
    .eq('staff_id', staffId)
    .maybeSingle();
  if (error) throw error;
  return (data?.widget_overrides as Record<string, boolean> | undefined) ?? {};
}

/** Backs both HomeScreen (which cards to render) and DashboardWidgetsScreen (the toggle list). */
export function useWidgetPrefs() {
  const staffId = useAuthStore((s) => s.staff?.id);
  const query = useQuery({
    queryKey: [...QUERY_KEY, staffId],
    queryFn: () => fetchWidgetOverrides(staffId as string),
    enabled: !!staffId,
  });

  const overrides = query.data ?? {};
  function isEnabled(id: WidgetId): boolean {
    const override = overrides[id];
    if (override !== undefined) return override;
    return WIDGET_REGISTRY.find((w) => w.id === id)?.defaultEnabled ?? false;
  }

  return { ...query, overrides, isEnabled };
}

export function useSetWidgetEnabled() {
  const queryClient = useQueryClient();
  const staffId = useAuthStore((s) => s.staff?.id);

  return useMutation({
    mutationFn: async ({ id, enabled }: { id: WidgetId; enabled: boolean }) => {
      if (!staffId) throw new Error('Not signed in');
      const current = queryClient.getQueryData<Record<string, boolean>>([...QUERY_KEY, staffId]) ?? {};
      const next = { ...current, [id]: enabled };
      const { error } = await supabase
        .from('staff_dashboard_prefs')
        .upsert({ staff_id: staffId, widget_overrides: next }, { onConflict: 'staff_id' });
      if (error) throw error;
      return next;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, staffId] });
    },
  });
}
