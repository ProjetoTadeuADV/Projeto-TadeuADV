export interface SidebarMenuChild {
  id: string;
  path: string;
  label: string;
}

export interface SidebarMenuItem {
  id: string;
  path?: string;
  label: string;
  icon: string;
  children?: SidebarMenuChild[];
}

const baseSidebarMenu: SidebarMenuItem[] = [
  {
    id: "dashboard",
    path: "/dashboard",
    label: "Dashboard",
    icon: "D"
  },
  {
    id: "novo-caso",
    path: "/cases/new",
    label: "Novo Caso",
    icon: "N"
  },
  {
    id: "pagina-1",
    label: "Página 1",
    icon: "1",
    children: [
      { id: "subpagina-1", path: "/pagina-1/subpagina-1", label: "Subpágina 1" },
      { id: "subpagina-2", path: "/pagina-1/subpagina-2", label: "Subpágina 2" }
    ]
  },
  {
    id: "pagina-2",
    label: "Página 2",
    icon: "2",
    children: [
      { id: "subpagina-3", path: "/pagina-2/subpagina-3", label: "Subpágina 3" },
      { id: "subpagina-4", path: "/pagina-2/subpagina-4", label: "Subpágina 4" }
    ]
  },
  {
    id: "pagina-3",
    path: "/pagina-3",
    label: "Página 3",
    icon: "3"
  },
  {
    id: "dados",
    path: "/dados",
    label: "Dados",
    icon: "DB"
  }
];

export function getSidebarMenu(isMasterUser: boolean, canCreateCases: boolean): SidebarMenuItem[] {
  void isMasterUser;

  if (canCreateCases) {
    return baseSidebarMenu;
  }

  return baseSidebarMenu.filter((item) => item.id !== "novo-caso");
}
