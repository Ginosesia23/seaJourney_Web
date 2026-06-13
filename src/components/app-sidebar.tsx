"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  Ship,
  LifeBuoy,
  Award,
  User,
  Users,
  Map,
  Download,
  HelpCircle,
  FileText,
  MapPin,
  ChevronRight,
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
  ShieldCheck,
  Megaphone,
  MessagesSquare,
  Crosshair,
  FileSignature,
  Clock,
  RefreshCw,
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
  hasVesselPremiumPlusFeatures,
  isVesselLinkedAccount,
} from "@/supabase/database/subscription-helpers"

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
};

const navGroups: Array<{ title: string; items: NavItem[]; hideForRoles?: ('vessel' | 'admin' | 'captain' | 'crew')[] }> = [
  {
    title: "Dashboard",
    items: [
      { href: "/dashboard", label: "Home", icon: Home, disabled: false },
      { href: "/dashboard/vessel-history", label: "Vessel History", icon: Ship, disabled: false, hideForRoles: ['vessel', 'admin'] },
    ]
  },
  {
    title: "Sea Service",
    hideForRoles: ['admin'], // Only hide for admin, vessel role needs sea time tracking
    items: [
      { href: "/dashboard/current", label: "Current", icon: MapPin, disabled: false },
      { href: "/dashboard/calendar", label: "Calendar", icon: Calendar, disabled: false },
      { href: "/dashboard/sea-time-request", label: "Request Sea Time", icon: FileText, disabled: false, hideForRoles: ['vessel'] }, // Only for crew members
      { href: "/dashboard/export", label: "Export", icon: Download, disabled: false },
    ]
  },
  {
    title: "Logbooks",
    hideForRoles: ['admin'],
    items: [
      { href: "/dashboard/passage-logbook", label: "Passage Log", icon: Map, disabled: false },
      { href: "/dashboard/bridge-watch-log", label: "Bridge Watch", icon: Navigation, disabled: false, hideForRoles: ['vessel'] }, // Hide Bridge Watch for vessel role
      { href: "/dashboard/visa-tracker", label: "Visa Tracker", icon: Globe, disabled: false, hideForRoles: ['vessel', 'admin'] }, // Available for crew, captain roles
      { href: "/dashboard/ais-import", label: "AIS Import", icon: Database, disabled: false },
    ]
  },
  {
    title: "Documents",
    hideForRoles: ['admin', 'vessel'], // Hide entire section for admin and vessel manager users
    items: [
      { href: "/dashboard/applications", label: "Documents", icon: FileText, disabled: false, hideForRoles: ['vessel', 'admin', 'captain'], hideForCrewLimited: true },
      { href: "/dashboard/vessel-documents", label: "Documents", icon: FileText, disabled: false, hideForRoles: ['vessel', 'admin', 'captain'], crewLimitedOnly: true },
      { href: "/dashboard/certificates", label: "Certificates", icon: Award, disabled: false, hideForCrewLimited: true },
      { href: "/dashboard/proof-of-service", label: "Proof of Service", icon: ShieldCheck, disabled: false, hideForCrewLimited: true },
      { href: "/dashboard/my-watch-schedule", label: "Watch Schedule", icon: Clock, disabled: false, hideForCrewLimited: true },
    ]
  },
  {
    title: "Documents",
    hideForRoles: ['crew', 'captain', 'admin'],
    items: [
      { href: "/dashboard/documents", label: "Generator", icon: FileText, disabled: false, requiredRole: "vessel" },
    ]
  },
  {
    title: "Crew Management",
    hideForRoles: ['crew'], // Hide entire section for crew members
    items: [
      { href: "/dashboard/vessels", label: "My Vessels", icon: Ship, disabled: false, hideForRoles: ['vessel'] }, // Hide for vessel role
      { href: "/dashboard/crew", label: "Crew", icon: Users, requiredRole: "vessel", disabled: false, hideForRoles: ['captain'] },
      { href: "/dashboard/crew-roles", label: "Assign Roles", icon: UserCog, requiredRole: "vessel", disabled: true, hideForRoles: ['captain'] }, // Disabled for now – re-enable when ready
      { href: "/dashboard/requests", label: "Requests", icon: ClipboardList, requiredRole: "captain", disabled: false }, // Captains can view their requests
      { href: "/dashboard/sign-offs", label: "Sign-Offs", icon: FileSignature, requiredRole: "captain", disabled: false }, // Linked captains review/sign vessel-routed testimonials in-app
      { href: "/dashboard/watch-schedule", label: "Watch Schedule", icon: Clock, requiredRole: "vessel", disabled: false, hideForRoles: ['captain'] },
      { href: "/dashboard/crew-rotation", label: "Onboard Tracker", icon: RefreshCw, requiredRole: "vessel", disabled: false, hideForRoles: ['captain'] },
    ]
  },
  {
    title: "Messages",
    hideForRoles: ['admin'], // Hide for admin since Inbox is already in Crew Management section
    items: [
      { href: "/dashboard/inbox", label: "Inbox", icon: Inbox, disabled: false }, // Available to all users
    ]
  },
  {
    title: "Account",
    items: [
      { href: "/dashboard/profile", label: "Profile", icon: User, disabled: false, hideForRoles: ['vessel'] }, // Hide Profile for vessel role
      { href: "/dashboard/profile", label: "Vessel", icon: Ship, disabled: false, requiredRole: "vessel", hideForRoles: ['captain'] }, // Show Vessel page for vessel role only (not captain)
      { href: "/dashboard/vessel-roles", label: "Roles", icon: UserCog, requiredRole: "vessel", disabled: false, hideForRoles: ['captain'] }, // Premium+ feature: vessel-linked secondary accounts
      { href: "/dashboard/settings/signature", label: "Signature", icon: PenTool, requiredRole: "captain", disabled: false, hideForRoles: ['vessel'] }, // Captain only; hidden for vessel accounts
    ]
  },
  {
    title: "Subscriptions",
    hideForRoles: ['crew', 'vessel'],
    items: [
      { href: "/dashboard/revenue", label: "Revenue overview", icon: DollarSign, requiredRole: "admin", disabled: false },
      { href: "/dashboard/crew-subscriptions", label: "Crew subscriptions", icon: CreditCard, requiredRole: "admin", disabled: false },
      { href: "/dashboard/vessel-subscriptions", label: "Vessel subscriptions", icon: Ship, requiredRole: "admin", disabled: false },
      { href: "/dashboard/ad-revenue-tracking", label: "Ads tracking", icon: Megaphone, requiredRole: "admin", disabled: false },
    ]
  },
  {
    title: "Analytics",
    hideForRoles: ['crew', 'vessel'], // Hide entire section for crew members and vessel managers
    items: [
      { href: "/dashboard/platform-analytics", label: "Platform Overview", icon: BarChart3, requiredRole: "admin", disabled: false },
      { href: "/dashboard/crew-analytics", label: "Crew Analytics", icon: Users, requiredRole: "admin", disabled: false },
      { href: "/dashboard/login-activity", label: "Login Activity", icon: LogIn, requiredRole: "admin", disabled: false },
      { href: "/dashboard/pdf-coordinate-tool", label: "PDF coordinates", icon: Crosshair, requiredRole: "admin", disabled: false },
      { href: "/dashboard/admin-messages", label: "Admin messages", icon: MessagesSquare, requiredRole: "admin", disabled: false },
    ]
  },
  {
    title: "Support",
    items: [
      { href: "/dashboard/feedback", label: "Feedback", icon: MessageSquare, disabled: false },
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
  const [inboxCount, setInboxCount] = React.useState<number>(0)
  const [feedbackCount, setFeedbackCount] = React.useState<number>(0)
  const [requestsCount, setRequestsCount] = React.useState<number>(0)

  // Create admin-specific navGroups with updated Vessel Management and Account sections
  const isAdmin = userProfile?.role === 'admin'
  const adminNavGroups: typeof navGroups = navGroups.map(group => {
    if (group.title === "Crew Management") {
      return {
        ...group,
        items: [
          { href: "/dashboard/vessels", label: "Vessels", icon: Ship, disabled: false },
          { href: "/dashboard/crew", label: "Crew", icon: Users, disabled: false },
          { href: "/dashboard/inbox", label: "Inbox", icon: Inbox, disabled: false },
        ]
      }
    }
    if (group.title === "Account") {
      return {
        ...group,
        items: [
          { href: "/dashboard/profile", label: "Account", icon: User, disabled: false },
        ]
      }
    }
    return group
  })
  
  // Check if user has crew_limited tier (restricted access - only: Home, Current, Calendar, Profile, Feedback)
  const isCrewLimited = React.useMemo(() => {
    if (!userProfile) return false;
    const tier = (userProfile as any).subscription_tier || userProfile.subscriptionTier || 'free';
    const role = (userProfile as any).role || userProfile.role || 'crew';
    const entitled = hasActiveSubscriptionEntitlement(userProfile);

    // Only crew members can have crew_limited tier
    return role === 'crew' && tier === 'crew_limited' && entitled;
  }, [userProfile]);

  // Vessel-linked secondary accounts (created via /dashboard/vessel-roles by a
  // Pro/Fleet vessel manager). Parallel to crew_limited but with its own
  // allowed-hrefs whitelist. Captain-linked accounts have role='captain' so
  // they additionally see captain-only nav items (signature, requests).
  const isVesselLinked = React.useMemo(() => {
    if (!userProfile) return false;
    return isVesselLinkedAccount(userProfile) && hasActiveSubscriptionEntitlement(userProfile);
  }, [userProfile]);

  // Check if user has premium/pro subscription for visa tracker access
  const hasPremiumAccess = React.useMemo(() => {
    if (!userProfile) return false;
    const tier = (userProfile as any).subscription_tier || userProfile.subscriptionTier || 'free';
    const role = (userProfile as any).role || userProfile.role || 'crew';
    const entitled = hasActiveSubscriptionEntitlement(userProfile);

    // Vessel accounts: allow all active vessel tiers
    if (role === 'vessel') {
      const tierLower = tier.toLowerCase();
      return (
        (tierLower.startsWith('vessel_') ||
          tierLower === 'vessel_lite' ||
          tierLower === 'vessel_basic' ||
          tierLower === 'vessel_pro' ||
          tierLower === 'vessel_fleet') &&
        entitled
      );
    }

    // Crew accounts: premium, pro, or professional (but not crew_limited)
    return (tier === 'premium' || tier === 'pro' || tier === 'professional') && entitled;
  }, [userProfile]);

  /** Passage log: Premium+ crew (not crew_limited), vessel tiers, admin */
  const hasPassageLogAccess = React.useMemo(() => {
    if (!userProfile) return false;
    const tier = ((userProfile as any).subscription_tier || userProfile.subscriptionTier || 'free').toLowerCase();
    const role = (userProfile as any).role || userProfile.role || 'crew';
    const entitled = hasActiveSubscriptionEntitlement(userProfile);

    if (role === 'admin') return true;

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

    if (isCrewLimited) return false;

    const passageCrewTiers = ['premium', 'pro', 'professional'];
    return passageCrewTiers.includes(tier) && entitled;
  }, [userProfile, isCrewLimited]);

  /** Vessel Premium+ features: roles, watch schedule, onboard tracker */
  const hasVesselPremiumPlus = React.useMemo(() => {
    if (!userProfile) return false;
    return hasVesselPremiumPlusFeatures(userProfile);
  }, [userProfile]);

  const hasAisHistoryImportAccess = React.useMemo(() => {
    if (!userProfile) return false;
    return hasAisHistoryImportTier(userProfile);
  }, [userProfile]);

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
  
  // Use admin navGroups for admin, regular navGroups for others
  const displayNavGroups = isAdmin ? adminNavGroups : navGroups
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
          }
          
          setInboxCount((testimonialCount || 0) + seaTimeCount + captaincyCount);
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

  return (
    <TooltipProvider delayDuration={300}>
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
        {displayNavGroups.map((group) => {
          // Hide entire group if user role matches hideForRoles
          const userRole = userProfile?.role?.toLowerCase() || '';
          
          if (group.hideForRoles && userProfile?.role) {
            // Check if user role is in the hideForRoles array
            const shouldHide = group.hideForRoles.some(role => {
              const roleLower = role.toLowerCase();
              // Handle crew role - if hideForRoles includes 'crew', hide for all crew members
              if (roleLower === 'crew' && (userRole === 'crew' || userRole === 'captain')) {
                return true;
              }
              return userRole === roleLower;
            });
            if (shouldHide) {
              return null;
            }
          }

          // For vessel accounts, show "Vessel Management" as the Account section heading (where the Vessel link lives)
          const groupLabel = (group.title === "Account" && userProfile?.role === "vessel") ? "Vessel Management" : group.title;
          return (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel className="text-blue-300/40">
              {groupLabel}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  if ('requiredRole' in item && item.requiredRole) {
                    // Show item if user has the required role or is admin
                    // Also allow captains to access items that require 'captain' or 'vessel' role
                    const userRole = userProfile?.role;
                    if (!userRole) return null;
                    
                    // Admin can access everything - check this first
                    const isAdmin = userRole === 'admin';
                    if (isAdmin) {
                      // Admin has access - continue
                    } else if (item.requiredRole === 'vessel') {
                      // Vessel-required items: captains and vessel roles can access
                      if (userRole !== 'vessel' && userRole !== 'captain') {
                        return null;
                      }
                    } else if (item.requiredRole === 'captain') {
                      // Captain-required items: captains and vessel roles can access
                      if (userRole !== 'captain' && userRole !== 'vessel') {
                        return null;
                      }
                    } else if (item.requiredRole === 'admin') {
                      // Only admins can access admin-required items (userRole is not admin here since isAdmin is false)
                      return null;
                    } else {
                      // For any other required roles (shouldn't happen given our type, but handle it)
                      // Only show if user has that exact role
                      const requiredRole = item.requiredRole;
                      if (userRole !== requiredRole) {
                        return null;
                      }
                    }
                  }
                  
                  // Hide individual item if it's in hideForRoles
                  if ('hideForRoles' in item && item.hideForRoles && userProfile?.role && item.hideForRoles.includes(userProfile.role as 'vessel' | 'admin' | 'captain')) {
                    return null
                  }
                  
                  if ('disabled' in item && item.disabled) {
                    return null
                  }

                  if ('crewLimitedOnly' in item && item.crewLimitedOnly && !isCrewLimited) {
                    return null
                  }
                  if ('hideForCrewLimited' in item && item.hideForCrewLimited && isCrewLimited) {
                    return null
                  }

                  // For crew_limited tier, only show: Home, Current, Calendar, Profile, Feedback, Inbox, Documents (vessel-documents)
                  if (isCrewLimited) {
                    const allowedHrefs = [
                      '/dashboard', 
                      '/dashboard/current', 
                      '/dashboard/calendar', 
                      '/dashboard/profile',
                      '/dashboard/feedback',
                      '/dashboard/inbox',
                      '/dashboard/vessel-documents',
                    ];
                    if (!allowedHrefs.includes(item.href)) {
                      return null;
                    }
                  }

                  // For vessel_linked tier (Captain/Officer/Engineer/Manager
                  // secondary accounts owned by a vessel): a flat allowed
                  // list scoped to what these accounts actually need —
                  // viewing the vessel's state, completing assigned tasks,
                  // and managing their own profile. Personal-portfolio
                  // pages (export, certificates, proof-of-service) are
                  // intentionally excluded because linked accounts don't
                  // own portable sea-time history. Captain-linked accounts
                  // additionally see captain-only items (signature,
                  // requests, sign-offs) because their users.role =
                  // 'captain' matches the `requiredRole` checks already
                  // applied above.
                  if (isVesselLinked) {
                    const allowedHrefs = [
                      '/dashboard',
                      '/dashboard/current',
                      '/dashboard/calendar',
                      '/dashboard/profile',
                      '/dashboard/applications',
                      '/dashboard/vessel-documents',
                      '/dashboard/inbox',
                      '/dashboard/feedback',
                      // Captain-only items (already gated by requiredRole):
                      '/dashboard/settings/signature',
                      '/dashboard/requests',
                      '/dashboard/sign-offs',
                    ];
                    if (!allowedHrefs.includes(item.href)) {
                      return null;
                    }
                  }

                  // Check if feature requires premium access (visa tracker, bridge watch, export, request sea time, certificates)
                  // Passage log uses hasPassageLogAccess (Premium+ crew, vessel tiers)
                  // Note: Applications page is accessible to all users (testimonials are free), but Nav Watch/OOW are premium-only
                  // Note: Export is accessible to crew_limited users, so we exclude it from premium requirement for them
                  const isVisaTracker = item.href === '/dashboard/visa-tracker';
                  const isPassageLog = item.href === '/dashboard/passage-logbook';
                  const isBridgeWatch = item.href === '/dashboard/bridge-watch-log';
                  const isExport = item.href === '/dashboard/export';
                  const isSeaTimeRequest = item.href === '/dashboard/sea-time-request';
                  const isCertificates = item.href === '/dashboard/certificates';
                  const isAisImport = item.href === '/dashboard/ais-import';
                  // vessel_linked accounts never reach this branch for the
                  // hrefs filtered out above (export, certificates,
                  // proof-of-service). For the items they *can* see we still
                  // keep the `!isVesselLinked` guard so no item is
                  // mistakenly marked premium-locked — their feature surface
                  // comes from the vessel's Pro/Fleet plan, not personal billing.
                  const requiresPremium =
                    (isVisaTracker || isBridgeWatch || isSeaTimeRequest || isCertificates || (isExport && !isCrewLimited)) &&
                    !hasPremiumAccess &&
                    !isCrewLimited &&
                    !isVesselLinked;
                  const passageNavLocked = isPassageLog && !hasPassageLogAccess && !isCrewLimited && !isVesselLinked;
                  const aisImportNavLocked =
                    isAisImport && !hasAisHistoryImportAccess && !isCrewLimited && !isVesselLinked;
                  const vesselPremiumNavLocked =
                    VESSEL_PREMIUM_PLUS_NAV.has(item.href) &&
                    userProfile?.role === 'vessel' &&
                    !hasVesselPremiumPlus;
                  
                  // Hide bridge watch log for non-officers
                  if (isBridgeWatch && !isOfficer) {
                    return null;
                  }

                  const isActive = pathname === item.href
                  
                  // Use a combination of href and label for unique keys (since two items can have the same href)
                  const uniqueKey = `${item.href}-${item.label}`
                  
                  // Check if this is the inbox item and show count badge
                  const isInbox = item.href === '/dashboard/inbox';
                  // Check if this is the feedback item and show count badge
                  const isFeedback = item.href === '/dashboard/feedback';
                  // Check if this is the requests item - only show if there are active requests
                  const isRequests = item.href === '/dashboard/requests';
                  
                  // Always show inbox link (don't hide even if count is 0)
                  // Hide requests link if no active requests
                  if (isRequests && requestsCount === 0) {
                    return null;
                  }
                  
                  return (
                    <SidebarMenuItem key={uniqueKey}>
                      {requiresPremium || passageNavLocked || aisImportNavLocked || vesselPremiumNavLocked ? (
                        <Tooltip delayDuration={200}>
                          <TooltipTrigger asChild>
                            <div className="w-full">
                              <SidebarMenuButton 
                                disabled
                                className="group/button w-full"
                              >
                                <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center w-full">
                                  <item.icon className="h-4 w-4 shrink-0" />
                                  <span className="group-data-[collapsible=icon]:hidden flex-1">{item.label}</span>
                                  <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400 group-data-[collapsible=icon]:hidden ml-auto shrink-0" />
                                </div>
                              </SidebarMenuButton>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs z-[100]" sideOffset={8} align="start">
                            <div className="space-y-1">
                              <p className="font-semibold">{item.label}</p>
                              <p className="text-xs text-muted-foreground">
                                {passageNavLocked
                                  ? 'Passage Log is available on Crew Premium and Professional plans, or with an active vessel subscription.'
                                  : vesselPremiumNavLocked
                                    ? 'Available on Vessel Premium and Professional plans. Upgrade to unlock watch schedules, onboard tracker, linked roles, and Form Builder.'
                                    : 'This feature requires a Premium or Pro subscription. Upgrade to unlock advanced features.'}
                              </p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <SidebarMenuButton tooltip={item.label} asChild isActive={isActive}>
                          <Link href={item.href} className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
                            <item.icon />
                            <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                          {isInbox && inboxCount > 0 && (
                            <Badge 
                              variant="destructive" 
                              className="ml-auto h-5 min-w-5 px-1.5 flex items-center justify-center text-xs font-semibold group-data-[collapsible=icon]:hidden"
                            >
                              {inboxCount > 99 ? '99+' : inboxCount}
                            </Badge>
                          )}
                          {isRequests && requestsCount > 0 && (
                            <Badge 
                              variant="destructive" 
                              className="ml-auto h-5 min-w-5 px-1.5 flex items-center justify-center text-xs font-semibold group-data-[collapsible=icon]:hidden"
                            >
                              {requestsCount > 99 ? '99+' : requestsCount}
                            </Badge>
                          )}
                          {isFeedback && feedbackCount > 0 && (
                            <Badge 
                              variant="destructive" 
                              className="ml-auto h-5 min-w-5 px-1.5 flex items-center justify-center text-xs font-semibold group-data-[collapsible=icon]:hidden"
                            >
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
                <DropdownMenuItem onClick={() => router.push("/dashboard/subscription")}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Subscription
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
    </TooltipProvider>
  )
}
