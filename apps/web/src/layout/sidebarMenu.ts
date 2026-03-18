export interface SidebarMenuChild {
  id: string;
  path: string;
  label: string;
}

export type SidebarIconName =
  | "dashboard"
  | "newCase"
  | "messages"
  | "intake"
  | "workflow"
  | "reports"
  | "data";

export interface SidebarMenuItem {
  id: string;
  path?: string;
  label: string;
  icon: SidebarIconName;
  children?: SidebarMenuChild[];
}

const baseSidebarMenu: SidebarMenuItem[] = [
  {
    id: "dashboard",
    path: "/dashboard",
    label: "Dashboard",
    icon: "dashboard"
  },
  {
    id: "novo-caso",
    path: "/cases/new",
    label: "Novo Caso",
    icon: "newCase"
  },
  {
    id: "mensagens",
    path: "/messages",
    label: "Mensagens",
    icon: "messages"
  },
  {
    id: "pagina-1",
    label: "Pagina 1",
    icon: "intake",
    children: [
      { id: "subpagina-1", path: "/pagina-1/subpagina-1", label: "Subpagina 1" },
      { id: "subpagina-2", path: "/pagina-1/subpagina-2", label: "Subpagina 2" }
    ]
  },
  {
    id: "pagina-2",
    label: "Pagina 2",
    icon: "workflow",
    children: [
      { id: "subpagina-3", path: "/pagina-2/subpagina-3", label: "Subpagina 3" },
      { id: "subpagina-4", path: "/pagina-2/subpagina-4", label: "Subpagina 4" }
    ]
  },
  {
    id: "pagina-3",
    path: "/pagina-3",
    label: "Pagina 3",
    icon: "reports"
  },
  {
    id: "dados",
    path: "/dados",
    label: "Dados",
    icon: "data"
  }
];

export function getSidebarMenu(isMasterUser: boolean, canCreateCases: boolean): SidebarMenuItem[] {
  void isMasterUser;

  if (canCreateCases) {
    return baseSidebarMenu;
  }

  return baseSidebarMenu.filter((item) => item.id !== "novo-caso");
}
