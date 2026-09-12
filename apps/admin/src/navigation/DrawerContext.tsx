import { createContext, useContext } from 'react';

/** Lets any tab-root screen open the shared drawer that TabsNavigator mounts once, around all five tabs. */
const DrawerContext = createContext<{ openDrawer: () => void } | null>(null);

export function DrawerProvider({ openDrawer, children }: { openDrawer: () => void; children: React.ReactNode }) {
  return <DrawerContext.Provider value={{ openDrawer }}>{children}</DrawerContext.Provider>;
}

/** Returns openDrawer, or undefined outside TabsNavigator (e.g. a screen reached only by pushing onto the stack). */
export function useOpenDrawer(): (() => void) | undefined {
  return useContext(DrawerContext)?.openDrawer;
}
