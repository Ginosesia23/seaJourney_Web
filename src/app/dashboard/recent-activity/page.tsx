'use client';

import { useState, useMemo, useEffect } from 'react';
import { format, subDays, startOfDay } from 'date-fns';
import { 
  Ship, 
  LifeBuoy, 
  Anchor, 
  Loader2, 
  Waves, 
  Building, 
  History, 
  CheckCircle2, 
  XCircle,
  Calendar as CalendarIcon,
  Filter,
  Activity,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useUser, useSupabase } from '@/supabase';
import { useCollection, useDoc } from '@/supabase/database';
import { getVesselStateLogs } from '@/supabase/database/queries';
import type { Vessel, StateLog, UserProfile, DailyStatus, Testimonial } from '@/lib/types';

const vesselStates: { value: DailyStatus; label: string; color: string, icon: React.FC<any> }[] = [
  { value: 'underway', label: 'Underway', color: 'hsl(var(--chart-blue))', icon: Waves },
  { value: 'at-anchor', label: 'At Anchor', color: 'hsl(var(--chart-orange))', icon: Anchor },
  { value: 'in-port', label: 'In Port', color: 'hsl(var(--chart-green))', icon: Building },
  { value: 'on-leave', label: 'On Leave', color: 'hsl(var(--chart-gray))', icon: LifeBuoy },
  { value: 'in-yard', label: 'In Yard', color: 'hsl(var(--chart-red))', icon: Ship },
];

type ActivityType = 'all' | 'state_log' | 'testimonial_approved' | 'testimonial_rejected' | 'state_change';
type TimeRange = '7' | '30' | '90' | '365' | 'all';

interface ActivityItem {
  id: string;
  type: 'state_log' | 'testimonial_approved' | 'testimonial_rejected' | 'state_change';
  date: string;
  timestamp: number;
  vesselName?: string;
  vesselType?: string;
  vesselId?: string;
  state?: DailyStatus;
  testimonial?: Testimonial;
}

