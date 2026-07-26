"use client";

import {
 createContext,
 useContext,
 useState,
 ReactNode,
} from "react";

type AIContextType = {
 open: boolean;
 setOpen: (value: boolean) => void;
};

const AIContext =
 createContext<AIContextType | null>(null);

export function AIProvider({
 children,
}: {
 children: ReactNode;
}) {
 const [open, setOpen] = useState(false);

 return (
  <AIContext.Provider
   value={{
    open,
    setOpen,
   }}
  >
   {children}
  </AIContext.Provider>
 );
}

export function useAI() {
 const context = useContext(AIContext);

 if (!context) {
  throw new Error(
   "useAI must be used inside AIProvider"
  );
 }

 return context;
}