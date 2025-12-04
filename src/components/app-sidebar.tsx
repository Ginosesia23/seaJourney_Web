"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  Ship,
  LifeBuoy,
  Award,
  History,
  User,
  Users,
  Map,
  Download,
  HelpCircle,
  FileText,
  MapPin,
  ChevronRight,
  Calendar,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarFooter,
} from "@/components/ui/sidebar"
import Logo from "@/components/logo"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { useSupabase, useUser } from "@/supabase"
import { LogOut, Settings, Sparkles, Sun, Moon, Laptop } from "lucide-react"
import { useTheme } from "next-themes"
import type { UserProfile } from "@/lib/types"

const navGroups = [
  {
    title: "General",
    items: [
      { href: "/dashboard", label: "Home", icon: Home },
    ]
  },
  {
    title: "Logbook",
    items: [
      { href: "/dashboard/current", label: "Current", icon: MapPin },
      { href: "/dashboard/history", label: "History", icon: History },
      { href: "/dashboard/vessels", label: "Vessels", icon: Ship },
      { href: "/dashboard/calendar", label: "Calendar", icon: Calendar },
    ]
  },
  {
    title: "Management",
    items: [
      { href: "/dashboard/profile", label: "Profile", icon: User },
      { href: "/dashboard/crew", label: "Crew", icon: Users, requiredRole: "vessel" },
      { href: "/dashboard/testimonials", label: "Testimonials", icon: LifeBuoy },
      { href: "/dashboard/export", label: "Export", icon: Download },
    ]
  },
  {
    title: "Resources",
    items: [
      { href: "/dashboard/support", label: "Support", icon: HelpCircle, disabled: true },
      { href: "/dashboard/legal", label: "Legal", icon: FileText, disabled: true },
    ]
  },
]

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  userProfile?: UserProfile | null
}