export default function RecentActivityPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  
  const [timeRange, setTimeRange] = useState<TimeRange>('30');
  const [activityType, setActivityType] = useState<ActivityType>('all');
  const [allStateLogs, setAllStateLogs] = useState<Map<string, StateLog[]>>(new Map());
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // Fetch user profile
  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);
  
  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    const activeVesselId = (userProfileRaw as any).active_vessel_id || (userProfileRaw as any).activeVesselId;
    return {
      ...userProfileRaw,
      activeVesselId: activeVesselId || undefined,
    } as UserProfile;
  }, [userProfileRaw]);

  // Query all vessels
  const { data: vessels, isLoading: isLoadingVessels } = useCollection<Vessel>(
    user?.id ? 'vessels' : null,
    user?.id ? { orderBy: 'created_at', ascending: false } : undefined
  );

  // Fetch state logs for all vessels
  useEffect(() => {
    if (vessels && user?.id) {
      const fetchLogs = async () => {
        const logsMap = new Map<string, StateLog[]>();
        await Promise.all(vessels.map(async (vessel) => {
          const logs = await getVesselStateLogs(supabase, vessel.id, user.id);
          logsMap.set(vessel.id, logs);
        }));
        setAllStateLogs(logsMap);
        setIsLoading(false);
      };
      fetchLogs();
    } else if (!vessels) {
      setIsLoading(false);
    }
  }, [vessels, user?.id, supabase]);

  // Fetch testimonials
  useEffect(() => {
    if (!user?.id) return;

    const fetchTestimonials = async () => {
      try {
        const { data, error } = await supabase
          .from('testimonials')
          .select('*')
          .eq('user_id', user.id)
          .in('status', ['approved', 'rejected'])
          .order('updated_at', { ascending: false });

        if (error) {
          console.error('Error fetching testimonials:', error);
          setTestimonials([]);
        } else {
          setTestimonials((data || []) as Testimonial[]);
        }
      } catch (error) {
        console.error('Error fetching testimonials:', error);
        setTestimonials([]);
      }
    };

    fetchTestimonials();
  }, [user?.id, supabase]);

  // Calculate all activities
  const allActivities = useMemo(() => {
    const activities: ActivityItem[] = [];
    
    if (!vessels) return [];
    
    const daysAgo = timeRange === 'all' 
      ? new Date(0).getTime() 
      : subDays(new Date(), parseInt(timeRange)).getTime();
    
    // 1. Collect state logs and state changes
    if (allStateLogs) {
      allStateLogs.forEach((logs, vesselId) => {
        const vessel = vessels.find(v => v.id === vesselId);
        logs.forEach(log => {
          const logDate = new Date(log.date);
          const logTimestamp = log.updatedAt 
            ? new Date(log.updatedAt).getTime()
            : logDate.getTime();
          
          if (logTimestamp >= daysAgo) {
            const isStateChange = log.updatedAt && 
              Math.abs(new Date(log.updatedAt).getTime() - logDate.getTime()) > 60000;
            
            activities.push({
              id: log.id || `${log.date}-${vesselId}`,
              type: isStateChange ? 'state_change' : 'state_log',
              date: format(isStateChange && log.updatedAt ? new Date(log.updatedAt) : logDate, 'yyyy-MM-dd'),
              timestamp: logTimestamp,
              vesselName: vessel?.name || 'Unknown Vessel',
              vesselType: vessel?.type,
              vesselId: log.vesselId,
              state: log.state,
            });
          }
        });
      });
    }
    
    // 2. Add testimonial approvals/rejections
    testimonials.forEach(testimonial => {
      const timestampDate = testimonial.signoff_used_at 
        ? new Date(testimonial.signoff_used_at)
        : testimonial.updated_at 
        ? new Date(testimonial.updated_at)
        : null;
      
      if (timestampDate && 
          timestampDate.getTime() >= daysAgo &&
          (testimonial.status === 'approved' || testimonial.status === 'rejected')) {
        const vessel = vessels.find(v => v.id === testimonial.vessel_id);
        activities.push({
          id: `testimonial-${testimonial.id}`,
          type: testimonial.status === 'approved' ? 'testimonial_approved' : 'testimonial_rejected',
          date: format(timestampDate, 'yyyy-MM-dd'),
          timestamp: timestampDate.getTime(),
          vesselName: vessel?.name || 'Unknown Vessel',
          vesselType: vessel?.type,
          vesselId: testimonial.vessel_id,
          testimonial,
        });
      }
    });
    
    // Sort by timestamp (most recent first)
    return activities
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(activity => ({
        ...activity,
        date: activity.date || format(new Date(activity.timestamp), 'yyyy-MM-dd'),
      }));
  }, [allStateLogs, vessels, testimonials, timeRange]);

  // Filter activities by type
  const filteredActivities = useMemo(() => {
    if (activityType === 'all') return allActivities;
    return allActivities.filter(activity => activity.type === activityType);
  }, [allActivities, activityType]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [timeRange, activityType]);

  // Calculate pagination for activities (not date groups)
  const totalPages = Math.ceil(filteredActivities.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedActivities = filteredActivities.slice(startIndex, endIndex);

  // Group paginated activities by date
  const groupedActivities = useMemo(() => {
    const groups: Record<string, ActivityItem[]> = {};
    
    paginatedActivities.forEach(activity => {
      const dateKey = activity.date;
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(activity);
    });
    
    // Sort dates in descending order
    return Object.entries(groups).sort((a, b) => {
      return new Date(b[0]).getTime() - new Date(a[0]).getTime();
    });
  }, [paginatedActivities]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    // Scroll to top of the activities list
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isLoadingData = isLoading || isLoadingProfile || isLoadingVessels;

  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Recent Activity</h1>
            <p className="text-muted-foreground">
              View your complete activity history including sea time logs, state changes, and testimonial updates.
            </p>
          </div>
        </div>
        <Separator />
      </div>

      {/* Filters */}
      <Card className="rounded-xl border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-primary" />
            <CardTitle>Filters</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Time Range</label>
              <Select value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRange)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Select time range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="365">Last year</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Activity Type</label>
              <Select value={activityType} onValueChange={(value) => setActivityType(value as ActivityType)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Select activity type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Activities</SelectItem>
                  <SelectItem value="state_log">State Logs</SelectItem>
                  <SelectItem value="state_change">State Changes</SelectItem>
                  <SelectItem value="testimonial_approved">Approved Testimonials</SelectItem>
                  <SelectItem value="testimonial_rejected">Rejected Testimonials</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Items Per Page</label>
              <Select value={itemsPerPage.toString()} onValueChange={(value) => {
                setItemsPerPage(parseInt(value));
                setCurrentPage(1);
              }}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Items per page" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 per page</SelectItem>
                  <SelectItem value="20">20 per page</SelectItem>
                  <SelectItem value="50">50 per page</SelectItem>
                  <SelectItem value="100">100 per page</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activities List */}
      {isLoadingData ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card className="rounded-xl border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                <CardTitle>Activity Timeline</CardTitle>
              </div>
              <Badge variant="secondary">
                {filteredActivities.length} {filteredActivities.length === 1 ? 'activity' : 'activities'}
                {filteredActivities.length > itemsPerPage && (
                  <span className="ml-2">
                    (Page {currentPage} of {totalPages})
                  </span>
                )}
              </Badge>
            </div>
            <CardDescription>
              {timeRange === 'all' 
                ? 'Showing all activities' 
                : `Showing activities from the last ${timeRange} days`}
              {filteredActivities.length > 0 && (
                <span className="ml-2">
                  • Showing {startIndex + 1}-{Math.min(endIndex, filteredActivities.length)} of {filteredActivities.length} activities
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {groupedActivities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                  <History className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-muted-foreground mb-1">No activities found</p>
                <p className="text-xs text-muted-foreground">Try adjusting your filters or start logging your sea time</p>
              </div>
            ) : (
              <>
                <div className="space-y-8">
                  {groupedActivities.map(([dateKey, activities]) => {
                  const activityDate = new Date(dateKey);
                  const isToday = format(activityDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                  const isYesterday = format(activityDate, 'yyyy-MM-dd') === format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
                  
                  let dateLabel = '';
                  if (isToday) {
                    dateLabel = 'Today';
                  } else if (isYesterday) {
                    dateLabel = 'Yesterday';
                  } else {
                    dateLabel = format(activityDate, 'EEEE, MMMM d, yyyy');
                  }
                  
                  return (
                    <div key={dateKey} className="space-y-4">
                      {/* Date Header */}
                      <div className="flex items-center gap-3">
                        <Separator className="flex-1" />
                        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/50">
                          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-semibold">{dateLabel}</span>
                          <Badge variant="outline" className="ml-2">
                            {activities.length}
                          </Badge>
                        </div>
                        <Separator className="flex-1" />
                      </div>
                      
                      {/* Activities for this date */}
                      <div className="space-y-3 pl-4 border-l-2 border-muted">
                        {activities.map((activity) => {
                          // Handle testimonial activities
                          if (activity.type === 'testimonial_approved' || activity.type === 'testimonial_rejected') {
                            const isApproved = activity.type === 'testimonial_approved';
                            return (
                              <div 
                                key={activity.id}
                                className="flex items-center gap-3 p-4 rounded-xl border bg-background hover:bg-accent/50 transition-colors"
                              >
                                <div 
                                  className={`h-12 w-12 flex items-center justify-center flex-shrink-0 rounded-xl ${
                                    isApproved 
                                      ? 'bg-green-500/20' 
                                      : 'bg-red-500/20'
                                  }`}
                                >
                                  {isApproved ? (
                                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                                  ) : (
                                    <XCircle className="h-6 w-6 text-red-600" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="text-sm font-semibold truncate">{activity.vesselName}</p>
                                    {activity.vesselType && (
                                      <span className="text-xs text-muted-foreground truncate">• {activity.vesselType}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-sm font-medium ${isApproved ? 'text-green-600' : 'text-red-600'}`}>
                                      Testimonial {isApproved ? 'Approved' : 'Rejected'}
                                    </span>
                                    {activity.testimonial && (
                                      <>
                                        <span className="text-xs text-muted-foreground">•</span>
                                        <span className="text-xs text-muted-foreground">
                                          {format(new Date(activity.testimonial.start_date), 'MMM d')} - {format(new Date(activity.testimonial.end_date), 'MMM d, yyyy')}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <div 
                                  className={`h-3 w-3 rounded-full flex-shrink-0 ${
                                    isApproved ? 'bg-green-600' : 'bg-red-600'
                                  }`}
                                />
                              </div>
                            );
                          }
                          
                          // Handle state logs and state changes
                          const stateInfo = vesselStates.find(s => s.value === activity.state);
                          const StateIcon = stateInfo?.icon || Ship;
                          const isStateChange = activity.type === 'state_change';
                          
                          return (
                            <div 
                              key={activity.id}
                              className="flex items-center gap-3 p-4 rounded-xl border bg-background hover:bg-accent/50 transition-colors"
                            >
                              <div 
                                className="h-12 w-12 flex items-center justify-center flex-shrink-0 rounded-xl"
                                style={{ backgroundColor: `${stateInfo?.color || 'hsl(var(--muted-foreground))'}20` }}
                              >
                                <StateIcon 
                                  className="h-6 w-6" 
                                  style={{ color: stateInfo?.color || 'hsl(var(--muted-foreground))' }} 
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="text-sm font-semibold truncate">{activity.vesselName}</p>
                                  {activity.vesselType && (
                                    <span className="text-xs text-muted-foreground truncate">• {activity.vesselType}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium" style={{ color: stateInfo?.color || 'hsl(var(--muted-foreground))' }}>
                                    {isStateChange ? 'State Changed: ' : ''}{stateInfo?.label || activity.state}
                                  </span>
                                  {isStateChange && activity.state && (
                                    <Badge variant="outline" className="text-xs">
                                      Updated
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div 
                                className="h-3 w-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: stateInfo?.color || 'hsl(var(--muted-foreground))' }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="mt-8 flex items-center justify-between border-t pt-6">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-muted-foreground">
                        Showing {startIndex + 1} to {Math.min(endIndex, filteredActivities.length)} of {filteredActivities.length} activities
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="rounded-xl"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(page => {
                            // Show first page, last page, current page, and pages around current
                            return (
                              page === 1 ||
                              page === totalPages ||
                              (page >= currentPage - 1 && page <= currentPage + 1)
                            );
                          })
                          .map((page, index, array) => {
                            // Add ellipsis if there's a gap
                            const showEllipsisBefore = index > 0 && page - array[index - 1] > 1;
                            return (
                              <div key={page} className="flex items-center gap-1">
                                {showEllipsisBefore && (
                                  <span className="px-2 text-muted-foreground">...</span>
                                )}
                                <Button
                                  variant={currentPage === page ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => handlePageChange(page)}
                                  className="rounded-xl min-w-[40px]"
                                >
                                  {page}
                                </Button>
                              </div>
                            );
                          })}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="rounded-xl"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
