"use client"

import * as React from "react"
import { useMemo } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { UserProfile } from "@/lib/types"

// Map route paths to breadcrumb labels
const routeLabels: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/current": "Current Service",
  "/dashboard/history": "History",
  "/dashboard/vessels": "Vessels",
  "/dashboard/profile": "Profile",
  "/dashboard/crew": "Crew",
  "/dashboard/testimonials": "Testimonials",
  "/dashboard/export": "Export",
  "/dashboard/world-map": "World Map",
}

function getBreadcrumbs(pathname: string) {
  const segments = pathname.split("/").filter(Boolean)
  const breadcrumbs = []

  // Always include Dashboard as the first breadcrumb
  breadcrumbs.push({
    href: "/dashboard",
    label: "Dashboard",
  })

  // Build path segments
  let currentPath = ""
  segments.forEach((segment, index) => {
    if (segment === "dashboard") {
      currentPath = "/dashboard"
      return
    }

    currentPath += `/${segment}`
    const label = routeLabels[currentPath] || segment.charAt(0).toUpperCase() + segment.slice(1)
    
    breadcrumbs.push({
      href: currentPath,
      label: label,
      isLast: index === segments.length - 1,
    })
  })

  return breadcrumbs
}

interface SiteHeaderProps extends React.ComponentProps<"header"> {
  userProfile?: UserProfile | null;
}

export function SiteHeader({ className, userProfile, ...props }: SiteHeaderProps) {
  const pathname = usePathname()
  const breadcrumbs = getBreadcrumbs(pathname)

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'crew':
        return 'Crew';
      case 'captain':
        return 'Captain';
      case 'vessel':
        return 'Vessel Manager';
      case 'admin':
        return 'Admin';
      default:
        return role || 'User';
    }
  };

  const getRoleBadgeClassName = (role?: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-500/10 text-red-700 dark:bg-red-500/20 dark:text-red-400 border-red-500/20';
      case 'vessel':
        return 'bg-blue-500/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border-blue-500/20';
      case 'captain':
        return 'bg-purple-500/10 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400 border-purple-500/20';
      case 'crew':
        return 'bg-green-500/10 text-green-700 dark:bg-green-500/20 dark:text-green-400 border-green-500/20';
      default:
        return 'bg-gray-500/10 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400 border-gray-500/20';
    }
  };

  const roleLabel = useMemo(() => getRoleLabel(userProfile?.role), [userProfile?.role]);
  const position = useMemo(() => (userProfile as any)?.position || null, [userProfile]);

  return (
    <header
      className={cn(
        "flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 border-b bg-content-background rounded-tl-xl",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={crumb.href}>
                <BreadcrumbItem className={cn(index === breadcrumbs.length - 1 && "hidden md:block")}>
                  {index === breadcrumbs.length - 1 ? (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={crumb.href}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {index < breadcrumbs.length - 1 && (
                  <BreadcrumbSeparator className={cn(index === breadcrumbs.length - 2 && "hidden md:block")} />
                )}
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      {userProfile && (
        <div className="ml-auto flex items-center gap-2 px-4">
          <Badge 
            variant="outline" 
            className="rounded-full px-3 py-1.5 text-sm font-bold border-orange-500/30 bg-orange-500/10 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400"
          >
            BETA
          </Badge>
          <Badge 
            variant="outline" 
            className={`rounded-full px-4 py-1.5 text-sm font-medium border hidden sm:flex ${getRoleBadgeClassName(userProfile?.role)}`}
          >
            <span className="font-semibold">{roleLabel}</span>
            {position && (
              <>
                <span className="mx-2 text-muted-foreground">•</span>
                <span className="text-xs">{position}</span>
              </>
            )}
          </Badge>
        </div>
      )}
    </header>
  )
}
