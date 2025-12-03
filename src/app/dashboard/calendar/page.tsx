'use client';

import { useState, useMemo, useEffect } from 'react';
import { format, startOfYear, endOfYear, eachMonthOfInterval, startOfMonth, endOfMonth, eachDayOfInterval, getDaysInMonth, getDay, isSameMonth, isToday, isWithinInterval, startOfDay, endOfDay, isAfter } from 'date-fns';
import { Calendar as CalendarIcon, Waves, Anchor, Building, Briefcase, Ship, ChevronLeft, ChevronRight, Loader2, MousePointer2, BoxSelect } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useUser, useSupabase } from '@/supabase';
import { useCollection, useDoc } from '@/supabase/database';
import { getVesselStateLogs, updateStateLogsBatch } from '@/supabase/database/queries';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile, Vessel, StateLog, DailyStatus } from '@/lib/types';

const vesselStates: { value: DailyStatus; label: string; color: string; icon: React.FC<any> }[] = [
  { value: 'underway', label: 'Underway', color: 'hsl(var(--chart-blue))', icon: Waves },
  { value: 'at-anchor', label: 'At Anchor', color: 'hsl(var(--chart-orange))', icon: Anchor },
  { value: 'in-port', label: 'In Port', color: 'hsl(var(--chart-green))', icon: Building },
  { value: 'on-leave', label: 'On Leave', color: 'hsl(var(--chart-gray))', icon: Briefcase },
  { value: 'in-yard', label: 'In Yard', color: 'hsl(var(--chart-red))', icon: Ship },
];

