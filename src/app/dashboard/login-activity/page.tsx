'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Users, 
  LogIn,
  Clock,
  Loader2,
  Search,
  UserCheck,
  UserX,
  Calendar,
  Mail,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import type { UserProfile } from '@/lib/types';
import { format, parse, isAfter, isBefore, startOfDay, subDays, differenceInDays } from 'date-fns';
import { useRouter } from 'next/navigation';

interface CrewLoginActivity {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: string;
  lastSignInAt: string | null;
  createdAt: string;
  daysSinceLastLogin: number | null;
  daysSinceAccountCreation: number;
  loginCount: number | null;
}

export default function LoginActivityPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const router = useRouter();
  const [crewActivity, setCrewActivity] = useState<CrewLoginActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBy, setFilterBy] = useState<'all' | 'active' | 'inactive' | 'never'>('all');
  const [sortBy, setSortBy] = useState<'lastLogin' | 'accountCreation' | 'name'>('lastLogin');

  // Fetch user profile to check if admin
  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);
  
  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    // Handle both snake_case and camelCase role fields
    const role = (userProfileRaw as any).role || (userProfileRaw as any).role || userProfileRaw.role || 'crew';
    return {
      ...userProfileRaw,
      role: role,
    } as UserProfile;
  }, [userProfileRaw]);

  const isAdmin = userProfile?.role === 'admin';
  
  // Debug logging
  useEffect(() => {
    if (userProfileRaw) {
      console.log('[LOGIN ACTIVITY] User profile:', {
        role: userProfile?.role,
        isAdmin,
        rawRole: (userProfileRaw as any).role,
        hasUserProfile: !!userProfile,
      });
    }
  }, [userProfileRaw, userProfile, isAdmin]);

  // Redirect if not admin (only after profile has loaded)
  useEffect(() => {
    if (!isLoadingProfile && userProfile && !isAdmin) {
      router.push('/dashboard');
    }
  }, [isAdmin, isLoadingProfile, userProfile, router]);

  // Fetch crew login activity
  useEffect(() => {
    if (!isAdmin || !user?.id) {
      setIsLoading(false);
      return;
    }

    const fetchLoginActivity = async () => {
      setIsLoading(true);
      try {
        // Fetch all crew users (excluding vessel accounts and admins)
        // Include last_sign_in_at which is synced from auth.users via database trigger
        const { data: allCrew, error: crewError } = await supabase
          .from('users')
          .select('id, first_name, last_name, username, email, role, created_at, last_sign_in_at')
          .in('role', ['crew', 'captain'])
          .order('created_at', { ascending: false });

        if (crewError) {
          console.error('[LOGIN ACTIVITY] Error fetching crew:', crewError);
          setCrewActivity([]);
          setIsLoading(false);
          return;
        }

        // Map crew data to activity format
        const crewActivityData: CrewLoginActivity[] = (allCrew || []).map(crewMember => {
          const lastSignInAt = crewMember.last_sign_in_at || null;
          const createdAt = new Date(crewMember.created_at);
          const today = startOfDay(new Date());
          const daysSinceAccountCreation = differenceInDays(today, createdAt);

          let daysSinceLastLogin: number | null = null;
          if (lastSignInAt) {
            const lastLogin = new Date(lastSignInAt);
            daysSinceLastLogin = differenceInDays(today, lastLogin);
          }

          return {
            id: crewMember.id,
            firstName: crewMember.first_name || '',
            lastName: crewMember.last_name || '',
            username: crewMember.username || '',
            email: crewMember.email || '',
            role: crewMember.role || 'crew',
            lastSignInAt: lastSignInAt ? format(new Date(lastSignInAt), 'yyyy-MM-dd HH:mm:ss') : null,
            createdAt: crewMember.created_at,
            daysSinceLastLogin,
            daysSinceAccountCreation,
            loginCount: null, // Would need additional tracking
          };
        });

        setCrewActivity(crewActivityData);
      } catch (error) {
        console.error('[LOGIN ACTIVITY] Error fetching activity:', error);
        setCrewActivity([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLoginActivity();
  }, [isAdmin, user?.id, supabase]);

  // Filter and sort crew
  const filteredAndSortedCrew = useMemo(() => {
    let filtered = crewActivity;

    // Filter by search term
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(crew => 
        crew.firstName.toLowerCase().includes(search) ||
        crew.lastName.toLowerCase().includes(search) ||
        crew.username.toLowerCase().includes(search) ||
        crew.email.toLowerCase().includes(search)
      );
    }

    // Filter by status
    if (filterBy === 'active') {
      filtered = filtered.filter(crew => 
        crew.daysSinceLastLogin !== null && crew.daysSinceLastLogin <= 30
      );
    } else if (filterBy === 'inactive') {
      filtered = filtered.filter(crew => 
        crew.daysSinceLastLogin === null || crew.daysSinceLastLogin > 30
      );
    } else if (filterBy === 'never') {
      filtered = filtered.filter(crew => crew.lastSignInAt === null);
    }

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === 'lastLogin') {
        if (a.daysSinceLastLogin === null && b.daysSinceLastLogin === null) {
          return b.daysSinceAccountCreation - a.daysSinceAccountCreation;
        }
        if (a.daysSinceLastLogin === null) return 1;
        if (b.daysSinceLastLogin === null) return -1;
        return a.daysSinceLastLogin - b.daysSinceLastLogin;
      } else if (sortBy === 'accountCreation') {
        return b.daysSinceAccountCreation - a.daysSinceAccountCreation;
      } else {
        // Sort by name
        const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
        const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
        return nameA.localeCompare(nameB);
      }
    });

    return filtered;
  }, [crewActivity, searchTerm, filterBy, sortBy]);

  const stats = useMemo(() => {
    const total = crewActivity.length;
    const active = crewActivity.filter(c => 
      c.daysSinceLastLogin !== null && c.daysSinceLastLogin <= 30
    ).length;
    const inactive = crewActivity.filter(c => 
      c.daysSinceLastLogin === null || c.daysSinceLastLogin > 30
    ).length;
    const neverLoggedIn = crewActivity.filter(c => c.lastSignInAt === null).length;
    const avgDaysSinceLogin = crewActivity
      .filter(c => c.daysSinceLastLogin !== null)
      .reduce((sum, c) => sum + (c.daysSinceLastLogin || 0), 0) / 
      (crewActivity.filter(c => c.daysSinceLastLogin !== null).length || 1);

    return { total, active, inactive, neverLoggedIn, avgDaysSinceLogin: Math.round(avgDaysSinceLogin) };
  }, [crewActivity]);

  if (isLoadingProfile || isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Login Activity</h1>
          <p className="text-muted-foreground">
            Track crew member login activity and engagement.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Login Activity</h1>
        <p className="text-muted-foreground">
          Track crew member login activity and engagement.
        </p>
        {stats.neverLoggedIn === stats.total && stats.total > 0 && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
            <strong>Note:</strong> No login data available. If you've just set up the login sync trigger, login data will appear after users sign in. 
            Make sure the database trigger <code>sync_last_sign_in_trigger</code> is active on the <code>auth.users</code> table.
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Crew</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              All crew and captain accounts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
            <p className="text-xs text-muted-foreground">
              Logged in within last 30 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive Users</CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.inactive}</div>
            <p className="text-xs text-muted-foreground">
              No login in 30+ days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Never Logged In</CardTitle>
            <LogIn className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.neverLoggedIn}</div>
            <p className="text-xs text-muted-foreground">
              Accounts never used
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Activity Table */}
      <Card>
        <CardHeader>
          <CardTitle>Crew Login Activity</CardTitle>
          <CardDescription>
            {filteredAndSortedCrew.length} of {crewActivity.length} crew members
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, username, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={filterBy} onValueChange={(value: any) => setFilterBy(value)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                <SelectItem value="active">Active (30 days)</SelectItem>
                <SelectItem value="inactive">Inactive (30+ days)</SelectItem>
                <SelectItem value="never">Never Logged In</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lastLogin">Last Login</SelectItem>
                <SelectItem value="accountCreation">Account Creation</SelectItem>
                <SelectItem value="name">Name</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Days Since</TableHead>
                  <TableHead>Account Age</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedCrew.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {searchTerm || filterBy !== 'all' 
                        ? 'No crew members found matching your filters.' 
                        : 'No crew members found.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndSortedCrew.map((crew) => (
                    <TableRow key={crew.id}>
                      <TableCell className="font-medium">
                        {crew.firstName} {crew.lastName}
                      </TableCell>
                      <TableCell>{crew.username}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          {crew.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={crew.role === 'captain' ? 'default' : 'secondary'}>
                          {crew.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {crew.lastSignInAt ? (
                          <div className="flex flex-col">
                            <span>{format(parse(crew.lastSignInAt, 'yyyy-MM-dd HH:mm:ss', new Date()), 'MMM d, yyyy')}</span>
                            <span className="text-xs text-muted-foreground">
                              {format(parse(crew.lastSignInAt, 'yyyy-MM-dd HH:mm:ss', new Date()), 'h:mm a')}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {crew.daysSinceLastLogin !== null ? (
                          <span className={crew.daysSinceLastLogin > 30 ? 'text-destructive font-medium' : 'text-green-600'}>
                            {crew.daysSinceLastLogin} days
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {crew.daysSinceAccountCreation} days
                      </TableCell>
                      <TableCell>
                        {crew.lastSignInAt === null ? (
                          <Badge variant="destructive">Never</Badge>
                        ) : crew.daysSinceLastLogin !== null && crew.daysSinceLastLogin <= 7 ? (
                          <Badge variant="default" className="bg-green-600">Active</Badge>
                        ) : crew.daysSinceLastLogin !== null && crew.daysSinceLastLogin <= 30 ? (
                          <Badge variant="secondary">Recent</Badge>
                        ) : (
                          <Badge variant="destructive">Inactive</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

