"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  Ship,
  Award,
  User,
  Users,
  Download,
  HelpCircle,
  FileText,
  MapPin,
  Calendar,
  Navigation,
  Inbox,
  BarChart3,
  Globe,
  LogIn,
  DollarSign,
  CreditCard,
  PenTool,
  MessageSquare,
  ClipboardList,
  Database,
  UserCog,
  UserSearch,
  ShieldCheck,
  Megaphone,
  MessagesSquare,
  Crosshair,
  FileSignature,
  Clock,
  RefreshCw,
  Send,
  Route,
  BookOpen,
  FolderOpen,
  Layers,
  Anchor,
  ArrowRightLeft,
  FileCheck,
  ChevronsUpDown,
  Radar,
  ToggleLeft,
  Flag,
  Activity,
  Wallet,
  TicketPercent,
  Target,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
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
import { Badge } from "@/components/ui/badge"
import { useRouter } from "next/navigation"
import { useSupabase, useUser } from "@/supabase"
import { useDoc } from "@/supabase/database"
import { LogOut, Sparkles, Sun, Moon, Laptop } from "lucide-react"
import { useTheme } from "next-themes"
import type { UserProfile } from "@/lib/types"
import { signOutLocal } from "@/lib/auth-utils"
import {
  hasActiveSubscription as hasActiveSubscriptionEntitlement,
  hasAisHistoryImportTier,
  hasCrewPremiumPlusFeatures,
  hasPaidDashboardAccess,
  hasPassagesMapAccess as hasPassagesMapAccessGate,
  hasVesselPremiumPlusFeatures,
  isVesselLinkedAccount,
  isCrewLimitedAccount,
} from "@/supabase/database/subscription-helpers"
import { isCrewLimitedNavigationRestricted } from "@/lib/crew-vessel-feature-boost"
import { useCrewVesselFeatureBoost } from "@/contexts/crew-vessel-feature-boost-context"
import { getSubscriptionTierAccentColor } from "@/lib/subscription-tier-colors"
import { useFeatureFlags } from "@/hooks/use-feature-flags"
import type { FeatureFlagKey } from "@/lib/feature-flags/catalog"
import { resolveCrewRestrictedAllowedHrefs } from "@/lib/feature-flags/crew-restricted-nav"
import { isVesselLinkedFeatureGranted, vesselLinkedAllowedHrefs } from "@/lib/vessel-linked-features"
import { cn } from "@/lib/utils"
import { navIconPresentation } from "@/lib/nav-icon-colors"

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<any>;
  disabled?: boolean;
  requiredRole?: 'captain' | 'vessel' | 'admin';
  hideForRoles?: ('vessel' | 'admin' | 'captain')[]; // Roles for which this item should be hidden
  /** Only show for crew_limited (active) crew — e.g. vessel-generated documents viewer */
  crewLimitedOnly?: boolean;
  /** Hide for crew_limited users (full Documents features they should not use) */
  hideForCrewLimited?: boolean;
  /** Platform feature flag — hidden for non-admins when disabled */
  featureFlag?: FeatureFlagKey;
};

type NavGroup = {
  title: string;
  items: NavItem[];
  hideForRoles?: ('vessel' | 'admin' | 'captain' | 'crew')[];
};

/** Admin-only sidebar — grouped by task, not one long Platform list */
const adminNavGroups: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", label: "Home", icon: Home, disabled: false },
      { href: "/dashboard/inbox", label: "Inbox", icon: Inbox, disabled: false },
    ],
  },
  {
    title: "People",
    items: [
      { href: "/dashboard/users", label: "User lookup", icon: UserSearch, requiredRole: "admin", disabled: false },
      { href: "/dashboard/users/transfer", label: "Transfer account", icon: ArrowRightLeft, requiredRole: "admin", disabled: false },
      { href: "/dashboard/crew-analytics", label: "Crew analytics", icon: Users, requiredRole: "admin", disabled: false },
      { href: "/dashboard/login-activity", label: "Login activity", icon: LogIn, requiredRole: "admin", disabled: false },
    ],
  },
  {
    title: "Fleet",
    items: [
      { href: "/dashboard/vessels", label: "Vessels", icon: Ship, disabled: false },
      { href: "/dashboard/crew", label: "Crew", icon: Users, disabled: false },
    ],
  },
  {
    title: "Revenue",
    items: [
      { href: "/dashboard/revenue", label: "Revenue overview", icon: DollarSign, requiredRole: "admin", disabled: false },
      { href: "/dashboard/spending", label: "Spending & profit", icon: Wallet, requiredRole: "admin", disabled: false },
      { href: "/dashboard/crew-subscriptions", label: "Crew plans", icon: CreditCard, requiredRole: "admin", disabled: false },
      { href: "/dashboard/vessel-subscriptions", label: "Vessel plans", icon: Ship, requiredRole: "admin", disabled: false },
      { href: "/dashboard/partner-codes", label: "Partner codes", icon: TicketPercent, requiredRole: "admin", disabled: false },
      { href: "/dashboard/ad-revenue-tracking", label: "Ads tracking", icon: Megaphone, requiredRole: "admin", disabled: false },
    ],
  },
  {
    title: "Analytics",
    items: [
      { href: "/dashboard/platform-analytics", label: "Platform overview", icon: BarChart3, requiredRole: "admin", disabled: false },
      { href: "/dashboard/posthog", label: "PostHog", icon: Activity, requiredRole: "admin", disabled: false },
    ],
  },
  {
    title: "Product",
    items: [
      { href: "/dashboard/feature-flags", label: "Feature flags", icon: ToggleLeft, requiredRole: "admin", disabled: false },
      { href: "/dashboard/certificate-catalog", label: "Certificate catalog", icon: Award, requiredRole: "admin", disabled: false },
      { href: "/dashboard/career-milestones", label: "Career milestones", icon: Target, requiredRole: "admin", disabled: false },
      { href: "/dashboard/application-templates", label: "Apply templates", icon: ClipboardList, requiredRole: "admin", disabled: false },
      { href: "/dashboard/admin-messages", label: "Broadcasts", icon: MessagesSquare, requiredRole: "admin", disabled: false },
      { href: "/dashboard/pdf-coordinate-tool", label: "PDF coordinates", icon: Crosshair, requiredRole: "admin", disabled: false },
    ],
  },
  {
    title: "AIS",
    items: [
      { href: "/dashboard/ais-tracking", label: "AIS tracking", icon: Radar, requiredRole: "admin", disabled: false },
      { href: "/dashboard/ais-wrong-states", label: "Wrong states", icon: Flag, requiredRole: "admin", disabled: false },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/dashboard/profile", label: "Account", icon: User, disabled: false },
    ],
  },
  {
    title: "Help",
    items: [
      { href: "/dashboard/feedback", label: "Feedback", icon: MessageSquare, disabled: false },
      { href: "/dashboard/support", label: "Support", icon: HelpCircle, disabled: true },
      { href: "/dashboard/legal", label: "Legal", icon: FileText, disabled: true },
    ],
  },
];

