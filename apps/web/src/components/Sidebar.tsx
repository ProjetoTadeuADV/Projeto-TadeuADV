import { useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSidebar } from "../context/SidebarContext";
import { getSidebarMenu } from "../layout/sidebarMenu";

function pathIsActive(currentPath: string, itemPath: string): boolean {
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}

export function Sidebar() {
  const { isMasterUser } = useAuth();
  const { isExpanded, handleMouseEnter, handleMouseLeave } = useSidebar();
  const location = useLocation();
  const [hoveredParentId, setHoveredParentId] = useState<string | null>(null);
  const [openedParentId, setOpenedParentId] = useState<string | null>(null);
  const menuItems = useMemo(() => getSidebarMenu(isMasterUser), [isMasterUser]);

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
                <span className="sidebar-icon">{item.icon}</span>
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
                <span className="sidebar-icon">{item.icon}</span>
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