export function AppSidebar({ userProfile, ...props }: AppSidebarProps) {
  const pathname = usePathname()
  const { supabase } = useSupabase()
  const { user } = useUser()
  const router = useRouter()
  const { setTheme } = useTheme()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/")
  }

  const getInitials = (name: string) => {
    if (!name) return "";
    const parts = name.trim().split(" ").filter(Boolean);
    if (parts.length === 0) return "";
    if (parts.length === 1) {
      // For single word, take first 2 characters
      return name.substring(0, 2).toUpperCase();
    }
    // For multiple words, take first letter of first two words
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // Get display username and email from userProfile or user object
  const displayUsername = userProfile?.username || user?.user_metadata?.username || user?.email?.split("@")[0] || "User";
  const userEmail = userProfile?.email || user?.email || "";
  
  // Get initials - prefer firstName + lastName, then username, then email
  const getAvatarInitials = () => {
    if (userProfile?.firstName && userProfile?.lastName) {
      return (userProfile.firstName[0] + userProfile.lastName[0]).toUpperCase();
    }
    if (userProfile?.firstName) {
      return userProfile.firstName.substring(0, 2).toUpperCase();
    }
    if (displayUsername && displayUsername.length > 1) {
      return getInitials(displayUsername);
    }
    return userEmail[0]?.toUpperCase() || "U";
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="flex aspect-square size-9 items-center justify-center bg-sidebar-primary text-sidebar-primary-foreground overflow-hidden">
                  <svg 
                    version="1.1" 
                    viewBox="0 0 2048 1670" 
                    className="size-full p-1"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="currentColor"
                  >
                    <path transform="translate(410,73)" d="m0 0h69l54 2 37 3 59 7 60 10 55 11 38 9 42 11 48 14 47 15 43 15 28 11 46 19 20 9 21 9 38 19 15 8 15 6 5 3 4-2 10-8 14-8 9-6 45-23 16-8 27-13 32-14 34-13 27-10 36-12 29-9 50-14 26-6 40-8 22-3 18-5 16-1h29l10-3 20-3 20-1h81l32 2 26 4 12 1 31 1 82 16 28 7 18 6 16 8 3 3 1 5v317l-1 153-2 15-2 2-13-2-13-8-9-6-20-11-8-6-7-7-12-9-5-4-5-2h-12l-25-10-41-20-18-6-37-8-18-1-3-1-18-2-9-3h-102l-34 5-11 3h-7l-7 3-3-2h-6l-3 1-10-2h-7l-5 2h-15l-11 4-20 8-10 6-27 12-30 11-33 14-33 15-29 15-23 13-22 13-19 12-21 13-20 13-27 18-18 13-12 9-18 13-15 11-12 9-9 7-13 12-8 7-14 12-14 11-10 9-14 11-11 10-11 9-15 13-26 22-10 8-14 11-16 13-11 9-14 11-12 9-14 11-34 26-34 24-18 12-17 11-16 10-13 8-25 14-18 10-22 12-23 12-30 15-29 13-34 14-29 11-50 17-51 15-40 10-40 9-38 7-52 7-44 4-55 3h-66l-45-2-22-3-10-4-8-8-2-5-1-17-1-46-1-215v-501l1-116 2-119 6-12 16-12 16-8 32-13 36-12 28-8 39-9 28-6 31-4 18-4 57-8 24-2z" fill="currentColor"/>
                    <path transform="translate(1643,887)" d="m0 0h55l31 3 36 4 20 2 39 7 35 9 32 11 26 11 29 15 13 8 21 14 12 9 11 9 8 10 3 7v175l-1 98-1 24-3 23-1 4-1 20-3 7-6-2-20-12-28-15-17-10-19-9-16-7-16-12-13-8-13-4-33-8-14-5-24-5-49-8-25-2h-64l-8 3-6 3-8-1-1 3h-6l-3-3h-7l-4 1v-2h-3l-1 3-5-1-1-1-7-1v3l-5-2v2h-2v-2l-39 9-55 16-36 12-40 12-27 9-24 9-28 11-16 8-26 14-16 8-28 13-21 8-27 14-21 13-13 12-5 6-17 7-9 1-17 9-22 13-31 16-42 19-16 8-19 9-19 10-31 15-34 14-42 15-37 12-53 15-47 11-28 5-33 4-22 3-75 5h-45l-71-3-7 1-8-4-36-7-10-2-15-4-9 1h-6l-6-4-24-8-28-7-32-13-24-10-35-16-20-10-20-12-38-24-20-12-17-12-19-14-16-12-14-11-7-8v-3l4-1h7l16 8 16 10 10 5 12 3-2-10-5-11v-5l2-2 9 1 79 21 48 10 29 4 47 6 31 2h85l28-2 15-3 21-4 14-1 34-7 26-6 53-15 43-15 28-11 29-12 29-13 30-14 29-14 38-20 23-13 21-12 28-17 41-26 69-46 14-10 18-12 12-9 11-9 10-7 13-8 12-6 3-4 4-7 11-12 17-12 19-10 12-11 8-7 11-10 69-46 17-11 15-10 19-12 17-10 14-9 32-17 39-20 16-5h10l15-3 19-11 10-6 6-5h8l6 4 6 5 13-1 13-10 8-6 11-8 20-8 7-2 13 1 13 3 7-1z" fill="currentColor"/>
                  </svg>
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-extrabold">SeaJourney</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  if (item.requiredRole && userProfile?.role !== item.requiredRole && userProfile?.role !== "admin") {
                    return null
                  }
                  
                  if (item.disabled) {
                    return null
                  }

                  const isActive = pathname === item.href
                  
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton tooltip={item.label} asChild isActive={isActive}>
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-primary/80 text-primary-foreground">
                      {getAvatarInitials()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {displayUsername}
                    </span>
                    <span className="truncate text-xs">{userEmail}</span>
                  </div>
                  <ChevronRight className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-primary/80 text-primary-foreground">
                        {getAvatarInitials()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">
                        {displayUsername}
                      </span>
                      <span className="truncate text-xs">{userEmail}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/dashboard/profile")}>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/offers")}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Subscription
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    <span className="ml-2">Theme</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onClick={() => setTheme("light")}>
                        <Sun className="mr-2 h-4 w-4" />
                        <span>Light</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setTheme("dark")}>
                        <Moon className="mr-2 h-4 w-4" />
                        <span>Dark</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setTheme("system")}>
                        <Laptop className="mr-2 h-4 w-4" />
                        <span>System</span>
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
