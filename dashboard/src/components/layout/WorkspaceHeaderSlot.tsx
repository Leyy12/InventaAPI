"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type HeaderSlot = {
  target: HTMLDivElement | null;
  register: (element: HTMLDivElement | null) => void;
};

const HeaderSlotContext = createContext<HeaderSlot | null>(null);

export function WorkspaceHeaderSlotProvider({ children }: { children: ReactNode }) {
  const [target, register] = useState<HTMLDivElement | null>(null);
  const value = useMemo(() => ({ target, register }), [target]);
  return <HeaderSlotContext.Provider value={value}>{children}</HeaderSlotContext.Provider>;
}

export function useWorkspaceHeaderSlot() {
  return useContext(HeaderSlotContext);
}
