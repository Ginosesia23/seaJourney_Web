"use client"

import * as React from "react"
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
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

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

export function SiteHeader({ className, ...props }: React.ComponentProps<"header">) {
  const pathname = usePathname()
  const breadcrumbs = getBreadcrumbs(pathname)

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
      <div className="ml-auto flex items-center gap-2 px-4">
        <form className="relative hidden sm:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search..."
            className="w-full max-w-sm rounded-lg bg-background pl-8 h-9"
          />
        </form>
      </div>
    </header>
  )
}
