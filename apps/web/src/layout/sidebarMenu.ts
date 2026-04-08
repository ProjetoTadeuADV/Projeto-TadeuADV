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

const baseSidebarMenu: SidebarMenuItem[] = [
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

export function getSidebarMenu(_isMasterUser: boolean, _canCreateCases: boolean): SidebarMenuItem[] {
  return baseSidebarMenu;
}
