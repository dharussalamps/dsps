import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * The one Supabase client for the app. Session is persisted to
 * AsyncStorage so a signed-in teacher stays signed in across restarts —
 * required for the app to open straight to the marking screen offline
 * (AdminSpec.md section 9, rule 4).
 */
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