const navGroups: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", label: "Home", icon: Home, disabled: false },
      { href: "/dashboard/inbox", label: "Inbox", icon: Inbox, disabled: false, hideForRoles: ['admin'] },
      { href: "/dashboard/vessel-history", label: "Past vessels", icon: Anchor, disabled: false, hideForRoles: ['vessel', 'admin'] },
    ]
  },
  {
    title: "Sea time",
    hideForRoles: ['admin'],
    items: [
      { href: "/dashboard/current", label: "Daily log", icon: MapPin, disabled: false },
      { href: "/dashboard/calendar", label: "Calendar", icon: Calendar, disabled: false },
      { href: "/dashboard/sea-time-request", label: "Request access", icon: Send, disabled: false, hideForRoles: ['vessel'], featureFlag: 'sea_time_request' },
      { href: "/dashboard/export", label: "Export reports", icon: Download, disabled: false, featureFlag: 'export_reports' },
    ]
  },
  {
    title: "Voyages",
    hideForRoles: ['admin'],
    items: [
      { href: "/dashboard/passage-logbook", label: "Passage log", icon: BookOpen, disabled: false, featureFlag: 'passage_logbook' },
      { href: "/dashboard/passages-map", label: "Passage tracks", icon: Route, disabled: false, hideForRoles: ['admin'], featureFlag: 'passages_map' },
      { href: "/dashboard/bridge-watch-log", label: "Bridge watch", icon: Navigation, disabled: false, hideForRoles: ['vessel'], featureFlag: 'bridge_watch_log' },
      { href: "/dashboard/watch-schedule", label: "Nav Watch", icon: Clock, requiredRole: "vessel", disabled: false, hideForRoles: ['captain'], featureFlag: 'watch_schedule' },
      { href: "/dashboard/visa-tracker", label: "Visa tracker", icon: Globe, disabled: false, hideForRoles: ['vessel', 'admin'], featureFlag: 'visa_tracker' },
      { href: "/dashboard/ais-import", label: "AIS history", icon: Database, disabled: false, featureFlag: 'ais_history_import' },
    ]
  },
  {
    title: "Career",
    hideForRoles: ['admin', 'vessel'],
    items: [
      { href: "/dashboard/career-documents", label: "Career documents", icon: FileSignature, disabled: false, hideForRoles: ['vessel', 'admin'] },
      { href: "/dashboard/career-progress", label: "Career progress", icon: Target, disabled: false, hideForRoles: ['vessel', 'admin', 'captain'], hideForCrewLimited: true, featureFlag: 'career_progress' },
      { href: "/dashboard/apply", label: "Apply for tickets", icon: Award, disabled: false, hideForRoles: ['vessel', 'admin', 'captain'], hideForCrewLimited: true, featureFlag: 'apply_tickets' },
      { href: "/dashboard/certificates", label: "Certificates", icon: ShieldCheck, disabled: false, hideForCrewLimited: true, featureFlag: 'certificates' },
      { href: "/dashboard/my-watch-schedule", label: "My watch roster", icon: Clock, disabled: false, hideForCrewLimited: true, featureFlag: 'watch_schedule' },
    ]
  },
  {
    title: "Vessel documents",
    hideForRoles: ['crew', 'captain', 'admin'],
    items: [
      { href: "/dashboard/documents", label: "Document generator", icon: Layers, disabled: false, requiredRole: "vessel", featureFlag: 'vessel_document_generator' },
      { href: "/dashboard/vessel-documents", label: "Generated documents", icon: FolderOpen, disabled: false, requiredRole: "vessel" },
    ]
  },
  {
    title: "Crew",
    hideForRoles: ['crew'],
    items: [
      { href: "/dashboard/vessels", label: "My vessels", icon: Ship, disabled: false, hideForRoles: ['vessel'] },
      { href: "/dashboard/crew", label: "Manage crew", icon: Users, requiredRole: "vessel", disabled: false, hideForRoles: ['captain'] },
      { href: "/dashboard/crew-roles", label: "Assign roles", icon: UserCog, requiredRole: "vessel", disabled: true, hideForRoles: ['captain'] },
      { href: "/dashboard/requests", label: "Sea-time requests", icon: ClipboardList, requiredRole: "captain", disabled: false },
      { href: "/dashboard/crew-rotation", label: "Onboard crew", icon: RefreshCw, requiredRole: "vessel", disabled: false, hideForRoles: ['captain'], featureFlag: 'crew_rotation' },
    ]
  },
  {
    title: "Account",
    items: [
      { href: "/dashboard/profile", label: "Profile", icon: User, disabled: false, hideForRoles: ['vessel'] },
      { href: "/dashboard/profile", label: "Vessel profile", icon: Ship, disabled: false, requiredRole: "vessel", hideForRoles: ['captain'] },
      { href: "/dashboard/vessel-roles", label: "Team accounts", icon: UserCog, requiredRole: "vessel", disabled: false, hideForRoles: ['captain'], featureFlag: 'vessel_team_accounts' },
      { href: "/dashboard/settings/signature", label: "Signature", icon: PenTool, requiredRole: "captain", disabled: false, hideForRoles: ['vessel'] },
    ]
  },
  {
    title: "Revenue",
    hideForRoles: ['crew', 'captain', 'vessel'],
    items: [
      { href: "/dashboard/revenue", label: "Revenue overview", icon: DollarSign, requiredRole: "admin", disabled: false },
      { href: "/dashboard/spending", label: "Spending & profit", icon: Wallet, requiredRole: "admin", disabled: false },
      { href: "/dashboard/crew-subscriptions", label: "Crew plans", icon: CreditCard, requiredRole: "admin", disabled: false },
      { href: "/dashboard/partner-codes", label: "Partner codes", icon: TicketPercent, requiredRole: "admin", disabled: false },
      { href: "/dashboard/vessel-subscriptions", label: "Vessel plans", icon: Ship, requiredRole: "admin", disabled: false },
      { href: "/dashboard/ad-revenue-tracking", label: "Ads tracking", icon: Megaphone, requiredRole: "admin", disabled: false },
    ]
  },
  {
    title: "Platform",
    hideForRoles: ['crew', 'captain', 'vessel'],
    items: [
      { href: "/dashboard/platform-analytics", label: "Platform overview", icon: BarChart3, requiredRole: "admin", disabled: false },
      { href: "/dashboard/posthog", label: "PostHog", icon: Activity, requiredRole: "admin", disabled: false },
      { href: "/dashboard/users", label: "User lookup", icon: UserSearch, requiredRole: "admin", disabled: false },
      { href: "/dashboard/users/transfer", label: "Transfer account", icon: ArrowRightLeft, requiredRole: "admin", disabled: false },
      { href: "/dashboard/crew-analytics", label: "Crew analytics", icon: Users, requiredRole: "admin", disabled: false },
      { href: "/dashboard/login-activity", label: "Login activity", icon: LogIn, requiredRole: "admin", disabled: false },
      { href: "/dashboard/ais-tracking", label: "AIS tracking", icon: Radar, requiredRole: "admin", disabled: false },
      { href: "/dashboard/ais-wrong-states", label: "AIS wrong states", icon: Flag, requiredRole: "admin", disabled: false },
      { href: "/dashboard/feature-flags", label: "Feature flags", icon: ToggleLeft, requiredRole: "admin", disabled: false },
      { href: "/dashboard/certificate-catalog", label: "Certificate catalog", icon: ShieldCheck, requiredRole: "admin", disabled: false },
      { href: "/dashboard/application-templates", label: "Apply templates", icon: ClipboardList, requiredRole: "admin", disabled: false },
      { href: "/dashboard/career-milestones", label: "Career milestones", icon: Award, requiredRole: "admin", disabled: false },
      { href: "/dashboard/admin-messages", label: "Broadcasts", icon: MessagesSquare, requiredRole: "admin", disabled: false },
      { href: "/dashboard/pdf-coordinate-tool", label: "PDF coordinates", icon: Crosshair, requiredRole: "admin", disabled: false },
    ]
  },
  {
    title: "Help",
    items: [
      { href: "/dashboard/feedback", label: "Feedback", icon: MessageSquare, disabled: false },
      { href: "/dashboard/support", label: "Support", icon: HelpCircle, disabled: true },
      { href: "/dashboard/legal", label: "Legal", icon: FileText, disabled: true },
    ]
  },
]

