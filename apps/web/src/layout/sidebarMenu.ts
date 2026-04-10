export interface SidebarMenuChild {
  id: string;
  path: string;
  label: string;
}

export type SidebarIconName =
  | "dashboard"
  | "account"
  | "statement";

export interface SidebarMenuItem {
  id: string;
  path?: string;
  label: string;
  icon: SidebarIconName;
  children?: SidebarMenuChild[];
}

const clientSidebarMenu: SidebarMenuItem[] = [
  {
    id: "dashboard",
    path: "/dashboard",
    label: "Meus Casos",
    icon: "dashboard"
  },
  {
    id: "extrato",
    path: "/statement",
    label: "Extrato",
    icon: "statement"
  },
  {
    id: "minha-conta",
    path: "/settings/profile",
    label: "Minha Conta",
    icon: "account"
  }
];

const adminSidebarMenu: SidebarMenuItem[] = [
  {
    id: "dashboard",
    path: "/dashboard",
    label: "Meus Casos",
    icon: "dashboard"
  },
  {
    id: "minha-conta",
    path: "/settings/profile",
    label: "Minha Conta",
    icon: "account"
  }
];

export function getSidebarMenu(canAccessAdmin: boolean): SidebarMenuItem[] {
  return canAccessAdmin ? adminSidebarMenu : clientSidebarMenu;
}
