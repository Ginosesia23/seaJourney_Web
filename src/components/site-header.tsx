"use client"

import * as React from "react"
import { useMemo } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Info } from "lucide-react"
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
  "/dashboard/vessels": "Vessels",
  "/dashboard/profile": "Profile",
  "/dashboard/crew": "Crew",
  "/dashboard/pending-requests": "Pending requests",
  "/dashboard/career-documents": "Career documents",
  "/dashboard/applications": "Career documents",
  "/dashboard/proof-of-service": "Career documents",
  "/dashboard/vessel-documents": "Generated documents",
  "/dashboard/export": "Export",
  "/dashboard/world-map": "World Map",
  "/dashboard/passages-map": "Passages Map",
  "/dashboard/calculations": "How Calculations Work",
  "/dashboard/ais-tracking": "AIS tracking",
  "/dashboard/ais-wrong-states": "AIS wrong states",
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
  const router = useRouter()
  const breadcrumbs = getBreadcrumbs(pathname)
  const isMapPage =
    pathname === "/dashboard/world-map" || pathname === "/dashboard/passages-map"

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'crew':
        return 'Crew';
      case 'captain':
        return 'Captain';
      case 'vessel':
        return 'Vessel';
      case 'admin':
        return 'Admin';
      default:
        return role || 'User';
    }
  };

  const getRoleBadgeClassName = (role?: string) => {
    if (isMapPage) {
      switch (role) {
        case 'admin':
          return 'bg-red-400/15 text-red-200 border-red-400/25';
        case 'vessel':
          return 'bg-sky-400/15 text-sky-200 border-sky-400/25';
        case 'captain':
          return 'bg-violet-400/15 text-violet-200 border-violet-400/25';
        case 'crew':
          return 'bg-emerald-400/15 text-emerald-200 border-emerald-400/25';
        default:
          return 'bg-white/10 text-white/80 border-white/15';
      }
    }
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
        "flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 border-b rounded-tl-xl",
        isMapPage
          ? "border-white/10 bg-[#070e1a] text-white"
          : "bg-content-background",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger
          className={cn(
            "-ml-1",
            isMapPage && "text-white/80 hover:bg-white/10 hover:text-white",
          )}
        />
        <Separator
          orientation="vertical"
          className={cn("mr-2 h-4", isMapPage && "bg-white/20")}
        />
        <Breadcrumb>
          <BreadcrumbList className={cn(isMapPage && "text-white/55")}>
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={crumb.href}>
                <BreadcrumbItem className={cn(index === breadcrumbs.length - 1 && "hidden md:block")}>
                  {index === breadcrumbs.length - 1 ? (
                    <BreadcrumbPage className={cn(isMapPage && "text-white")}>
                      {crumb.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link
                        href={crumb.href}
                        className={cn(
                          isMapPage && "text-white/55 transition-colors hover:text-white",
                        )}
                      >
                        {crumb.label}
                      </Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {index < breadcrumbs.length - 1 && (
                  <BreadcrumbSeparator
                    className={cn(
                      index === breadcrumbs.length - 2 && "hidden md:block",
                      isMapPage && "text-white/35 [&>svg]:text-white/35",
                    )}
                  />
                )}
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      {userProfile && (
        <div className="ml-auto flex items-center gap-2 px-4">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "rounded-full",
              isMapPage && "text-white/70 hover:bg-white/10 hover:text-white",
            )}
            onClick={() => router.push('/dashboard/calculations')}
            title="How calculations work"
          >
            <Info className="h-4 w-4" />
            <span className="sr-only">View calculation information</span>
          </Button>
          <Badge 
            variant="outline" 
            className={`rounded-full px-4 py-1.5 text-sm font-medium border hidden sm:flex ${getRoleBadgeClassName(userProfile?.role)}`}
          >
            <span className="font-semibold">{roleLabel}</span>
            {position && (
              <>
                <span className={cn("mx-2", isMapPage ? "text-white/40" : "text-muted-foreground")}>•</span>
                <span className="text-xs">{position}</span>
              </>
            )}
          </Badge>
        </div>
      )}
    </header>
  )
}