function accountTypeLabel(role?: string | null): string {
  switch ((role || "").toLowerCase()) {
    case "admin":
      return "Admin"
    case "vessel":
      return "Vessel"
    case "captain":
      return "Captain"
    case "crew":
      return "Crew"
    default:
      return "Account"
  }
}

function accountTypeBadgeClass(role?: string | null): string {
  switch ((role || "").toLowerCase()) {
    case "admin":
      return "bg-red-500/10 text-red-700 border-red-500/20 dark:bg-red-500/20 dark:text-red-400"
    case "vessel":
      return "bg-sky-500/10 text-sky-700 border-sky-500/20 dark:bg-sky-500/20 dark:text-sky-400"
    case "captain":
      return "bg-violet-500/10 text-violet-700 border-violet-500/20 dark:bg-violet-500/20 dark:text-violet-400"
    case "crew":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400"
    default:
      return "bg-muted text-muted-foreground border-border"
  }
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  userProfile?: UserProfile | null
}

export function AppSidebar({ userProfile, ...props }: AppSidebarProps) {
  const pathname = usePathname()
  const { supabase } = useSupabase()
  const { user } = useUser()
  const { isEnabled: isFeatureEnabled, flags, tierAccess, isAdmin: isFeatureAdmin } = useFeatureFlags()
  const [inboxCount, setInboxCount] = React.useState<number>(0)
  const [feedbackCount, setFeedbackCount] = React.useState<number>(0)
  const [requestsCount, setRequestsCount] = React.useState<number>(0)

  // Create admin-specific navGroups with updated Vessel Management and Account sections
  const isAdmin = userProfile?.role === 'admin'
  
  // Check if user has crew_limited tier (restricted nav — see CREW_LIMITED_ALLOWED_HREFS)
  const isCrewLimited = React.useMemo(() => {
    return isCrewLimitedAccount(userProfile);
  }, [userProfile]);

  const { boost: vesselBoost, managerTier } = useCrewVesselFeatureBoost();
  const vesselContext = React.useMemo(
    () => ({ boost: vesselBoost, managerTier }),
    [vesselBoost, managerTier],
  );

  const isCrewNavRestricted = React.useMemo(() => {
    return isCrewLimitedNavigationRestricted(userProfile, vesselBoost);
  }, [userProfile, vesselBoost]);

  const hasPaidAccess = React.useMemo(() => {
    if (!userProfile) return false;
    return hasPaidDashboardAccess(userProfile);
  }, [userProfile]);

  // Vessel-linked secondary accounts (created via /dashboard/vessel-roles by a
  // Pro/Fleet vessel manager). Parallel to crew_limited but with its own
  // allowed-hrefs whitelist. Captain-linked accounts have role='captain' so
  // they additionally see captain-only nav items (signature, requests).
  const isVesselLinked = React.useMemo(() => {
    return isVesselLinkedAccount(userProfile);
  }, [userProfile]);

  const restrictedAllowedHrefs = React.useMemo(() => {
    if (isVesselLinked) return new Set(vesselLinkedAllowedHrefs(userProfile));
    if (isCrewNavRestricted && userProfile) {
      return resolveCrewRestrictedAllowedHrefs({
        profile: userProfile,
        vesselContext,
        enabledMap: flags,
        tierAccess,
        isAdmin: isFeatureAdmin,
      });
    }
    return null;
  }, [
    isVesselLinked,
    isCrewNavRestricted,
    userProfile,
    vesselContext,
    flags,
    tierAccess,
    isFeatureAdmin,
  ]);

  // Check if user has premium/pro subscription for visa tracker access
  const hasPremiumAccess = React.useMemo(() => {
    if (!userProfile) return false;
    const tier = ((userProfile as any).subscription_tier || userProfile.subscriptionTier || 'free').toLowerCase();
    const role = (userProfile as any).role || userProfile.role || 'crew';
    const entitled = hasActiveSubscriptionEntitlement(userProfile);

    if (role === 'vessel') {
      return (
        (tier.startsWith('vessel_') ||
          tier === 'vessel_lite' ||
          tier === 'vessel_basic' ||
          tier === 'vessel_pro' ||
          tier === 'vessel_fleet') &&
        entitled
      );
    }

    return hasCrewPremiumPlusFeatures(userProfile, vesselBoost);
  }, [userProfile, vesselBoost]);

  /** Passage log: Premium+ crew (not crew_limited without boost), vessel tiers, admin */
  const hasPassageLogAccess = React.useMemo(() => {
    if (!userProfile) return false;
    const role = (userProfile as any).role || userProfile.role || 'crew';

    if (role === 'admin') return true;

    if (role === 'vessel') {
      const tier = ((userProfile as any).subscription_tier || userProfile.subscriptionTier || 'free').toLowerCase();
      return (
        (tier.startsWith('vessel_') ||
          tier === 'vessel_lite' ||
          tier === 'vessel_basic' ||
          tier === 'vessel_pro' ||
          tier === 'vessel_fleet') &&
        hasActiveSubscriptionEntitlement(userProfile)
      );
    }

    return hasCrewPremiumPlusFeatures(userProfile, vesselBoost);
  }, [userProfile, vesselBoost]);

  /** Vessel Premium+ features: roles, watch schedule, onboard tracker */
  const hasVesselPremiumPlus = React.useMemo(() => {
    if (!userProfile) return false;
    return hasVesselPremiumPlusFeatures(userProfile);
  }, [userProfile]);

  const hasAisHistoryImportAccess = React.useMemo(() => {
    if (!userProfile) return false;
    return hasAisHistoryImportTier(userProfile, vesselBoost);
  }, [userProfile, vesselBoost]);

  /**
   * Passages Map: gated by `hasPassagesMapAccess` in subscription-helpers.
   * Crew Professional (+ TEMP Crew Premium) and Vessel Premium+.
   */
  const hasPassagesMapAccess = React.useMemo(() => {
    if (!userProfile) return false;
    return hasPassagesMapAccessGate(userProfile, vesselBoost);
  }, [userProfile, vesselBoost]);

  const VESSEL_PREMIUM_PLUS_NAV = new Set([
    '/dashboard/watch-schedule',
    '/dashboard/crew-rotation',
    '/dashboard/vessel-roles',
  ]);

  // Check if user is an officer (for bridge watch log access)
  const isOfficer = React.useMemo(() => {
    if (!userProfile) return false;
    const position = ((userProfile as any).position || userProfile.position || '').toLowerCase();
    const role = ((userProfile as any).role || userProfile.role || '').toLowerCase();
    
    // Officers include: Captain, Chief Officer, First Officer, First Mate, Second Officer, Third Officer, OOW, Deck Officer
    // Also Chief Engineer, First Engineer, Second Engineer, Third Engineer, Fourth Engineer
    const officerPositions = [
      'captain', 'master', 'chief officer', 'first officer', 'first mate', 
      'second officer', 'third officer', 'officer of the watch', 'oow', 'deck officer',
      'chief engineer', 'first engineer', 'second engineer', 'third engineer', 'fourth engineer'
    ];
    
    return role === 'captain' || role === 'admin' || officerPositions.some(op => position.includes(op));
  }, [userProfile]);

  const shouldShowNavItem = React.useCallback((item: NavItem): boolean => {
    if (item.requiredRole) {
      const userRole = userProfile?.role;
      if (!userRole) return false;
      if (userRole !== 'admin') {
        if (item.requiredRole === 'vessel') {
          if (userRole !== 'vessel' && userRole !== 'captain') return false;
        } else if (item.requiredRole === 'captain') {
          if (userRole !== 'captain' && userRole !== 'vessel') return false;
        } else if (item.requiredRole === 'admin') {
          return false;
        } else if (userRole !== item.requiredRole) {
          return false;
        }
      }
    }

    if (
      !isVesselLinked &&
      item.hideForRoles &&
      userProfile?.role &&
      item.hideForRoles.includes(userProfile.role as 'vessel' | 'admin' | 'captain')
    ) {
      return false;
    }

    if (item.disabled) return false;
    if (item.crewLimitedOnly && !isCrewLimited) return false;
    if (item.hideForCrewLimited && isCrewNavRestricted) {
      if (!item.featureFlag || !isFeatureEnabled(item.featureFlag)) return false;
    }
    if (item.href === '/dashboard/vessel-documents' && !hasPaidAccess) return false;
    if (item.featureFlag && !isFeatureEnabled(item.featureFlag)) return false;
    if (
      item.href === '/dashboard/career-documents' &&
      !isFeatureEnabled('testimonials') &&
      !isFeatureEnabled('proof_of_service')
    ) {
      return false;
    }

    if (restrictedAllowedHrefs && !restrictedAllowedHrefs.has(item.href)) {
      return false;
    }

    if (
      item.href === '/dashboard/bridge-watch-log' &&
      !isOfficer &&
      !isVesselLinked
    ) {
      return false;
    }

    if (
      isVesselLinked &&
      item.href === '/dashboard/watch-schedule' &&
      isVesselLinkedFeatureGranted(userProfile, 'bridge_watch_log')
    ) {
      return false;
    }

    if (
      isVesselLinked &&
      item.href === '/dashboard/my-watch-schedule' &&
      String(userProfile?.role || '').toLowerCase() === 'captain'
    ) {
      return false;
    }

    if (item.href === '/dashboard/requests' && requestsCount === 0) {
      return false;
    }

    return true;
  }, [
    userProfile,
    isVesselLinked,
    isCrewLimited,
    isCrewNavRestricted,
    hasPaidAccess,
    isFeatureEnabled,
    restrictedAllowedHrefs,
    isOfficer,
    requestsCount,
  ]);
  
  // Use admin navGroups for admin, regular navGroups for others
  const displayNavGroups: NavGroup[] = isAdmin ? adminNavGroups : navGroups
  const router = useRouter()
  const { setTheme } = useTheme()

  const handleSignOut = async () => {
    await signOutLocal(supabase)
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

  // Fetch vessel data if user is vessel role
  const activeVesselId = userProfile ? ((userProfile as any).active_vessel_id || (userProfile as any).activeVesselId) : null;
  const { data: vesselData } = useDoc<any>('vessels', (userProfile?.role === 'vessel' && activeVesselId) ? activeVesselId : null);
  
  // Fetch inbox count for captains/admins/vessel managers
  React.useEffect(() => {
    const fetchInboxCount = async () => {
      if (!user?.id || !userProfile) return;
      
      const userRole = userProfile.role?.toLowerCase() || '';
      const isCaptain = userRole === 'captain' || userRole === 'vessel' || userRole === 'admin';

      try {
        if (userRole === 'admin') {
          // Admins see captaincy requests that need approval (pending, vessel_approved, admin_approved)
          // and captain role applications
          const [captaincyResult, applicationsResult] = await Promise.all([
            supabase
              .from('vessel_claim_requests')
              .select('id', { count: 'exact', head: true })
              .in('status', ['pending', 'vessel_approved', 'admin_approved']),
            supabase
              .from('captain_role_applications')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'pending')
          ]);
          
          const captaincyCount = captaincyResult.count || 0;
          const applicationsCount = applicationsResult.count || 0;
          console.log('[SIDEBAR] Admin inbox count:', { captaincyCount, applicationsCount, total: captaincyCount + applicationsCount });
          setInboxCount(captaincyCount + applicationsCount);
        } else if (userRole === 'captain' || userRole === 'vessel') {
          // Captains/vessel managers see testimonials addressed to them
          let testimonialQuery = supabase
            .from('testimonials')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending_captain');
          
          // Match by captain_user_id OR captain_email
          if (user?.id && user?.email) {
            testimonialQuery = testimonialQuery.or(`captain_user_id.eq.${user.id},captain_email.ilike.${user.email}`);
          } else if (user?.id) {
            testimonialQuery = testimonialQuery.eq('captain_user_id', user.id);
          } else if (user?.email) {
            testimonialQuery = testimonialQuery.ilike('captain_email', user.email);
          }
          
          const { count: testimonialCount } = await testimonialQuery;
          
          // Also fetch sea time requests for vessel accounts only (not captains)
          let seaTimeCount = 0;
          let captaincyCount = 0;
          const isVesselRole = userRole === 'vessel';
          if (isVesselRole && activeVesselId) {
            // Fetch sea time requests
            const { count: seaTimeRequestCount } = await supabase
              .from('sea_time_requests')
              .select('id', { count: 'exact', head: true })
              .eq('vessel_id', activeVesselId)
              .eq('status', 'pending');
            
            seaTimeCount = seaTimeRequestCount || 0;
            
            // Fetch captaincy requests that need vessel approval
            const { count: captaincyRequestCount } = await supabase
              .from('vessel_claim_requests')
              .select('id', { count: 'exact', head: true })
              .eq('vessel_id', activeVesselId)
              .in('status', ['pending', 'admin_approved']);
            
            captaincyCount = captaincyRequestCount || 0;

            const { count: planCoverageCount } = await supabase
              .from('vessel_plan_coverage_requests')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'pending');

            let sentTestimonialCount = 0;
            let sentAccessCount = 0;
            let testimonialSentQuery = supabase
              .from('testimonials')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'pending_captain');
            if (activeVesselId) {
              testimonialSentQuery = testimonialSentQuery.or(
                `vessel_id.eq.${activeVesselId},generated_by_user_id.eq.${user.id}`,
              );
            } else {
              testimonialSentQuery = testimonialSentQuery.eq(
                'generated_by_user_id',
                user.id,
              );
            }
            const [sentTestimonials, sentAccess] = await Promise.all([
              testimonialSentQuery,
              supabase
                .from('vessel_sea_time_access_requests')
                .select('id', { count: 'exact', head: true })
                .eq('vessel_user_id', user.id)
                .eq('status', 'pending'),
            ]);
            sentTestimonialCount = sentTestimonials.count || 0;
            sentAccessCount = sentAccess.count || 0;

            setInboxCount(
              (testimonialCount || 0) +
                seaTimeCount +
                captaincyCount +
                (planCoverageCount || 0) +
                sentTestimonialCount +
                sentAccessCount,
            );
          } else {
            setInboxCount((testimonialCount || 0) + seaTimeCount + captaincyCount);
          }
        } else {
          // Crew: vessel sea time access requests, vessel sea time offers, and pending testimonials (where user is captain)
          const [accessResult, offersResult, testimonialResult] = await Promise.all([
            supabase
              .from('vessel_sea_time_access_requests')
              .select('id', { count: 'exact', head: true })
              .eq('crew_user_id', user.id)
              .eq('status', 'pending'),
            supabase
              .from('vessel_sea_time_offers')
              .select('id', { count: 'exact', head: true })
              .eq('crew_user_id', user.id)
              .eq('status', 'pending'),
            (() => {
              let q = supabase
                .from('testimonials')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'pending_captain');
              if (user?.id && user?.email) {
                q = q.or(`captain_user_id.eq.${user.id},captain_email.ilike.${user.email}`);
              } else if (user?.id) {
                q = q.eq('captain_user_id', user.id);
              } else if (user?.email) {
                q = q.ilike('captain_email', user.email);
              }
              return q;
            })(),
          ]);
          const accessCount = accessResult.count ?? 0;
          const offersCount = offersResult.count ?? 0;
          const testimonialCount = testimonialResult.count ?? 0;
          setInboxCount(accessCount + offersCount + testimonialCount);
        }
      } catch (error) {
        console.error('[SIDEBAR] Error fetching inbox count:', error);
        setInboxCount(0);
      }
    };

    fetchInboxCount();
    
    // Set up realtime subscription to update count when items change
    const channel = supabase
      .channel('inbox-count-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'testimonials',
          filter: `status=eq.pending_captain`,
        },
        () => {
          fetchInboxCount();
        }
      )
      // Subscribe to vessel_claim_requests for admins (all statuses that need admin attention)
      // For non-admins, this will be filtered by the fetchInboxCount function
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vessel_claim_requests',
        },
        () => {
          fetchInboxCount();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'captain_role_applications',
          filter: `status=eq.pending`,
        },
        () => {
          fetchInboxCount();
        }
      )
      // Crew: vessel sea time access requests and vessel sea time offers
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vessel_sea_time_access_requests',
        },
        () => {
          fetchInboxCount();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vessel_sea_time_offers',
        },
        () => {
          fetchInboxCount();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vessel_plan_coverage_requests',
        },
        () => {
          fetchInboxCount();
        }
      );
    
    // Add sea time requests and captaincy requests subscriptions for vessel accounts only (not captains)
    const userRoleForSub = userProfile?.role?.toLowerCase() || '';
    const isVesselRoleForSub = userRoleForSub === 'vessel';
    if (isVesselRoleForSub && activeVesselId) {
      // Subscribe to sea time requests
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sea_time_requests',
          filter: `vessel_id=eq.${activeVesselId},status=eq.pending`,
        },
        () => {
          fetchInboxCount();
        }
      );
      
      // Subscribe to captaincy requests for this vessel
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vessel_claim_requests',
          filter: `vessel_id=eq.${activeVesselId}`,
        },
        () => {
          fetchInboxCount();
        }
      );
    }
    
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, user?.email, userProfile, supabase, activeVesselId]);

  // Fetch feedback count for all users
  React.useEffect(() => {
    const fetchFeedbackCount = async () => {
      if (!user?.id || !userProfile) {
        setFeedbackCount(0);
        return;
      }

      try {
        const userRole = userProfile.role?.toLowerCase() || '';
        
        if (userRole === 'admin') {
          // Admins see count of open/in_progress feedback
          const { count } = await supabase
            .from('feedback')
            .select('id', { count: 'exact', head: true })
            .in('status', ['open', 'in_progress']);
          
          setFeedbackCount(count || 0);
        } else {
          // Regular users see count of feedback with unread admin responses
          const { count } = await supabase
            .from('feedback')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .not('admin_response', 'is', null)
            .is('admin_response_read_at', null);
          
          setFeedbackCount(count || 0);
        }
      } catch (error) {
        console.error('[SIDEBAR] Error fetching feedback count:', error);
        setFeedbackCount(0);
      }
    };

    fetchFeedbackCount();
    
    // Set up realtime subscription to update count when feedback changes
    const channel = supabase
      .channel('feedback-count-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'feedback',
        },
        () => {
          fetchFeedbackCount();
        }
      );
    
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, userProfile, supabase]);

  // Fetch requests count for captains (only show link if there are active requests)
  React.useEffect(() => {
    const fetchRequestsCount = async () => {
      if (!user?.id || !userProfile) {
        setRequestsCount(0);
        return;
      }

      // Only check for captains (users who can make requests)
      const userRole = userProfile.role?.toLowerCase() || '';
      if (userRole !== 'captain') {
        setRequestsCount(0);
        return;
      }

      try {
        // Count active requests (not approved or rejected)
        const { count } = await supabase
          .from('vessel_claim_requests')
          .select('id', { count: 'exact', head: true })
          .eq('requested_by', user.id)
          .in('status', ['pending', 'vessel_approved', 'admin_approved']);
        
        setRequestsCount(count || 0);
      } catch (error) {
        console.error('[SIDEBAR] Error fetching requests count:', error);
        setRequestsCount(0);
      }
    };

    fetchRequestsCount();
    
    // Set up realtime subscription to update count when requests change
    const channel = supabase
      .channel('requests-count-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vessel_claim_requests',
          filter: user?.id ? `requested_by=eq.${user.id}` : undefined,
        },
        () => {
          fetchRequestsCount();
        }
      );
    
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, userProfile, supabase]);
  
  // Get display username and email from userProfile or user object
  // For vessel role, use vessel name instead of username
  const displayUsername = React.useMemo(() => {
    if (userProfile?.role === 'vessel' && vesselData?.name) {
      return vesselData.name;
    }
    return userProfile?.username || user?.user_metadata?.username || user?.email?.split("@")[0] || "User";
  }, [userProfile, vesselData, user]);
  
  const userEmail = userProfile?.email || user?.email || "";
  
  // Get initials - prefer vessel name (first 2 chars), then firstName + lastName, then username, then email
  const getAvatarInitials = () => {
    if (userProfile?.role === 'vessel' && vesselData?.name) {
      return vesselData.name.substring(0, 2).toUpperCase();
    }
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

  const subscriptionActiveLine = React.useMemo(() => {
    if (!userProfile) return undefined;
    if (userProfile.role === 'admin') return '#f87171';
    if (!hasActiveSubscriptionEntitlement(userProfile)) return undefined;
    const tier =
      (userProfile as { subscription_tier?: string; subscriptionTier?: string })
        .subscription_tier ||
      userProfile.subscriptionTier ||
      'free';
    return getSubscriptionTierAccentColor(tier) ?? undefined;
  }, [userProfile]);

  return (
    <TooltipProvider delayDuration={300}>
    <Sidebar
      collapsible="icon"
      {...props}
      className={cn(props.className)}
      style={{
        ...props.style,
        ...(subscriptionActiveLine
          ? ({ '--sidebar-active-line': subscriptionActiveLine } as React.CSSProperties)
          : null),
      }}
    >
      <SidebarHeader className="border-b border-sidebar-border/80 px-2 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              className="h-11 rounded-xl hover:bg-sidebar-accent/60 data-[active=true]:shadow-none"
            >
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 shrink-0 items-center justify-center text-sidebar-foreground">
                  <svg 
                    version="1.1" 
                    viewBox="0 0 2048 1670" 
                    className="size-7"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path transform="translate(410,73)" d="m0 0h69l54 2 37 3 59 7 60 10 55 11 38 9 42 11 48 14 47 15 43 15 28 11 46 19 20 9 21 9 38 19 15 8 15 6 5 3 4-2 10-8 14-8 9-6 45-23 16-8 27-13 32-14 34-13 27-10 36-12 29-9 50-14 26-6 40-8 22-3 18-5 16-1h29l10-3 20-3 20-1h81l32 2 26 4 12 1 31 1 82 16 28 7 18 6 16 8 3 3 1 5v317l-1 153-2 15-2 2-13-2-13-8-9-6-20-11-8-6-7-7-12-9-5-4-5-2h-12l-25-10-41-20-18-6-37-8-18-1-3-1-18-2-9-3h-102l-34 5-11 3h-7l-7 3-3-2h-6l-3 1-10-2h-7l-5 2h-15l-11 4-20 8-10 6-27 12-30 11-33 14-33 15-29 15-23 13-22 13-19 12-21 13-20 13-27 18-18 13-12 9-18 13-15 11-12 9-9 7-13 12-8 7-14 12-14 11-10 9-14 11-11 10-11 9-15 13-26 22-10 8-14 11-16 13-11 9-14 11-12 9-14 11-34 26-34 24-18 12-17 11-16 10-13 8-25 14-18 10-22 12-23 12-30 15-29 13-34 14-29 11-50 17-51 15-40 10-40 9-38 7-52 7-44 4-55 3h-66l-45-2-22-3-10-4-8-8-2-5-1-17-1-46-1-215v-501l1-116 2-119 6-12 16-12 16-8 32-13 36-12 28-8 39-9 28-6 31-4 18-4 57-8 24-2z" fill="currentColor"/>
                    <path transform="translate(1643,887)" d="m0 0h55l31 3 36 4 20 2 39 7 35 9 32 11 26 11 29 15 13 8 21 14 12 9 11 9 8 10 3 7v175l-1 98-1 24-3 23-1 4-1 20-3 7-6-2-20-12-28-15-17-10-19-9-16-7-16-12-13-8-13-4-33-8-14-5-24-5-49-8-25-2h-64l-8 3-6 3-8-1-1 3h-6l-3-3h-7l-4 1v-2h-3l-1 3-5-1-1-1-7-1v3l-5-2v2h-2v-2l-39 9-55 16-36 12-40 12-27 9-24 9-28 11-16 8-26 14-16 8-28 13-21 8-27 14-21 13-13 12-5 6-17 7-9 1-17 9-22 13-31 16-42 19-16 8-19 9-19 10-31 15-34 14-42 15-37 12-53 15-47 11-28 5-33 4-22 3-75 5h-45l-71-3-7 1-8-4-36-7-10-2-15-4-9 1h-6l-6-4-24-8-28-7-32-13-24-10-35-16-20-10-20-12-38-24-20-12-17-12-19-14-16-12-14-11-7-8v-3l4-1h7l16 8 16 10 10 5 12 3-2-10-5-11v-5l2-2 9 1 79 21 48 10 29 4 47 6 31 2h85l28-2 15-3 21-4 14-1 34-7 26-6 53-15 43-15 28-11 29-12 29-13 30-14 29-14 38-20 23-13 21-12 28-17 41-26 69-46 14-10 18-12 12-9 11-9 10-7 13-8 12-6 3-4 4-7 11-12 17-12 19-10 12-11 8-7 11-10 69-46 17-11 15-10 19-12 17-10 14-9 32-17 39-20 16-5h10l15-3 19-11 10-6 6-5h8l6 4 6 5 13-1 13-10 8-6 11-8 20-8 7-2 13 1 13 3 7-1z" fill="currentColor"/>
                  </svg>
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold tracking-tight">SeaJourney</span>
                  <span className="truncate text-[11px] text-sidebar-foreground/50">
                    {accountTypeLabel(userProfile?.role)} workspace
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="px-1 py-2">
        {displayNavGroups.map((group) => {
          // Hide entire group if user role matches hideForRoles
          const userRole = userProfile?.role?.toLowerCase() || '';
          
          if (group.hideForRoles && userProfile?.role) {
            // Check if user role is in the hideForRoles array
            const shouldHide = group.hideForRoles.some(role => {
              const roleLower = role.toLowerCase();
              return userRole === roleLower;
            });
            if (shouldHide) {
              return null;
            }
          }

          const visibleItems = group.items.filter(shouldShowNavItem);
          if (visibleItems.length === 0) return null;

          // For vessel accounts, show "Vessel" as the Account section heading
          const groupLabel = (group.title === "Account" && userProfile?.role === "vessel") ? "Vessel" : group.title;
          return (
          <SidebarGroup key={group.title} className="py-1">
            <SidebarGroupLabel>
              {groupLabel}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {visibleItems.map((item) => {
                  // Locked teasers (upgrade sparkles) are for paying plans that
                  // don't include a feature yet. Restricted vessel-managed
                  // accounts only see pages they can actually open.
                  const isVisaTracker = item.href === '/dashboard/visa-tracker';
                  const isPassageLog = item.href === '/dashboard/passage-logbook';
                  const isPassagesMap = item.href === '/dashboard/passages-map';
                  const isBridgeWatch = item.href === '/dashboard/bridge-watch-log';
                  const isExport = item.href === '/dashboard/export';
                  const isSeaTimeRequest = item.href === '/dashboard/sea-time-request';
                  const isCertificates = item.href === '/dashboard/certificates';
                  const isAisImport = item.href === '/dashboard/ais-import';
                  const hideLockedTeasers = isCrewNavRestricted || isVesselLinked;
                  const requiresPremium =
                    !hideLockedTeasers &&
                    !item.featureFlag &&
                    (isVisaTracker || isBridgeWatch || isSeaTimeRequest || isCertificates || isExport) &&
                    !hasPremiumAccess;
                  const passageNavLocked =
                    !hideLockedTeasers &&
                    !item.featureFlag &&
                    isPassageLog &&
                    !hasPassageLogAccess;
                  const aisImportNavLocked =
                    !hideLockedTeasers &&
                    !item.featureFlag &&
                    isAisImport &&
                    !hasAisHistoryImportAccess;
                  const passagesMapNavLocked =
                    !hideLockedTeasers &&
                    !item.featureFlag &&
                    isPassagesMap &&
                    !hasPassagesMapAccess;
                  const vesselPremiumNavLocked =
                    !hideLockedTeasers &&
                    !item.featureFlag &&
                    VESSEL_PREMIUM_PLUS_NAV.has(item.href) &&
                    userProfile?.role === 'vessel' &&
                    !hasVesselPremiumPlus;

                  const isNavLocked =
                    requiresPremium ||
                    passageNavLocked ||
                    aisImportNavLocked ||
                    passagesMapNavLocked ||
                    vesselPremiumNavLocked;

                  const isActive =
                    item.href === '/dashboard'
                      ? pathname === '/dashboard'
                      : pathname === item.href || pathname.startsWith(`${item.href}/`)
                  
                  const uniqueKey = `${item.href}-${item.label}`
                  
                  const isInbox = item.href === '/dashboard/inbox';
                  const isFeedback = item.href === '/dashboard/feedback';
                  const isRequests = item.href === '/dashboard/requests';

                  const countBadgeClass =
                    'ml-auto h-5 min-w-5 rounded-full border-0 bg-sky-400/20 px-1.5 text-[10px] font-semibold tabular-nums text-sky-100 group-data-[collapsible=icon]:hidden'

                  const iconPresentation = navIconPresentation(groupLabel, {
                    isActive,
                    isLocked: isNavLocked,
                    coloredByGroup: isAdmin,
                  });
                  
                  return (
                    <SidebarMenuItem key={uniqueKey}>
                      {isNavLocked ? (
                        <Tooltip delayDuration={200}>
                          <TooltipTrigger asChild>
                            <div className="w-full">
                              <SidebarMenuButton 
                                disabled
                                className="group/button w-full text-sidebar-foreground/55"
                              >
                                <div className="flex w-full items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
                                  <item.icon
                                    className={iconPresentation.className}
                                    style={iconPresentation.style}
                                  />
                                  <span className="flex-1 group-data-[collapsible=icon]:hidden">{item.label}</span>
                                  <Sparkles className="ml-auto h-3.5 w-3.5 shrink-0 text-amber-300/90 group-data-[collapsible=icon]:hidden" />
                                </div>
                              </SidebarMenuButton>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs z-[100]" sideOffset={8} align="start">
                            <div className="space-y-1">
                              <p className="font-semibold">{item.label}</p>
                              <p className="text-xs text-muted-foreground">
                                {passagesMapNavLocked
                                  ? 'The Passages Map is a Crew Professional feature. Upgrade to plot every passage across all your vessels on an interactive world map.'
                                  : passageNavLocked
                                    ? 'Passage Log is available on Crew Premium and Professional plans, or with an active vessel subscription.'
                                    : vesselPremiumNavLocked
                                      ? 'Available on Vessel Premium and Professional plans. Upgrade to unlock watch schedules, onboard tracker, linked roles, and Form Builder.'
                                      : 'This feature requires a Premium or Pro subscription. Upgrade to unlock advanced features.'}
                              </p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <SidebarMenuButton
                          tooltip={item.label}
                          asChild
                          isActive={isActive}
                          className="[&>svg]:!opacity-[unset]"
                        >
                          <Link
                            href={item.href}
                            className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center"
                          >
                            <item.icon
                              className={iconPresentation.className}
                              style={iconPresentation.style}
                            />
                            <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                          {isInbox && inboxCount > 0 && (
                            <Badge variant="secondary" className={countBadgeClass}>
                              {inboxCount > 99 ? '99+' : inboxCount}
                            </Badge>
                          )}
                          {isRequests && requestsCount > 0 && (
                            <Badge variant="secondary" className={countBadgeClass}>
                              {requestsCount > 99 ? '99+' : requestsCount}
                            </Badge>
                          )}
                          {isFeedback && feedbackCount > 0 && (
                            <Badge variant="secondary" className={countBadgeClass}>
                              {feedbackCount > 99 ? '99+' : feedbackCount}
                            </Badge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )
        })}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/80 p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="h-12 rounded-xl data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground data-[active=true]:shadow-none"
                >
                  <Avatar className="h-8 w-8 rounded-lg ring-1 ring-white/10">
                    <AvatarFallback className="rounded-lg bg-sky-500/20 text-sky-100">
                      {getAvatarInitials()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      {displayUsername}
                    </span>
                    <span className="truncate text-[11px] text-sidebar-foreground/50">
                      {accountTypeLabel(userProfile?.role)} account
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/40" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-64 rounded-xl p-0"
                side="right"
                align="end"
                sideOffset={10}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-start gap-3 px-3 py-3">
                    <Avatar className="h-10 w-10 rounded-xl">
                      <AvatarFallback className="rounded-xl bg-primary/80 text-sm text-primary-foreground">
                        {getAvatarInitials()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="leading-tight">
                        <div className="truncate font-semibold">
                          {displayUsername}
                        </div>
                        {userEmail ? (
                          <div className="truncate text-xs text-muted-foreground">
                            {userEmail}
                          </div>
                        ) : null}
                      </div>
                      <Badge
                        variant="outline"
                        className={`h-5 px-1.5 text-[10px] font-medium ${accountTypeBadgeClass(userProfile?.role)}`}
                      >
                        {accountTypeLabel(userProfile?.role)} account
                      </Badge>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="m-0" />
                <div className="p-1">
                <DropdownMenuItem
                  className="rounded-lg"
                  onClick={() => router.push("/dashboard/profile")}
                >
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="rounded-lg"
                  onClick={() => router.push("/dashboard/subscription")}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Subscription
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="rounded-lg">
                    <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    <span className="ml-2">Theme</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="rounded-xl">
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
                </div>
                <DropdownMenuSeparator className="m-0" />
                <div className="p-1">
                <DropdownMenuItem
                  className="rounded-lg text-destructive focus:text-destructive"
                  onClick={handleSignOut}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
    </TooltipProvider>
  )
}
