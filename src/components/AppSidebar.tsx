import { Home, Package, Hammer, BarChart3, Search, Wand2, User, Settings, LogOut, Crown } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/components/AuthProvider";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const navigationItems = [
  { title: "Home", url: "/", icon: Home },
  { title: "Collection", url: "/collection", icon: Package },
  { title: "Deck Builder", url: "/deck-builder", icon: Hammer },
];

const features = [
  { title: "Card Search", url: "/collection?tab=add-cards", icon: Search },
  { title: "AI Deck Builder", url: "/collection?tab=ai-builder", icon: Wand2 },
  { title: "Analytics", url: "/collection?tab=analysis", icon: BarChart3 },
];

const formats = [
  { name: "Standard", description: "Current rotation" },
  { name: "Commander", description: "100-card singleton" },
  { name: "Modern", description: "Non-rotating format" },
  { name: "Legacy", description: "Eternal format" },
  { name: "Vintage", description: "Most powerful cards" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const currentPath = location.pathname;
  const isCollapsed = state === "collapsed";

  const isActive = (path: string) => {
    if (path === "/" && currentPath === "/") return true;
    if (path !== "/" && currentPath.startsWith(path)) return true;
    return false;
  };

  const getNavCls = (path: string) =>
    isActive(path) 
      ? "bg-primary/15 text-primary font-medium border-r-2 border-primary shadow-sm" 
      : "text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200";

  if (!user) {
    return null;
  }

  return (
    <Sidebar
      className={`${isCollapsed ? "w-16" : "w-72"} border-r transition-all duration-300`}
      collapsible="icon"
    >
      <SidebarContent className="bg-card/50 backdrop-blur-sm">
        {/* Brand Header */}
        {!isCollapsed && (
          <div className="p-6 border-b border-border/50">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Wand2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">MTG Deck Builder</h2>
                <p className="text-sm text-muted-foreground">Universal platform</p>
              </div>
            </div>
          </div>
        )}

        {isCollapsed && (
          <div className="p-4 border-b border-border/50">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
              <Wand2 className="h-5 w-5 text-primary" />
            </div>
          </div>
        )}

        <div className="flex-1 px-3 py-4 space-y-6">
          {/* Main Navigation */}
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {!isCollapsed ? "Navigation" : "Nav"}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {navigationItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink 
                        to={item.url} 
                        end={item.url === "/"}
                        className={`flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 ${getNavCls(item.url)}`}
                      >
                        <item.icon className="h-5 w-5 flex-shrink-0" />
                        {!isCollapsed && <span className="ml-3 font-medium">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Quick Actions */}
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {!isCollapsed ? "Quick Actions" : "Quick"}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {features.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink 
                        to={item.url}
                        className={`flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 ${getNavCls(item.url)}`}
                      >
                        <item.icon className="h-5 w-5 flex-shrink-0" />
                        {!isCollapsed && <span className="ml-3 font-medium">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* MTG Formats */}
          {!isCollapsed && (
            <SidebarGroup>
              <SidebarGroupLabel className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Popular Formats
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <div className="space-y-2">
                  {formats.map((format, index) => (
                    <div key={index} className="px-3 py-2 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-foreground">{format.name}</div>
                          <div className="text-xs text-muted-foreground">{format.description}</div>
                        </div>
                        <Crown className="h-4 w-4 text-muted-foreground/50" />
                      </div>
                    </div>
                  ))}
                </div>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </div>

        {/* User Section */}
        <div className="border-t border-border/50 p-4">
          {!isCollapsed ? (
            <div className="space-y-4">
              <div className="flex items-center space-x-3 px-2">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {user?.email?.split('@')[0] || 'User'}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {user?.email}
                  </div>
                </div>
              </div>
              
              <Separator className="opacity-50" />
              
              <div className="space-y-1">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full justify-start px-2 text-muted-foreground hover:text-foreground"
                >
                  <Settings className="h-4 w-4 mr-3" />
                  Settings
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full justify-start px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={signOut}
                >
                  <LogOut className="h-4 w-4 mr-3" />
                  Sign Out
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-center">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full p-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={signOut}
                title="Sign Out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </SidebarContent>
    </Sidebar>
  );
}