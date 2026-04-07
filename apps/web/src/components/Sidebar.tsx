import { useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSidebar } from "../context/SidebarContext";
import { getSidebarMenu, type SidebarIconName } from "../layout/sidebarMenu";

function pathIsActive(currentPath: string, itemPath: string): boolean {
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}

function SidebarIcon({ name }: { name: SidebarIconName }) {
  switch (name) {
    case "dashboard":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M4 13.2h6.8V20H4zM13.2 4H20v6.8h-6.8zM13.2 13.2H20V20h-6.8zM4 4h6.8v6.8H4z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "account":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M12 12a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4zm0 2.1c-4.4 0-8 2.5-8 5.6V21h16v-1.3c0-3.1-3.6-5.6-8-5.6z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "statement":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M5 4.8h14v14.4H5zM8.2 8.6h7.6M8.2 12h7.6M8.2 15.4h4.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "newCase":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M12 5v14M5 12h14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "messages":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M6.5 7.2h11a2.3 2.3 0 0 1 2.3 2.3v6.2a2.3 2.3 0 0 1-2.3 2.3h-7l-4.3 3v-3h-.7a2.3 2.3 0 0 1-2.3-2.3V9.5a2.3 2.3 0 0 1 2.3-2.3z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "intake":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M7 4.8h10M7 9.8h10M7 14.8h7M5.5 3.8h13a1.7 1.7 0 0 1 1.7 1.7v13a1.7 1.7 0 0 1-1.7 1.7h-13a1.7 1.7 0 0 1-1.7-1.7v-13a1.7 1.7 0 0 1 1.7-1.7z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "workflow":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M4 7.2h8.2M14.6 7.2h5.4M9.8 4.8l2.4 2.4-2.4 2.4M20 16.8h-8.2M9.4 16.8H4M14.2 14.4l-2.4 2.4 2.4 2.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "reports":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M5 19.2V12M11.2 19.2V8.5M17.4 19.2V5M3.8 20h16.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return null;
  }
}

export function Sidebar() {
  const { isMasterUser, canCreateCases } = useAuth();
  const { isExpanded, handleMouseEnter, handleMouseLeave } = useSidebar();
  const location = useLocation();
  const [hoveredParentId, setHoveredParentId] = useState<string | null>(null);
  const [openedParentId, setOpenedParentId] = useState<string | null>(null);
  const menuItems = useMemo(
    () => getSidebarMenu(isMasterUser, canCreateCases),
    [canCreateCases, isMasterUser]
  );

  const expandedClass = isExpanded ? "sidebar sidebar--expanded" : "sidebar";

  const activeParentId = useMemo(() => {
    for (const item of menuItems) {
      if (!item.children) {
        continue;
      }

      const hasActiveChild = item.children.some((child) =>
        pathIsActive(location.pathname, child.path)
      );
      if (hasActiveChild) {
        return item.id;
      }
    }

    return null;
  }, [location.pathname, menuItems]);

  return (
    <aside
      className={expandedClass}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => {
        setHoveredParentId(null);
        handleMouseLeave();
      }}
      aria-label="Menu lateral"
    >
      <div className="sidebar-brand">
        <span className="sidebar-brand-emblem" aria-hidden="true">
          {"\u2696"}
        </span>
        <span className="sidebar-brand-label">DoutorEu</span>
      </div>
      <p className="sidebar-caption">Navegação</p>

      <nav className="sidebar-nav">
        {menuItems.map((item) => {
          const hasChildren = Boolean(item.children && item.children.length > 0);

          if (!hasChildren && item.path) {
            return (
              <NavLink
                key={item.id}
                to={item.path}
                className={({ isActive }) =>
                  isActive ? "sidebar-item sidebar-item--active" : "sidebar-item"
                }
              >
                <span className="sidebar-icon">
                  <SidebarIcon name={item.icon} />
                </span>
                <span className="sidebar-label">{item.label}</span>
              </NavLink>
            );
          }

          const parentIsActive = activeParentId === item.id;
          const parentIsOpen =
            isExpanded && (hoveredParentId === item.id || openedParentId === item.id || parentIsActive);

          return (
            <div
              key={item.id}
              className={parentIsActive ? "sidebar-parent sidebar-parent--active" : "sidebar-parent"}
              onMouseEnter={() => setHoveredParentId(item.id)}
              onMouseLeave={() => setHoveredParentId((current) => (current === item.id ? null : current))}
            >
              <button
                type="button"
                className={parentIsActive ? "sidebar-item sidebar-item--active" : "sidebar-item"}
                onClick={(event) => {
                  event.preventDefault();
                  setOpenedParentId((current) => (current === item.id ? null : item.id));
                }}
                aria-expanded={parentIsOpen}
              >
                <span className="sidebar-icon">
                  <SidebarIcon name={item.icon} />
                </span>
                <span className="sidebar-label">{item.label}</span>
                <span className={parentIsOpen ? "sidebar-caret sidebar-caret--open" : "sidebar-caret"}>
                  &gt;
                </span>
              </button>

              <div className={parentIsOpen ? "sidebar-submenu sidebar-submenu--open" : "sidebar-submenu"}>
                {item.children?.map((child) => (
                  <NavLink
                    key={child.id}
                    to={child.path}
                    className={({ isActive }) =>
                      isActive
                        ? "sidebar-submenu-item sidebar-submenu-item--active"
                        : "sidebar-submenu-item"
                    }
                  >
                    {child.label}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