export default function CalendarPage() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedState, setSelectedState] = useState<DailyStatus | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [stateLogs, setStateLogs] = useState<StateLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'single' | 'range'>('single');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const { user } = useUser();
  const { supabase } = useSupabase();
  const { toast } = useToast();

  // Fetch user profile to get active vessel
  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);
  
  // Transform user profile to handle both snake_case (from DB) and camelCase (from types)
  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    
    const activeVesselId = (userProfileRaw as any).active_vessel_id || (userProfileRaw as any).activeVesselId;
    
    return {
      ...userProfileRaw,
      id: userProfileRaw.id,
      email: (userProfileRaw as any).email || '',
      username: (userProfileRaw as any).username || '',
      activeVesselId: activeVesselId || undefined,
      firstName: (userProfileRaw as any).first_name || (userProfileRaw as any).firstName,
      lastName: (userProfileRaw as any).last_name || (userProfileRaw as any).lastName,
      profilePicture: (userProfileRaw as any).profile_picture || (userProfileRaw as any).profilePicture,
      bio: (userProfileRaw as any).bio,
      registrationDate: (userProfileRaw as any).registration_date || (userProfileRaw as any).registrationDate,
      role: (userProfileRaw as any).role || 'crew',
      subscriptionTier: (userProfileRaw as any).subscription_tier || (userProfileRaw as any).subscriptionTier || 'free',
      subscriptionStatus: (userProfileRaw as any).subscription_status || (userProfileRaw as any).subscriptionStatus || 'inactive',
    } as UserProfile;
  }, [userProfileRaw]);

  // Query all vessels
  const { data: vessels, isLoading: isLoadingVessels } = useCollection<Vessel>(
    user?.id ? 'vessels' : null,
    user?.id ? { orderBy: 'created_at', ascending: false } : undefined
  );

  const currentVessel = useMemo(() => {
    if (!userProfile || !vessels || vessels.length === 0) return undefined;
    const activeVesselId = userProfile.activeVesselId;
    return vessels.find(v => v.id === activeVesselId);
  }, [vessels, userProfile]);

  // Fetch state logs
  useEffect(() => {
    if (!currentVessel || !user?.id) {
      setStateLogs([]);
      setIsLoadingLogs(false);
      return;
    }

    setIsLoadingLogs(true);
    getVesselStateLogs(supabase, currentVessel.id, user.id)
      .then((logs) => {
        setStateLogs(logs);
        setIsLoadingLogs(false);
      })
      .catch((error) => {
        console.error('Error fetching state logs:', error);
        setStateLogs([]);
        setIsLoadingLogs(false);
      });
  }, [currentVessel?.id, user?.id, supabase]);

  // Create a map of date to state for quick lookup
  const stateLogMap = useMemo(() => {
    const map = new Map<string, DailyStatus>();
    stateLogs.forEach(log => {
      map.set(log.date, log.state);
    });
    return map;
  }, [stateLogs]);

  // Get all months for the selected year
  const yearStart = startOfYear(new Date(selectedYear, 0, 1));
  const yearEnd = endOfYear(new Date(selectedYear, 11, 31));
  const months = eachMonthOfInterval({ start: yearStart, end: yearEnd });
  
  // Get current year for navigation restrictions
  const currentYear = new Date().getFullYear();
  const isCurrentYear = selectedYear >= currentYear;

  const handleDateClick = (date: Date) => {
    if (!currentVessel) {
      toast({
        title: 'No Active Vessel',
        description: 'Please set an active vessel first.',
        variant: 'destructive',
      });
      return;
    }
    
    // Check if date is in the future
    const today = startOfDay(new Date());
    const clickedDate = startOfDay(date);
    
    if (isAfter(clickedDate, today)) {
      toast({
        title: 'Future Date',
        description: 'You cannot update future dates.',
        variant: 'destructive',
      });
      return;
    }
    
    if (selectionMode === 'single') {
      // Single date selection
      setSelectedDate(date);
      const dateKey = format(date, 'yyyy-MM-dd');
      const existingState = stateLogMap.get(dateKey);
      setSelectedState(existingState || null);
      setDateRange(undefined);
      setIsDialogOpen(true);
    } else {
      // Range selection mode
      if (!dateRange?.from || (dateRange.from && dateRange.to)) {
        // Start new range - check if date is in future
        const today = startOfDay(new Date());
        const clickedDate = startOfDay(date);
        
        if (isAfter(clickedDate, today)) {
          toast({
            title: 'Future Date',
            description: 'You cannot start a range with a future date.',
            variant: 'destructive',
          });
          return;
        }
        
        // Start new range
        setDateRange({ from: date, to: undefined });
      } else if (dateRange.from && !dateRange.to) {
        // Check if clicking the same date (cancel range selection)
        if (format(date, 'yyyy-MM-dd') === format(dateRange.from, 'yyyy-MM-dd')) {
          setDateRange(undefined);
          return;
        }
        
        // Complete the range
        const from = dateRange.from;
        const to = date;
        
        // Ensure from is before to
        let start = from < to ? from : to;
        let end = from < to ? to : from;
        
        // Restrict end date to today if it's in the future
        const today = startOfDay(new Date());
        if (isAfter(end, today)) {
          end = today;
          toast({
            title: 'Range Adjusted',
            description: 'The range end date has been adjusted to today. You cannot select future dates.',
            variant: 'default',
          });
        }
        
        // Restrict start date to today if it's in the future (shouldn't happen, but just in case)
        if (isAfter(start, today)) {
          start = today;
        }
        
        setDateRange({ from: start, to: end });
        setSelectedDate(null);
        setSelectedState(null);
        setIsDialogOpen(true);
      }
    }
  };

  const handleStateChange = async (state: DailyStatus) => {
    if (!currentVessel || !user?.id) return;

    setIsSaving(true);

    try {
      let logs: Array<{ date: string; state: DailyStatus }> = [];
      
      if (dateRange?.from && dateRange?.to) {
        // Range update
        const today = startOfDay(new Date());
        const interval = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
        logs = interval
          .filter(day => !isAfter(startOfDay(day), today)) // Filter out future dates
          .map(day => ({
            date: format(day, 'yyyy-MM-dd'),
            state: state,
          }));
        
        if (logs.length === 0) {
          toast({
            title: 'Invalid Range',
            description: 'No valid dates selected. All dates in the range are in the future.',
            variant: 'destructive',
          });
          setIsSaving(false);
          return;
        }
      } else if (selectedDate) {
        // Single date update
        const dateKey = format(selectedDate, 'yyyy-MM-dd');
        logs = [{ date: dateKey, state }];
      } else {
        setIsSaving(false);
        return;
      }

      await updateStateLogsBatch(supabase, user.id, currentVessel.id, logs);
      
      // Refresh state logs
      const updatedLogs = await getVesselStateLogs(supabase, currentVessel.id, user.id);
      setStateLogs(updatedLogs);
      
      setIsDialogOpen(false);
      setDateRange(undefined);
      setSelectedDate(null);
      
      const stateLabel = vesselStates.find(s => s.value === state)?.label || state;
      
      if (dateRange?.from && dateRange?.to) {
        const daysCount = logs.length;
        toast({
          title: 'States Updated',
          description: `${daysCount} day${daysCount > 1 ? 's' : ''} (${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d, yyyy')}) updated to ${stateLabel}.`,
        });
      } else {
        toast({
          title: 'State Updated',
          description: `${format(selectedDate!, 'MMM d, yyyy')} has been updated to ${stateLabel}.`,
        });
      }
    } catch (error) {
      console.error('Error updating state:', error);
      toast({
        title: 'Error',
        description: 'Failed to update state.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderMonth = (month: Date) => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const firstDayOfMonth = getDay(monthStart);
    const daysInMonth = getDaysInMonth(month);
    
    // Generate calendar grid - start from Sunday
    const days: (Date | null)[] = [];
    
    // Add empty cells for days before month starts
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null);
    }
    
    // Add all days in the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(month.getFullYear(), month.getMonth(), i));
    }

    return (
      <Card key={month.toISOString()} className="rounded-xl border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold">
            {format(month, 'MMMM yyyy')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
                  {day}
                </div>
              ))}
            </div>
            
            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, idx) => {
                if (!day) {
                  return <div key={`empty-${idx}`} className="aspect-square" />;
                }
                
                const dateKey = format(day, 'yyyy-MM-dd');
                const state = stateLogMap.get(dateKey);
                const stateInfo = state ? vesselStates.find(s => s.value === state) : null;
                const isCurrentDay = isToday(day);
                const isCurrentMonth = isSameMonth(day, month);
                
                // Check if date is in selected range
                let isInRange = false;
                let isRangeStart = false;
                let isRangeEnd = false;
                if (dateRange?.from && dateRange?.to) {
                  const dayStart = startOfDay(day);
                  const rangeStart = startOfDay(dateRange.from);
                  const rangeEnd = endOfDay(dateRange.to);
                  
                  isInRange = isWithinInterval(dayStart, { start: rangeStart, end: rangeEnd });
                  isRangeStart = format(dayStart, 'yyyy-MM-dd') === format(rangeStart, 'yyyy-MM-dd');
                  isRangeEnd = format(dayStart, 'yyyy-MM-dd') === format(rangeEnd, 'yyyy-MM-dd');
                } else if (dateRange?.from && !dateRange?.to) {
                  // Only start is selected
                  isRangeStart = format(day, 'yyyy-MM-dd') === format(dateRange.from, 'yyyy-MM-dd');
                }
                
                // Check if date is in the future
                const today = startOfDay(new Date());
                const dayStart = startOfDay(day);
                const isFuture = isAfter(dayStart, today);

                return (
                  <button
                    key={dateKey}
                    onClick={() => handleDateClick(day)}
                    disabled={isFuture}
                    className={cn(
                      "aspect-square rounded-xl text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                      !isFuture && "hover:scale-105 hover:shadow-md",
                      !isCurrentMonth && "opacity-40",
                      isFuture && "opacity-30 cursor-not-allowed",
                      isCurrentDay && !isInRange && "ring-2 ring-primary ring-offset-2",
                      isInRange && "ring-2 ring-primary/50",
                      (isRangeStart || isRangeEnd) && "ring-2 ring-primary ring-offset-1",
                      stateInfo 
                        ? "text-white" 
                        : "bg-muted/50 text-muted-foreground hover:bg-muted"
                    )}
                    style={stateInfo ? { backgroundColor: stateInfo.color } : isInRange ? { backgroundColor: 'hsl(var(--primary) / 0.15)' } : undefined}
                    title={isFuture ? 'Cannot update future dates' : (stateInfo ? `${format(day, 'MMM d, yyyy')}: ${stateInfo.label}` : format(day, 'MMM d, yyyy'))}
                  >
                    <div className="flex flex-col items-center justify-center h-full">
                      <span>{format(day, 'd')}</span>
                      {stateInfo && (
                        <stateInfo.icon className="h-2 w-2 mt-0.5 opacity-90" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const isLoading = isLoadingProfile || isLoadingVessels || isLoadingLogs;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
              <p className="text-muted-foreground">
                View and manage your vessel states throughout the year.
              </p>
            </div>
          </div>
          <Separator />
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!currentVessel) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
              <p className="text-muted-foreground">
                View and manage your vessel states throughout the year.
              </p>
            </div>
          </div>
          <Separator />
        </div>
        <Card className="rounded-xl border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CalendarIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Active Vessel</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              You need to have an active vessel to view and manage your calendar. Please set an active vessel first.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
              <p className="text-muted-foreground">
                View and manage your vessel states throughout the year. Click on any date to change its state, or use range mode to select multiple dates at once.
              </p>
          </div>
        </div>
        <Separator />
      </div>

      {/* Year Navigation and Mode Toggle */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-xl border">
          <CardContent className="flex items-center justify-between py-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSelectedYear(selectedYear - 1)}
              className="rounded-xl"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <h2 className="text-2xl font-bold">{selectedYear}</h2>
              <p className="text-sm text-muted-foreground">{currentVessel.name}</p>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSelectedYear(selectedYear + 1)}
              disabled={isCurrentYear}
              className="rounded-xl"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
        
        <Card className="rounded-xl border">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Selection Mode</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button
                variant={selectionMode === 'single' ? 'default' : 'outline'}
                onClick={() => {
                  setSelectionMode('single');
                  setDateRange(undefined);
                  setSelectedDate(null);
                }}
                className="rounded-xl flex-1"
              >
                <MousePointer2 className="mr-2 h-4 w-4" />
                Single Date
              </Button>
              <Button
                variant={selectionMode === 'range' ? 'default' : 'outline'}
                onClick={() => {
                  setSelectionMode('range');
                  setSelectedDate(null);
                  setDateRange(undefined);
                }}
                className="rounded-xl flex-1"
              >
                <BoxSelect className="mr-2 h-4 w-4" />
                Date Range
              </Button>
            </div>
            {selectionMode === 'range' && (
              <div className="mt-3 space-y-1">
                <p className="text-xs text-muted-foreground">
                  Click a date to start the range, then click another date to complete it.
                </p>
                {dateRange?.from && !dateRange?.to && (
                  <p className="text-xs text-primary font-medium">
                    Range started: {format(dateRange.from, 'MMM d, yyyy')}. Click another date to complete.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Legend */}
      <Card className="rounded-xl border">
        <CardHeader>
          <CardTitle className="text-sm font-medium">State Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {vesselStates.map((state) => {
              const StateIcon = state.icon;
              return (
                <div key={state.value} className="flex items-center gap-2">
                  <div
                    className="h-8 w-8 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: state.color }}
                  >
                    <StateIcon className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-sm font-medium">{state.label}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Calendar Grid - 3 columns on large screens, 2 on medium, 1 on small */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {months.map(renderMonth)}
      </div>

      {/* State Change Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) {
          // Reset selection when dialog closes
          if (selectionMode === 'range') {
            setDateRange(undefined);
          } else {
            setSelectedDate(null);
          }
        }
      }}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>
              {dateRange?.from && dateRange?.to
                ? `Change State for ${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d, yyyy')}`
                : selectedDate
                ? `Change State for ${format(selectedDate, 'MMMM d, yyyy')}`
                : 'Change State'}
            </DialogTitle>
            {dateRange?.from && dateRange?.to && (
              <p className="text-sm text-muted-foreground mt-1">
                {eachDayOfInterval({ start: dateRange.from, end: dateRange.to }).length} day{eachDayOfInterval({ start: dateRange.from, end: dateRange.to }).length > 1 ? 's' : ''} selected
              </p>
            )}
          </DialogHeader>
          <div className="py-4">
            <RadioGroup
              value={selectedState || undefined}
              onValueChange={(value) => setSelectedState(value as DailyStatus)}
              className="space-y-3"
            >
              {vesselStates.map((state) => {
                const StateIcon = state.icon;
                return (
                  <div key={state.value} className="flex items-center space-x-3">
                    <RadioGroupItem value={state.value} id={state.value} />
                    <Label
                      htmlFor={state.value}
                      className="flex items-center gap-3 flex-1 cursor-pointer py-2 px-3 rounded-lg hover:bg-accent transition-colors"
                    >
                      <div
                        className="h-8 w-8 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: state.color }}
                      >
                        <StateIcon className="h-4 w-4 text-white" />
                      </div>
                      <span className="font-medium">{state.label}</span>
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false);
                if (selectionMode === 'range') {
                  setDateRange(undefined);
                } else {
                  setSelectedDate(null);
                }
              }}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={() => selectedState && handleStateChange(selectedState)}
              disabled={!selectedState || isSaving}
              className="rounded-xl"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

