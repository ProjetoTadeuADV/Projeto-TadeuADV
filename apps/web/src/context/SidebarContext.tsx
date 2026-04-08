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
  isMobile: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
  handleMouseEnter: () => void;
  handleMouseLeave: () => void;
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);
const MOBILE_BREAKPOINT = 768;

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.innerWidth <= MOBILE_BREAKPOINT;
  });
  const leaveTimeoutRef = useRef<number | null>(null);

  const clearLeaveTimeout = useCallback(() => {
    if (leaveTimeoutRef.current !== null) {
      window.clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (isMobile) {
      return;
    }
    clearLeaveTimeout();
    setIsHovered(true);
  }, [clearLeaveTimeout, isMobile]);

  const handleMouseLeave = useCallback(() => {
    if (isMobile) {
      return;
    }
    clearLeaveTimeout();
    leaveTimeoutRef.current = window.setTimeout(() => {
      setIsHovered(false);
    }, 400);
  }, [clearLeaveTimeout, isMobile]);

  const openSidebar = useCallback(() => {
    clearLeaveTimeout();
    if (isMobile) {
      setIsMobileOpen(true);
      return;
    }
    setIsHovered(true);
  }, [clearLeaveTimeout, isMobile]);

  const closeSidebar = useCallback(() => {
    clearLeaveTimeout();
    if (isMobile) {
      setIsMobileOpen(false);
      return;
    }
    setIsHovered(false);
  }, [clearLeaveTimeout, isMobile]);

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setIsMobileOpen((current) => !current);
      return;
    }

    setIsHovered((current) => !current);
  }, [isMobile]);

  useEffect(() => {
    function handleResize() {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (!mobile) {
        setIsMobileOpen(false);
      }
    }

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    if (isMobile && isMobileOpen) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }

    return undefined;
  }, [isMobile, isMobileOpen]);

  useEffect(() => {
    return () => {
      clearLeaveTimeout();
    };
  }, [clearLeaveTimeout]);

  const value = useMemo<SidebarContextValue>(
    () => ({
      isHovered,
      isExpanded: isMobile ? isMobileOpen : isHovered,
      isMobile,
      openSidebar,
      closeSidebar,
      toggleSidebar,
      handleMouseEnter,
      handleMouseLeave
    }),
    [
      closeSidebar,
      handleMouseEnter,
      handleMouseLeave,
      isHovered,
      isMobile,
      isMobileOpen,
      openSidebar,
      toggleSidebar
    ]
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
