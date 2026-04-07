import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

interface SidebarContextValue {
  isHovered: boolean;
  isExpanded: boolean;
  handleMouseEnter: () => void;
  handleMouseLeave: () => void;
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isHovered, setIsHovered] = useState(false);
  const leaveTimeoutRef = useRef<number | null>(null);

  const clearLeaveTimeout = useCallback(() => {
    if (leaveTimeoutRef.current !== null) {
      window.clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    clearLeaveTimeout();
    setIsHovered(true);
  }, [clearLeaveTimeout]);

  const handleMouseLeave = useCallback(() => {
    clearLeaveTimeout();
    leaveTimeoutRef.current = window.setTimeout(() => {
      setIsHovered(false);
    }, 400);
  }, [clearLeaveTimeout]);

  useEffect(() => {
    return () => {
      clearLeaveTimeout();
    };
  }, [clearLeaveTimeout]);

  const value = useMemo<SidebarContextValue>(
    () => ({
      isHovered,
      isExpanded: isHovered,
      handleMouseEnter,
      handleMouseLeave
    }),
    [handleMouseEnter, handleMouseLeave, isHovered]
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar deve ser usado dentro de SidebarProvider.");
  }
  return context;
}
