'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useUser, useSupabase } from '@/supabase';
import { useDoc, useCollection } from '@/supabase/database';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2, XCircle, Ship, Calendar, User, Mail, AlertCircle, Clock, FileText, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, parse, eachDayOfInterval, startOfDay, endOfDay, isAfter, isBefore, differenceInDays, isValid } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { getVesselStateLogs } from '@/supabase/database/queries';
import { DateComparisonView } from './date-comparison-view';
import type { UserProfile, Testimonial, Vessel, VesselClaimRequest, StateLog, SeaTimeRequest } from '@/lib/types';

export default function InboxPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const { toast } = useToast();
  const [testimonials, setTestimonials] = useState<(Testimonial & { user?: { email: string; first_name?: string; last_name?: string; username?: string } })[]>([]);
  const [approvedTestimonials, setApprovedTestimonials] = useState<(Testimonial & { user?: { email: string; first_name?: string; last_name?: string; username?: string } })[]>([]);
  const [captaincyRequests, setCaptaincyRequests] = useState<(VesselClaimRequest & { user?: { email: string; first_name?: string; last_name?: string; username?: string }, vessel?: { name: string } })[]>([]);
  const [captainRoleApplications, setCaptainRoleApplications] = useState<any[]>([]);
  const [seaTimeRequests, setSeaTimeRequests] = useState<(SeaTimeRequest & { user?: { email: string; first_name?: string; last_name?: string; username?: string }, vessel?: { name: string } })[]>([]);
  const [selectedSeaTimeRequest, setSelectedSeaTimeRequest] = useState<(SeaTimeRequest & { user?: { email: string; first_name?: string; last_name?: string; username?: string }, vessel?: { name: string } }) | null>(null);
  const [isSeaTimeDialogOpen, setIsSeaTimeDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved'>('pending');
  const [selectedTestimonial, setSelectedTestimonial] = useState<(Testimonial & { user?: { email: string; first_name?: string; last_name?: string; username?: string } }) | null>(null);
  const [selectedCaptaincyRequest, setSelectedCaptaincyRequest] = useState<(VesselClaimRequest & { user?: { email: string; first_name?: string; last_name?: string; username?: string }, vessel?: { name: string } }) | null>(null);
  const [selectedCaptainRoleApplication, setSelectedCaptainRoleApplication] = useState<any | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCaptaincyDialogOpen, setIsCaptaincyDialogOpen] = useState(false);
  const [isCaptainRoleDialogOpen, setIsCaptainRoleDialogOpen] = useState(false);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Password verification state
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  
  // Captain comments state
  const [commentConduct, setCommentConduct] = useState('');
  const [commentAbility, setCommentAbility] = useState('');
  const [commentGeneral, setCommentGeneral] = useState('');
  const [captainSignature, setCaptainSignature] = useState<string | null>(null);
  const [signatureApproved, setSignatureApproved] = useState(false);
  
  // State for date comparison
  const [vesselStateLogs, setVesselStateLogs] = useState<StateLog[]>([]); // Crew member's logs
  const [allVesselLogs, setAllVesselLogs] = useState<StateLog[]>([]); // All vessel logs (for comparison)
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set()); // Track which crew member groups are expanded
  const [comparisonData, setComparisonData] = useState<any>(null); // Store comparison data for mismatch details

  // Fetch user profile to get email
  const { data: userProfileRaw } = useDoc<UserProfile>('users', user?.id);
  
  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    return {
      ...userProfileRaw,
      email: (userProfileRaw as any).email || user?.email || '',
      role: (userProfileRaw as any).role || userProfileRaw.role || 'crew',
    } as UserProfile;
  }, [userProfileRaw, user]);

  // Fetch all vessels for name lookup
  const { data: vessels } = useCollection<Vessel>('vessels');

  // Check if user is captain/admin (has captain, vessel, or admin role, or position contains captain)
  const isCaptain = useMemo(() => {
    if (!userProfile) return false;
    const role = userProfile.role?.toLowerCase() || '';
    const position = ((userProfileRaw as any)?.position || '').toLowerCase();
    // Captains, admins, and vessel managers can access, or users with captain in their position
    return role === 'captain' || role === 'vessel' || role === 'admin' || position.includes('captain');
  }, [userProfile, userProfileRaw]);

  // Check if user is admin
  const isAdmin = useMemo(() => {
    return userProfile?.role?.toLowerCase() === 'admin';
  }, [userProfile]);

  // Fetch pending testimonials and captaincy requests
  useEffect(() => {
    if (!isCaptain) {
      setIsLoading(false);
      return;
    }

    const fetchPendingData = async () => {
      setIsLoading(true);
      try {
        const userIsAdmin = userProfile?.role?.toLowerCase() === 'admin';
        
        // For admins: fetch captaincy requests and captain role applications (testimonials are vessel-specific)
        // For captains/vessel managers: only fetch testimonials addressed to them
        if (userIsAdmin) {
          // Admins see captaincy requests and captain role applications
          console.log('[INBOX] Fetching captaincy requests and captain role applications for admin user:', user?.id);
          
          // Fetch captaincy requests
          const { data: captaincyData, error: captaincyError } = await supabase
            .from('vessel_claim_requests')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

          console.log('[INBOX] Captaincy requests query result:', { captaincyData, captaincyError });

          if (captaincyError) {
            console.error('[INBOX] Error fetching pending captaincy requests:', captaincyError);
            setCaptaincyRequests([]);
          } else if (captaincyData && captaincyData.length > 0) {
            const captaincyRequestsWithDetails = await Promise.all(
              captaincyData.map(async (request) => {
                const [userResult, vesselResult] = await Promise.all([
                  supabase
                    .from('users')
                    .select('email, first_name, last_name, username')
                    .eq('id', request.requested_by)
                    .maybeSingle(),
                  supabase
                    .from('vessels')
                    .select('name')
                    .eq('id', request.vessel_id)
                    .maybeSingle(),
                ]);

                return {
                  ...request,
                  user: userResult.data || undefined,
                  vessel: vesselResult.data || undefined,
                };
              })
            );
            setCaptaincyRequests(captaincyRequestsWithDetails as any);
          } else {
            setCaptaincyRequests([]);
          }

          // Fetch captain role applications - explicitly select all fields including supporting_documents
          const { data: applicationsData, error: applicationsError } = await supabase
            .from('captain_role_applications')
            .select('id, user_id, status, supporting_documents, notes, reviewed_by, reviewed_at, rejection_reason, created_at, updated_at')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

          console.log('[INBOX] Captain role applications query result:', { applicationsData, applicationsError });

          if (applicationsError) {
            console.error('[INBOX] Error fetching captain role applications:', applicationsError);
            setCaptainRoleApplications([]);
          } else if (applicationsData && applicationsData.length > 0) {
            const applicationsWithDetails = await Promise.all(
              applicationsData.map(async (application) => {
                console.log('[INBOX] Processing application:', { id: application.id, supporting_documents: application.supporting_documents });
                
                const userResult = await supabase
                  .from('users')
                  .select('email, first_name, last_name, username, position')
                  .eq('id', application.user_id)
                  .maybeSingle();

                return {
                  ...application,
                  user: userResult.data || undefined,
                };
              })
            );
            console.log('[INBOX] Final applications with details:', applicationsWithDetails);
            setCaptainRoleApplications(applicationsWithDetails);
          } else {
            setCaptainRoleApplications([]);
          }

          // Set testimonials to empty for admins
          setTestimonials([]);
        } else {
          // Captains/vessel managers see testimonials addressed to them
          // Build base query filter for captain matching
          const captainFilter = user?.id && user?.email
            ? `captain_user_id.eq.${user.id},captain_email.ilike.${user.email}`
            : user?.id
            ? `captain_user_id.eq.${user.id}`
            : user?.email
            ? `captain_email.ilike.${user.email}`
            : null;

          // Fetch pending testimonials
          let pendingQuery = supabase
            .from('testimonials')
            .select('*')
            .eq('status', 'pending_captain');
          
          if (captainFilter) {
            pendingQuery = pendingQuery.or(captainFilter);
          }
          
          const { data: pendingData, error: pendingError } = await pendingQuery.order('created_at', { ascending: false });

          // Fetch approved testimonials (where captain approved them)
          let approvedQuery = supabase
            .from('testimonials')
            .select('*')
            .eq('status', 'approved');
          
          if (captainFilter) {
            approvedQuery = approvedQuery.or(captainFilter);
          }
          
          const { data: approvedData, error: approvedError } = await approvedQuery.order('updated_at', { ascending: false });

          if (pendingError) {
            console.error('Error fetching pending testimonials:', pendingError);
            toast({
              title: 'Error',
              description: 'Failed to load pending requests. Please try again.',
              variant: 'destructive',
            });
          }

          if (approvedError) {
            console.error('Error fetching approved testimonials:', approvedError);
          }

          // Helper function to fetch user profiles
          const fetchUserProfiles = async (testimonialsList: any[]) => {
            return await Promise.all(
              testimonialsList.map(async (testimonial) => {
                const { data: userData } = await supabase
                  .from('users')
                  .select('email, first_name, last_name, username')
                  .eq('id', testimonial.user_id)
                  .maybeSingle();
                
                return {
                  ...testimonial,
                  user: userData || undefined,
                };
              })
            );
          };
            
          // Process pending testimonials
          if (pendingData) {
            const pendingWithUsers = await fetchUserProfiles(pendingData);
            setTestimonials(pendingWithUsers as any);
          } else {
            setTestimonials([]);
          }

          // Process approved testimonials
          if (approvedData) {
            const approvedWithUsers = await fetchUserProfiles(approvedData);
            setApprovedTestimonials(approvedWithUsers as any);
          } else {
            setApprovedTestimonials([]);
          }

          // Set captaincy requests to empty for non-admins
          setCaptaincyRequests([]);

          // Fetch sea time requests for this vessel (if user is vessel manager)
          if (userProfile?.active_vessel_id) {
            const { data: seaTimeData, error: seaTimeError } = await supabase
              .from('sea_time_requests')
              .select('*')
              .eq('vessel_id', userProfile.active_vessel_id)
              .eq('status', 'pending')
              .order('created_at', { ascending: false });

            if (seaTimeError) {
              console.error('[INBOX] Error fetching sea time requests:', seaTimeError);
            } else if (seaTimeData && seaTimeData.length > 0) {
              const seaTimeWithDetails = await Promise.all(
                seaTimeData.map(async (request) => {
                  const [userResult, vesselResult] = await Promise.all([
                    supabase
                      .from('users')
                      .select('email, first_name, last_name, username')
                      .eq('id', request.crew_user_id)
                      .maybeSingle(),
                    supabase
                      .from('vessels')
                      .select('name')
                      .eq('id', request.vessel_id)
                      .maybeSingle(),
                  ]);

                  return {
                    id: request.id,
                    crewUserId: request.crew_user_id,
                    vesselId: request.vessel_id,
                    startDate: request.start_date,
                    endDate: request.end_date,
                    status: request.status,
                    rejectionReason: request.rejection_reason,
                    createdAt: request.created_at,
                    updatedAt: request.updated_at,
                    user: userResult.data || undefined,
                    vessel: vesselResult.data || undefined,
                  };
                })
              );
              setSeaTimeRequests(seaTimeWithDetails as any);
            } else {
              setSeaTimeRequests([]);
            }
          } else {
            setSeaTimeRequests([]);
          }
        }
      } catch (error: any) {
        console.error('Error fetching pending data:', error);
        toast({
          title: 'Error',
          description: error.message || 'Failed to load pending requests.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchPendingData();
  }, [user?.email, isCaptain, userProfile, supabase, toast]);

  const getVesselName = (vesselId: string) => {
    return vessels?.find(v => v.id === vesselId)?.name || 'Unknown Vessel';
  };

  const getUserName = (item: typeof selectedTestimonial | typeof selectedCaptaincyRequest) => {
    if (!item?.user) return 'Unknown User';
    const firstName = (item.user as any).first_name || '';
    const lastName = (item.user as any).last_name || '';
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || (item.user as any).username || (item.user as any).email || 'Unknown User';
  };

  // Group testimonials by crew member (user_id) and sort by most recent request
  const groupedTestimonials = useMemo(() => {
    if (testimonials.length === 0) return [];
    
    // Group by user_id
    const groups = new Map<string, typeof testimonials>();
    
    testimonials.forEach(testimonial => {
      const userId = testimonial.user_id;
      if (!groups.has(userId)) {
        groups.set(userId, []);
      }
      groups.get(userId)!.push(testimonial);
    });
    
    // Sort each group by created_at (most recent first)
    groups.forEach((group) => {
      group.sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA; // Most recent first
      });
    });
    
    // Convert to array and sort groups by most recent request in each group
    const groupsArray = Array.from(groups.entries()).map(([userId, group]) => ({
      userId,
      testimonials: group,
      mostRecentDate: new Date(group[0].created_at || 0).getTime(), // Most recent in group
      crewMember: group[0].user, // User info from first testimonial
    }));
    
    // Sort groups by most recent request (most recent group first)
    groupsArray.sort((a, b) => b.mostRecentDate - a.mostRecentDate);
    
    return groupsArray;
  }, [testimonials]);

  const toggleGroup = (userId: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  // Verify password before approval
  const verifyPasswordAndApprove = async () => {
    if (!userProfileRaw?.email || !password) {
      setPasswordError('Password is required');
      return;
    }

    setIsVerifyingPassword(true);
    setPasswordError('');

    try {
      // Verify password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: userProfileRaw.email,
        password: password,
      });

      if (signInError) {
        setPasswordError('Incorrect password. Please try again.');
        return;
      }

      // Password is correct, close password dialog and proceed with approval
      setIsPasswordDialogOpen(false);
      setPassword('');
      setPasswordError('');
      
      // Now proceed with the actual approval
      await performApproval();
    } catch (error: any) {
      console.error('Error verifying password:', error);
      setPasswordError('An error occurred. Please try again.');
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedTestimonial || !user?.id) return;
    
    // Validate required comment fields
    if (!commentConduct.trim() || !commentAbility.trim() || !commentGeneral.trim()) {
      toast({
        title: 'Comments Required',
        description: 'Please fill in all comment fields (Conduct, Ability, and General Comments) before approving.',
        variant: 'destructive',
      });
      return;
    }
    
    // Check if signature exists
    if (!captainSignature) {
      toast({
        title: 'Signature Required',
        description: 'Please add your signature in Settings → Signature before approving testimonials.',
        variant: 'destructive',
      });
      return;
    }
    
    // Check if signature approval checkbox is checked
    if (!signatureApproved) {
      toast({
        title: 'Signature Approval Required',
        description: 'Please confirm that you approve the use of your signature by checking the checkbox.',
        variant: 'destructive',
      });
      return;
    }
    
    // Show password verification dialog first
    setIsPasswordDialogOpen(true);
    setPassword('');
    setPasswordError('');
  };

  // Actual approval logic (separated for reuse)
  const performApproval = async () => {
    if (!selectedTestimonial || !user?.id) return;

    setIsProcessing(true);
    try {
      // Fetch captain profile to populate captain_name and captain_email if not already set
      let updateData: any = {
          status: 'approved',
          updated_at: new Date().toISOString(),
      };

      // Add captain comments
      updateData.captain_comment_conduct = commentConduct.trim();
      updateData.captain_comment_ability = commentAbility.trim();
      updateData.captain_comment_general = commentGeneral.trim();

      // Always fetch and save captain details (name, email, position, signature) when approving
      // This ensures the crew member can generate the PDF without needing permission to view the captain's profile
      if (!selectedTestimonial.captain_name || !selectedTestimonial.captain_email || !selectedTestimonial.captain_position || !selectedTestimonial.captain_signature) {
        // If captain_user_id is set, fetch from that user's profile
        if (selectedTestimonial.captain_user_id) {
          const { data: captainProfile, error: profileError } = await supabase
            .from('users')
            .select('first_name, last_name, email, position, signature')
            .eq('id', selectedTestimonial.captain_user_id)
            .maybeSingle();

          if (!profileError && captainProfile) {
            console.log('[APPROVAL] Fetched captain profile:', {
              hasSignature: !!captainProfile.signature,
              signatureLength: captainProfile.signature?.length || 0
            });
            
            const captainFullName = `${captainProfile.first_name || ''} ${captainProfile.last_name || ''}`.trim();
            if (!selectedTestimonial.captain_name && captainFullName) {
              updateData.captain_name = captainFullName;
            }
            if (!selectedTestimonial.captain_email && captainProfile.email) {
              updateData.captain_email = captainProfile.email;
            }
            if (!selectedTestimonial.captain_position && captainProfile.position) {
              updateData.captain_position = captainProfile.position;
            }
            if (!selectedTestimonial.captain_signature && captainProfile.signature) {
              updateData.captain_signature = captainProfile.signature;
              console.log('[APPROVAL] Adding captain signature to testimonial');
            }
          }
        } else {
          // If no captain_user_id, try to get from current user (the approving captain)
          const { data: currentCaptainProfile, error: currentProfileError } = await supabase
            .from('users')
            .select('first_name, last_name, email, position, signature')
            .eq('id', user.id)
            .maybeSingle();

          if (!currentProfileError && currentCaptainProfile) {
            console.log('[APPROVAL] Fetched current captain profile:', {
              hasSignature: !!currentCaptainProfile.signature,
              signatureLength: currentCaptainProfile.signature?.length || 0
            });
            
            const captainFullName = `${currentCaptainProfile.first_name || ''} ${currentCaptainProfile.last_name || ''}`.trim();
            if (!selectedTestimonial.captain_name && captainFullName) {
              updateData.captain_name = captainFullName;
            }
            if (!selectedTestimonial.captain_email && currentCaptainProfile.email) {
              updateData.captain_email = currentCaptainProfile.email;
            }
            if (!selectedTestimonial.captain_position && currentCaptainProfile.position) {
              updateData.captain_position = currentCaptainProfile.position;
            }
            if (!selectedTestimonial.captain_signature && currentCaptainProfile.signature) {
              updateData.captain_signature = currentCaptainProfile.signature;
              console.log('[APPROVAL] Adding current captain signature to testimonial');
            }
            // Also set captain_user_id if not already set
            if (!selectedTestimonial.captain_user_id) {
              updateData.captain_user_id = user.id;
            }
          }
        }
      }

      const { error } = await supabase
        .from('testimonials')
        .update(updateData)
        .eq('id', selectedTestimonial.id);

      if (error) {
        throw error;
      }

      // Create immutable snapshot in approved_testimonials table via API route
      // Add a small delay to ensure the testimonial update has been committed
      // Use a promise-based approach instead of setTimeout for better error handling
      (async () => {
        // Wait a bit for the database update to commit
        await new Promise(resolve => setTimeout(resolve, 300));
        
        try {
          console.log('[SNAPSHOT] Calling snapshot API for testimonial:', selectedTestimonial.id);
          
          const snapshotResponse = await fetch('/api/testimonials/create-snapshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              testimonialId: selectedTestimonial.id,
            }),
          });

          const snapshotResult = await snapshotResponse.json();

          if (!snapshotResponse.ok) {
            console.error('[SNAPSHOT] Error creating snapshot - Full details:', {
              status: snapshotResponse.status,
              statusText: snapshotResponse.statusText,
              error: snapshotResult.error,
              message: snapshotResult.message,
              code: snapshotResult.code,
              details: snapshotResult.details,
              hint: snapshotResult.hint,
              testimonialId: selectedTestimonial.id,
              testimonialStatus: updateData.status,
              fullResponse: JSON.stringify(snapshotResult, null, 2),
            });
            // Don't throw - approval succeeded, snapshot is just for record keeping
          } else {
            console.log('[SNAPSHOT] Successfully created snapshot:', snapshotResult.snapshot);
          }
        } catch (snapshotErr: any) {
          console.error('[SNAPSHOT] Exception creating approved testimonial snapshot:', {
            error: snapshotErr,
            message: snapshotErr?.message,
            stack: snapshotErr?.stack,
            testimonialId: selectedTestimonial.id,
          });
          // Don't throw - approval succeeded, snapshot is just for record keeping
        }
      })();

      toast({
        title: 'Testimonial Approved',
        description: 'The testimonial has been approved successfully.',
      });

      // Move to approved list and remove from pending
      const approvedTestimonial = { 
        ...selectedTestimonial, 
        status: 'approved' as const,
        captain_name: updateData.captain_name || selectedTestimonial.captain_name,
        captain_email: updateData.captain_email || selectedTestimonial.captain_email,
        captain_position: updateData.captain_position || selectedTestimonial.captain_position,
        captain_user_id: updateData.captain_user_id || selectedTestimonial.captain_user_id,
      };
      setApprovedTestimonials(prev => [approvedTestimonial, ...prev]);
      setTestimonials(prev => prev.filter(t => t.id !== selectedTestimonial.id));
      setIsDialogOpen(false);
      setSelectedTestimonial(null);
      setAction(null);
    } catch (error: any) {
      console.error('Error approving testimonial:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve testimonial. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Format mismatch details for rejection message
  const formatMismatchDetails = (comparison: any): string => {
    if (!comparison || !comparison.discrepancies || comparison.discrepancies.length === 0) {
      return '';
    }

    const discrepancies = comparison.discrepancies;
    const formatState = (state: string): string => {
      const stateMap: Record<string, string> = {
        'underway': 'At Sea',
        'at-anchor': 'At Anchor',
        'in-port': 'In Port',
        'in-yard': 'In Yard',
        'on-leave': 'On Leave'
      };
      return stateMap[state] || state;
    };

    let details = '\n\n--- State Mismatches Found ---\n';
    details += `Total mismatches: ${discrepancies.length} day${discrepancies.length !== 1 ? 's' : ''}\n\n`;
    
    // Group by type of mismatch for better readability
    discrepancies.slice(0, 20).forEach((day: any, index: number) => {
      const dateStr = format(new Date(day.date), 'MMM d, yyyy');
      details += `${index + 1}. ${dateStr}: You logged "${formatState(day.crewState || '')}" but vessel records show "${formatState(day.vesselState || '')}"\n`;
    });
    
    if (discrepancies.length > 20) {
      details += `\n... and ${discrepancies.length - 20} more mismatch${discrepancies.length - 20 !== 1 ? 'es' : ''}\n`;
    }
    
    details += '\nPlease review your logged dates and ensure they match the vessel\'s official records.';
    
    return details;
  };

  const handleReject = async () => {
    if (!selectedTestimonial) return;

    if (!rejectionReason.trim()) {
      toast({
        title: 'Rejection Reason Required',
        description: 'Please provide a reason for rejecting this testimonial.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    try {
      const currentNotes = selectedTestimonial.notes || '';
      
      // Include mismatch details if available
      let rejectionText = rejectionReason;
      if (comparisonData && comparisonData.discrepancies && comparisonData.discrepancies.length > 0) {
        rejectionText += formatMismatchDetails(comparisonData);
      }
      
      const notes = currentNotes
        ? `${currentNotes}\n\nRejection reason: ${rejectionText}`
        : `Rejection reason: ${rejectionText}`;

      const { error } = await supabase
        .from('testimonials')
        .update({
          status: 'rejected',
          notes: notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedTestimonial.id);

      if (error) {
        throw error;
      }

      toast({
        title: 'Testimonial Rejected',
        description: 'The testimonial has been rejected.',
      });

      // Remove from list
      setTestimonials(prev => prev.filter(t => t.id !== selectedTestimonial.id));
      setIsDialogOpen(false);
      setSelectedTestimonial(null);
      setAction(null);
      setRejectionReason('');
    } catch (error: any) {
      console.error('Error rejecting testimonial:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reject testimonial. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const openActionDialog = async (testimonial: typeof testimonials[0], actionType: 'approve' | 'reject') => {
    setSelectedTestimonial(testimonial);
    setAction(actionType);
    setRejectionReason('');
    setCommentConduct('');
    setCommentAbility('');
    setCommentGeneral('');
    setSignatureApproved(false);
    setIsDialogOpen(true);
    
    // Fetch captain signature for preview if approving
    if (actionType === 'approve' && user?.id) {
      try {
        const { data: captainProfile, error: sigError } = await supabase
          .from('users')
          .select('signature')
          .eq('id', user.id)
          .maybeSingle();
        
        if (!sigError && captainProfile?.signature) {
          setCaptainSignature(captainProfile.signature);
        } else {
          setCaptainSignature(null);
        }
      } catch (error) {
        console.error('[INBOX] Error fetching captain signature:', error);
        setCaptainSignature(null);
      }
    }
    
    // Fetch vessel state logs for date comparison
    // For captains: fetch both crew member's logs AND all vessel logs (captain has read permission for vessel)
    if (actionType === 'approve' && testimonial.vessel_id) {
      setIsLoadingLogs(true);
      try {
        console.log('[INBOX] Fetching logs for comparison:', {
          vesselId: testimonial.vessel_id,
          crewUserId: testimonial.user_id,
          currentUserId: user?.id,
          isCaptain: isCaptain
        });
        
        // Fetch crew member's logs (what they actually logged) - CRITICAL: We need these exact logs
        let crewLogs: StateLog[] = [];
          if (testimonial.user_id) {
          try {
            console.log('[INBOX] Fetching crew member logs:', {
              vesselId: testimonial.vessel_id,
              crewUserId: testimonial.user_id,
              currentUserId: user?.id,
              dateRange: { start: testimonial.start_date, end: testimonial.end_date }
            });
            
            // Try direct query first
            crewLogs = await getVesselStateLogs(supabase, testimonial.vessel_id, testimonial.user_id);
            
            console.log('[INBOX] Crew member logs fetched (direct query):', {
              count: crewLogs.length,
              firstFew: crewLogs.slice(0, 5).map(l => ({ date: l.date, state: l.state })),
            });
            
            // If no logs found, try querying with date filter directly in the query
            if (crewLogs.length === 0) {
              console.log('[INBOX] No logs from direct query, trying date-filtered query...');
              try {
                const startDate = testimonial.start_date;
                const endDate = testimonial.end_date;
                
                // Try querying with date range filter
                const { data: dateFilteredData, error: dateError } = await supabase
                  .from('daily_state_logs')
                  .select('*')
                  .eq('vessel_id', testimonial.vessel_id)
                  .eq('user_id', testimonial.user_id)
                  .gte('date', startDate)
                  .lte('date', endDate)
                  .order('date', { ascending: true });
                
                if (dateError) {
                  console.error('[INBOX] Date-filtered query error:', dateError);
                } else if (dateFilteredData && dateFilteredData.length > 0) {
                  console.log('[INBOX] Found logs with date-filtered query:', dateFilteredData.length);
                  // Transform the data to StateLog format
                  crewLogs = dateFilteredData.map((log: any) => ({
                    id: log.id,
                    userId: log.user_id,
                    vesselId: log.vessel_id,
                    date: log.date || log.log_date,
                    state: log.state,
                    createdAt: log.created_at,
                    updatedAt: log.updated_at,
                  }));
                }
              } catch (altError: any) {
                console.error('[INBOX] Alternative query also failed:', altError);
              }
            }
            
            // Filter to the exact date range of the testimonial (in case query didn't filter)
            const startDate = parse(testimonial.start_date, 'yyyy-MM-dd', new Date());
            const endDate = parse(testimonial.end_date, 'yyyy-MM-dd', new Date());
            crewLogs = crewLogs.filter(log => {
              const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
              return logDate >= startDate && logDate <= endDate;
            });
            
            console.log('[INBOX] Crew member logs after filtering to date range:', {
              count: crewLogs.length,
              firstFew: crewLogs.slice(0, 5).map(l => ({ date: l.date, state: l.state }))
            });
            
            if (crewLogs.length === 0) {
              console.warn('[INBOX] WARNING: No crew member logs found for date range!', {
                vesselId: testimonial.vessel_id,
                crewUserId: testimonial.user_id,
                dateRange: { start: testimonial.start_date, end: testimonial.end_date },
                note: 'This may be due to RLS permissions or the crew member may not have logged these dates'
              });
            }
          } catch (error: any) {
            console.error('[INBOX] ERROR fetching crew member logs:', {
              error: error?.message,
              code: error?.code,
              details: error?.details,
              hint: error?.hint,
              vesselId: testimonial.vessel_id,
              crewUserId: testimonial.user_id,
              fullError: error
            });
            
            // Try one more time with a simpler query
            try {
              console.log('[INBOX] Attempting fallback query...');
              const { data: fallbackData, error: fallbackError } = await supabase
                .from('daily_state_logs')
                .select('*')
                .eq('vessel_id', testimonial.vessel_id)
                .eq('user_id', testimonial.user_id);
              
              if (!fallbackError && fallbackData) {
                console.log('[INBOX] Fallback query succeeded:', fallbackData.length, 'logs found');
                crewLogs = fallbackData.map((log: any) => ({
                  id: log.id,
                  userId: log.user_id,
                  vesselId: log.vessel_id,
                  date: log.date || log.log_date,
                  state: log.state,
                  createdAt: log.created_at,
                  updatedAt: log.updated_at,
                }));
                
                // Filter to date range
                const startDate = parse(testimonial.start_date, 'yyyy-MM-dd', new Date());
                const endDate = parse(testimonial.end_date, 'yyyy-MM-dd', new Date());
                crewLogs = crewLogs.filter(log => {
                  const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
                  return logDate >= startDate && logDate <= endDate;
                });
              } else {
                console.error('[INBOX] Fallback query also failed:', fallbackError);
              }
            } catch (fallbackErr: any) {
              console.error('[INBOX] Fallback query exception:', fallbackErr);
            }
            
            if (crewLogs.length === 0) {
              toast({
                title: 'Error Loading Crew Logs',
                description: 'Unable to fetch the crew member\'s logged dates. Please check your permissions or contact support.',
                variant: 'destructive',
              });
            }
          }
        }
        
        // Fetch vessel account logs (from vessel_manager_id) - this is the official vessel state
        // First, get the vessel record to find the vessel_manager_id
        let vesselManagerId: string | null = null;
        try {
          const { data: vesselData, error: vesselError } = await supabase
            .from('vessels')
            .select('vessel_manager_id')
            .eq('id', testimonial.vessel_id)
            .maybeSingle();
          
          if (vesselError) {
            console.error('[INBOX] Error fetching vessel record:', vesselError);
          } else if (vesselData) {
            vesselManagerId = vesselData.vessel_manager_id;
            console.log('[INBOX] Vessel manager ID:', vesselManagerId);
          }
        } catch (error) {
          console.error('[INBOX] Exception fetching vessel record:', error);
        }
        
        // Fetch vessel logs from the vessel account (vessel_manager_id)
        // This is the official vessel state, not individual crew member logs
        let vesselLogs: StateLog[] = [];
        if (vesselManagerId) {
          try {
            console.log('[INBOX] Fetching vessel account logs:', {
              vesselId: testimonial.vessel_id,
              vesselManagerId: vesselManagerId,
              dateRange: { start: testimonial.start_date, end: testimonial.end_date }
            });
            
            vesselLogs = await getVesselStateLogs(supabase, testimonial.vessel_id, vesselManagerId);
            
            console.log('[INBOX] Vessel account logs fetched:', {
              count: vesselLogs.length,
              firstFew: vesselLogs.slice(0, 5).map(l => ({ date: l.date, state: l.state }))
            });
          } catch (error: any) {
            console.error('[INBOX] Error fetching vessel account logs:', {
              error: error?.message,
              code: error?.code,
              vesselId: testimonial.vessel_id,
              vesselManagerId: vesselManagerId
            });
          }
        } else {
          console.warn('[INBOX] No vessel_manager_id found, trying to fetch all vessel logs as fallback');
          // Fallback: if no vessel_manager_id, try fetching all logs (may include crew member logs)
          try {
            vesselLogs = await getVesselStateLogs(supabase, testimonial.vessel_id);
            console.log('[INBOX] Fetched all vessel logs (fallback):', vesselLogs.length);
          } catch (error: any) {
            console.error('[INBOX] Error fetching all vessel logs:', error);
          }
        }
        
        // Filter vessel logs to date range
        const startDate = parse(testimonial.start_date, 'yyyy-MM-dd', new Date());
        const endDate = parse(testimonial.end_date, 'yyyy-MM-dd', new Date());
        const vesselLogsInRange = vesselLogs.filter(log => {
          const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
          return logDate >= startDate && logDate <= endDate;
        });
        
        console.log('[INBOX] Vessel logs filtered to date range:', {
          count: vesselLogsInRange.length,
          firstFew: vesselLogsInRange.slice(0, 5).map(l => ({ date: l.date, state: l.state }))
        });
        
        console.log('[INBOX] Fetched logs summary:', {
          crewLogsCount: crewLogs.length,
          vesselLogsCount: vesselLogs.length,
          vesselLogsInRangeCount: vesselLogsInRange.length,
          crewFirstFew: crewLogs.slice(0, 5).map(l => ({ date: l.date, state: l.state })),
          vesselFirstFew: vesselLogsInRange.slice(0, 5).map(l => ({ date: l.date, state: l.state })),
        });
        
        // CRITICAL: Only use crew member's actual logs - never fall back to vessel logs
        // Vessel logs might be from vessel account or other users, which would be incorrect
        if (crewLogs.length === 0) {
          console.error('[INBOX] CRITICAL: No crew member logs available - cannot show accurate comparison', {
            vesselId: testimonial.vessel_id,
            crewUserId: testimonial.user_id,
            currentUserId: user?.id,
            dateRange: { start: testimonial.start_date, end: testimonial.end_date },
            possibleReasons: [
              'RLS policy may be blocking access',
              'Crew member may not have logged dates in this range',
              'Captain may not have approved captaincy or signing authority',
              'Date format mismatch'
            ]
          });
          
          // Don't show error toast here - let the DateComparisonView handle empty state
          // The comparison view will show a message that logs are missing
        } else {
          console.log('[INBOX] Successfully loaded crew member logs for comparison:', {
            count: crewLogs.length,
            dateRange: { start: testimonial.start_date, end: testimonial.end_date }
          });
        }
        
        // Store crew member's actual logs (what they logged)
        setVesselStateLogs(crewLogs);
        // Store vessel logs for comparison (what the vessel logged)
        setAllVesselLogs(vesselLogsInRange);
      } catch (error: any) {
        console.error('[INBOX] Error fetching vessel state logs:', {
          error,
          message: error?.message,
          code: error?.code,
          details: error?.details,
          hint: error?.hint,
          vesselId: testimonial.vessel_id,
          userId: testimonial.user_id
        });
        setVesselStateLogs([]);
      } finally {
        setIsLoadingLogs(false);
      }
    } else {
      setVesselStateLogs([]);
    }
  };

  const openCaptaincyActionDialog = (request: typeof captaincyRequests[0], actionType: 'approve' | 'reject') => {
    setSelectedCaptaincyRequest(request);
    setAction(actionType);
    setRejectionReason('');
    setIsCaptaincyDialogOpen(true);
  };

  const openCaptainRoleActionDialog = (application: any, actionType: 'approve' | 'reject') => {
    console.log('[INBOX] Opening captain role dialog with application:', {
      id: application.id,
      supporting_documents: application.supporting_documents,
      supporting_documents_type: typeof application.supporting_documents,
      is_array: Array.isArray(application.supporting_documents),
      length: application.supporting_documents?.length,
      full_application: application,
    });
    setSelectedCaptainRoleApplication(application);
    setAction(actionType);
    setRejectionReason('');
    setIsCaptainRoleDialogOpen(true);
  };

  const handleApproveCaptainRole = async () => {
    if (!selectedCaptainRoleApplication || !userProfile?.id) return;

    setIsProcessing(true);
    try {
      const response = await fetch('/api/captain-role-applications/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: selectedCaptainRoleApplication.id,
          reviewedBy: userProfile.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to approve application');
      }

      toast({
        title: 'Application Approved',
        description: 'The captain role has been granted to the user.',
      });

      // Remove from list and refresh
      setCaptainRoleApplications(prev => prev.filter(a => a.id !== selectedCaptainRoleApplication.id));
      setIsCaptainRoleDialogOpen(false);
      setSelectedCaptainRoleApplication(null);
      setAction(null);
    } catch (error: any) {
      console.error('Error approving captain role application:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve application. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectCaptainRole = async () => {
    if (!selectedCaptainRoleApplication || !userProfile?.id) return;

    if (!rejectionReason.trim()) {
      toast({
        title: 'Rejection Reason Required',
        description: 'Please provide a reason for rejecting this application.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch('/api/captain-role-applications/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: selectedCaptainRoleApplication.id,
          reviewedBy: userProfile.id,
          rejectionReason: rejectionReason.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reject application');
      }

      toast({
        title: 'Application Rejected',
        description: 'The application has been rejected.',
      });

      // Remove from list
      setCaptainRoleApplications(prev => prev.filter(a => a.id !== selectedCaptainRoleApplication.id));
      setIsCaptainRoleDialogOpen(false);
      setSelectedCaptainRoleApplication(null);
      setAction(null);
      setRejectionReason('');
    } catch (error: any) {
      console.error('Error rejecting captain role application:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reject application. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApproveCaptaincy = async () => {
    if (!selectedCaptaincyRequest || !user?.id) return;

    setIsProcessing(true);
    try {
      // Call API route to approve captaincy request
      // This uses supabaseAdmin to bypass RLS and create vessel assignment
      const response = await fetch('/api/vessel-claim-requests/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: selectedCaptaincyRequest.id,
          reviewedBy: user.id,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || result.error || 'Failed to approve captaincy request');
      }

      toast({
        title: 'Captaincy Request Approved',
        description: 'The captaincy request has been approved and the captain has been assigned to the vessel.',
      });

      // Remove from list
      setCaptaincyRequests(prev => prev.filter(r => r.id !== selectedCaptaincyRequest.id));
      setIsCaptaincyDialogOpen(false);
      setSelectedCaptaincyRequest(null);
      setAction(null);
    } catch (error: any) {
      console.error('Error approving captaincy request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve captaincy request. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectCaptaincy = async () => {
    if (!selectedCaptaincyRequest || !user?.id) return;

    if (!rejectionReason.trim()) {
      toast({
        title: 'Rejection Reason Required',
        description: 'Please provide a reason for rejecting this request.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('vessel_claim_requests')
        .update({
          status: 'rejected',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: rejectionReason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedCaptaincyRequest.id);

      if (error) {
        throw error;
      }

      toast({
        title: 'Captaincy Request Rejected',
        description: 'The captaincy request has been rejected.',
      });

      // Remove from list
      setCaptaincyRequests(prev => prev.filter(r => r.id !== selectedCaptaincyRequest.id));
      setIsCaptaincyDialogOpen(false);
      setSelectedCaptaincyRequest(null);
      setAction(null);
      setRejectionReason('');
    } catch (error: any) {
      console.error('Error rejecting captaincy request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reject captaincy request. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApproveSeaTimeRequest = async () => {
    if (!selectedSeaTimeRequest) return;

    setIsProcessing(true);
    try {
      const response = await fetch('/api/sea-time-requests/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: selectedSeaTimeRequest.id,
          action: 'approve',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to approve sea time request');
      }

      toast({
        title: 'Request Approved',
        description: data.warning || `Sea time logs have been copied to the crew member. ${data.logsCopied ? `(${data.logsCopied} days)` : ''}`,
      });

      // Remove from list
      setSeaTimeRequests(prev => prev.filter(r => r.id !== selectedSeaTimeRequest.id));
      setIsSeaTimeDialogOpen(false);
      setSelectedSeaTimeRequest(null);
      setAction(null);
      setRejectionReason('');
    } catch (error: any) {
      console.error('Error approving sea time request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve request. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectSeaTimeRequest = async () => {
    if (!selectedSeaTimeRequest) return;

    if (action === 'reject' && !rejectionReason.trim()) {
      toast({
        title: 'Rejection Reason Required',
        description: 'Please provide a reason for rejecting this request.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch('/api/sea-time-requests/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: selectedSeaTimeRequest.id,
          action: 'reject',
          rejectionReason: rejectionReason || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reject sea time request');
      }

      toast({
        title: 'Request Rejected',
        description: 'The sea time request has been rejected.',
      });

      // Remove from list
      setSeaTimeRequests(prev => prev.filter(r => r.id !== selectedSeaTimeRequest.id));
      setIsSeaTimeDialogOpen(false);
      setSelectedSeaTimeRequest(null);
      setAction(null);
      setRejectionReason('');
    } catch (error: any) {
      console.error('Error rejecting sea time request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reject request. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isCaptain) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
          <p className="text-muted-foreground">View and respond to testimonial requests</p>
          <Separator />
        </div>
        <Card className="rounded-xl border">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Access Restricted</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              This page is only accessible to captains and vessel managers. If you believe this is an error, please contact support.
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
            <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
            <p className="text-muted-foreground">
              {isAdmin 
                ? 'Review and approve captaincy requests for vessels'
                : 'Review and respond to testimonial sign-off requests from crew members'}
            </p>
          </div>
          {(testimonials.length > 0 || captaincyRequests.length > 0 || captainRoleApplications.length > 0) && (
            <Badge variant="secondary" className="text-sm">
              {testimonials.length + captaincyRequests.length + captainRoleApplications.length + seaTimeRequests.length} pending request{(testimonials.length + captaincyRequests.length + captainRoleApplications.length + seaTimeRequests.length) !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <Separator />
      </div>

      {/* Content */}
      {isLoading ? (
        <Card className="rounded-xl border">
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      ) : (isAdmin && captaincyRequests.length === 0 && captainRoleApplications.length === 0) || (!isAdmin && testimonials.length === 0 && approvedTestimonials.length === 0 && seaTimeRequests.length === 0) ? (
        <Card className="rounded-xl border">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Mail className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Requests</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {isAdmin 
                ? 'You don\'t have any pending captaincy requests at this time.'
                : 'You don\'t have any testimonial sign-off requests at this time.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Captain Role Applications Section (Admin only) */}
          {isAdmin && captainRoleApplications.length > 0 && (
            <Card className="rounded-xl border shadow-sm">
              <CardHeader>
                <CardTitle>Captain Role Applications</CardTitle>
                <CardDescription>Review and approve applications from users requesting the captain role</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Applicant</TableHead>
                        <TableHead>Position</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {captainRoleApplications.map((application) => (
                        <TableRow key={application.id}>
                          <TableCell>
                              <div>
                                <div>{getUserName(application)}</div>
                                {(application.user as any)?.email && (
                                  <div className="text-xs text-muted-foreground">
                                    {(application.user as any).email}
                                  </div>
                                )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{(application.user as any)?.position || 'N/A'}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              {format(new Date(application.created_at || new Date()), 'MMM d, yyyy')}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                onClick={() => openCaptainRoleActionDialog(application, 'approve')}
                                size="sm"
                                className="rounded-lg bg-green-600 hover:bg-green-700"
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Approve
                              </Button>
                              <Button
                                onClick={() => openCaptainRoleActionDialog(application, 'reject')}
                                size="sm"
                                variant="destructive"
                                className="rounded-lg"
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Captaincy Requests Section (Admin only) */}
          {isAdmin && captaincyRequests.length > 0 && (
            <Card className="rounded-xl border shadow-sm">
              <CardHeader>
                <CardTitle>Vessel Captaincy Requests</CardTitle>
                <CardDescription>Review and approve captaincy requests for vessels</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Requested By</TableHead>
                        <TableHead>Vessel</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {captaincyRequests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell>
                              <div>
                                <div>{getUserName(request as any)}</div>
                                {(request.user as any)?.email && (
                                  <div className="text-xs text-muted-foreground">
                                    {(request.user as any).email}
                                  </div>
                                )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Ship className="h-4 w-4 text-muted-foreground" />
                              {(request.vessel as any)?.name || getVesselName(request.vessel_id)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{request.requested_role || 'captain'}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              {format(new Date(request.created_at || new Date()), 'MMM d, yyyy')}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                onClick={() => openCaptaincyActionDialog(request, 'approve')}
                                size="sm"
                                className="rounded-lg bg-green-600 hover:bg-green-700"
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Approve
                              </Button>
                              <Button
                                onClick={() => openCaptaincyActionDialog(request, 'reject')}
                                size="sm"
                                variant="destructive"
                                className="rounded-lg"
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sea Time Requests Section (Vessel Managers/Captains only) */}
          {!isAdmin && seaTimeRequests.length > 0 && (
            <Card className="rounded-xl border shadow-sm">
              <CardHeader>
                <CardTitle>Sea Time Requests</CardTitle>
                <CardDescription>Review and approve requests from crew members to copy vessel sea time logs</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Requested By</TableHead>
                        <TableHead>Date Range</TableHead>
                        <TableHead>Days</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {seaTimeRequests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{getUserName(request as any)}</div>
                              {(request.user as any)?.email && (
                                <div className="text-xs text-muted-foreground">
                                  {(request.user as any).email}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              {(() => {
                                const startDateStr = request.startDate;
                                const endDateStr = request.endDate;
                                if (!startDateStr || !endDateStr) return '—';
                                
                                const startDate = parse(startDateStr, 'yyyy-MM-dd', new Date());
                                const endDate = parse(endDateStr, 'yyyy-MM-dd', new Date());
                                if (isValid(startDate) && isValid(endDate)) {
                                  return `${format(startDate, 'MMM d, yyyy')} - ${format(endDate, 'MMM d, yyyy')}`;
                                }
                                return `${startDateStr} - ${endDateStr}`;
                              })()}
                            </div>
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const startDateStr = request.startDate;
                              const endDateStr = request.endDate;
                              if (!startDateStr || !endDateStr) return '—';
                              
                              const startDate = parse(startDateStr, 'yyyy-MM-dd', new Date());
                              const endDate = parse(endDateStr, 'yyyy-MM-dd', new Date());
                              if (isValid(startDate) && isValid(endDate)) {
                                return `${differenceInDays(endDate, startDate) + 1} days`;
                              }
                              return '—';
                            })()}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              {request.createdAt ? (() => {
                                const date = new Date(request.createdAt);
                                return isValid(date) ? format(date, 'MMM d, yyyy') : '—';
                              })() : '—'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                onClick={() => {
                                  setSelectedSeaTimeRequest(request);
                                  setAction('approve');
                                  setIsSeaTimeDialogOpen(true);
                                }}
                                size="sm"
                                className="rounded-lg bg-green-600 hover:bg-green-700"
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Approve
                              </Button>
                              <Button
                                onClick={() => {
                                  setSelectedSeaTimeRequest(request);
                                  setAction('reject');
                                  setIsSeaTimeDialogOpen(true);
                                }}
                                size="sm"
                                variant="destructive"
                                className="rounded-lg"
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Testimonials Section - Only show tabs for captains (not admins) */}
          {!isAdmin && (testimonials.length > 0 || approvedTestimonials.length > 0) && (
            <Card className="rounded-xl border shadow-sm">
              <CardHeader>
                <CardTitle>Testimonial Sign-off Requests</CardTitle>
                <CardDescription>Review and respond to testimonial sign-off requests from crew members</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'pending' | 'approved')} className="w-full">
                  <TabsList className="grid w-full grid-cols-2 m-4 mb-0">
                    <TabsTrigger value="pending">
                      Pending
                      {testimonials.length > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          {testimonials.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="approved">
                      Approved
                      {approvedTestimonials.length > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          {approvedTestimonials.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="pending" className="mt-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Requested By</TableHead>
                        <TableHead>Vessel</TableHead>
                        <TableHead>Date Range</TableHead>
                        <TableHead>Days</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedTestimonials.map((group, groupIndex) => {
                        const isExpanded = expandedGroups.has(group.userId);
                        const hasMultipleRequests = group.testimonials.length > 1;
                        const visibleTestimonials = isExpanded || !hasMultipleRequests 
                          ? group.testimonials 
                          : [group.testimonials[0]]; // Only show first (most recent) if collapsed
                        const hiddenCount = hasMultipleRequests && !isExpanded 
                          ? group.testimonials.length - 1 
                          : 0;

                        return (
                          <React.Fragment key={group.userId}>
                            {visibleTestimonials.map((testimonial, index) => (
                              <TableRow 
                                key={testimonial.id} 
                                className={`hover:bg-muted/50 transition-colors ${index === 0 && groupIndex > 0 ? 'border-t-2 border-border' : ''} ${index > 0 ? 'bg-muted/20' : ''}`}
                              >
                      <TableCell className="font-medium">
                                  {index === 0 ? (
                        <div className="flex items-center gap-2">
                                      {hasMultipleRequests && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6"
                                          onClick={() => toggleGroup(group.userId)}
                                        >
                                          {isExpanded ? (
                                            <ChevronUp className="h-4 w-4" />
                                          ) : (
                                            <ChevronDown className="h-4 w-4" />
                                          )}
                                        </Button>
                                      )}
                          <div>
                                        <div className="font-semibold">{getUserName(testimonial)}</div>
                            {(testimonial.user as any)?.email && (
                              <div className="text-xs text-muted-foreground">
                                {(testimonial.user as any).email}
                              </div>
                                        )}
                                        {hasMultipleRequests && (
                                          <div className="text-xs text-muted-foreground mt-1">
                                            {group.testimonials.length} request{group.testimonials.length !== 1 ? 's' : ''}
                                            {hiddenCount > 0 && (
                                              <span className="ml-1">({hiddenCount} hidden)</span>
                            )}
                          </div>
                                        )}
                        </div>
                                    </div>
                                  ) : (
                                    <div className="pl-8 text-sm">
                                      <div className="text-muted-foreground italic">
                                        Additional request from same crew member
                                      </div>
                                    </div>
                                  )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Ship className="h-4 w-4 text-muted-foreground" />
                          {getVesselName(testimonial.vessel_id)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <div className="text-sm">
                            {format(new Date(testimonial.start_date), 'MMM d, yyyy')} - {format(new Date(testimonial.end_date), 'MMM d, yyyy')}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5 text-sm">
                          <div className="font-medium">Total: {testimonial.total_days}</div>
                          <div className="text-xs text-muted-foreground">
                            At Sea: {testimonial.at_sea_days} | Standby: {testimonial.standby_days}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          {format(new Date(testimonial.created_at), 'MMM d, yyyy')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          onClick={() => openActionDialog(testimonial, 'approve')}
                          size="sm"
                          variant="outline"
                          className="rounded-lg"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                      ))}
                          </React.Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                  </TabsContent>
                  
                  <TabsContent value="approved" className="mt-0">
                    {approvedTestimonials.length === 0 ? (
                      <div className="p-8 text-center">
                        <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No Approved Testimonials</h3>
                        <p className="text-sm text-muted-foreground">
                          You haven't approved any testimonials yet.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Requested By</TableHead>
                              <TableHead>Vessel</TableHead>
                              <TableHead>Date Range</TableHead>
                              <TableHead>Days</TableHead>
                              <TableHead>Approved</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {approvedTestimonials.map((testimonial) => (
                              <TableRow key={testimonial.id} className="hover:bg-muted/50 transition-colors">
                                <TableCell className="font-medium">
                                  <div>
                                    <div className="font-semibold">{getUserName(testimonial)}</div>
                                    {(testimonial.user as any)?.email && (
                                      <div className="text-xs text-muted-foreground">
                                        {(testimonial.user as any).email}
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Ship className="h-4 w-4 text-muted-foreground" />
                                    {getVesselName(testimonial.vessel_id)}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                    <div className="text-sm">
                                      {format(new Date(testimonial.start_date), 'MMM d, yyyy')} - {format(new Date(testimonial.end_date), 'MMM d, yyyy')}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="space-y-0.5 text-sm">
                                    <div className="font-medium">Total: {testimonial.total_days}</div>
                                    <div className="text-xs text-muted-foreground">
                                      At Sea: {testimonial.at_sea_days} | Standby: {testimonial.standby_days}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                    {testimonial.signoff_used_at 
                                      ? format(new Date(testimonial.signoff_used_at), 'MMM d, yyyy')
                                      : format(new Date(testimonial.updated_at), 'MMM d, yyyy')}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
                                    <CheckCircle2 className="mr-1 h-3 w-3" />Approved
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}

          {/* Captaincy Requests Section (Admin only) */}
          {isAdmin && captaincyRequests.length > 0 && (
            <Card className="rounded-xl border shadow-sm">
              <CardHeader>
                <CardTitle>Captaincy Requests</CardTitle>
                <CardDescription>Review and respond to captaincy/claim requests from captains</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Requested By</TableHead>
                        <TableHead>Vessel</TableHead>
                        <TableHead>Requested Role</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {captaincyRequests.map((request) => (
                        <TableRow key={request.id} className="hover:bg-muted/50 transition-colors">
                          <TableCell className="font-medium">
                              <div>
                                <div>{getUserName(request as any)}</div>
                                {(request.user as any)?.email && (
                                  <div className="text-xs text-muted-foreground">
                                    {(request.user as any).email}
                                  </div>
                                )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Ship className="h-4 w-4 text-muted-foreground" />
                              {(request.vessel as any)?.name || getVesselName(request.vessel_id)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{request.requested_role || 'captain'}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              {format(new Date(request.created_at || new Date()), 'MMM d, yyyy')}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                onClick={() => openCaptaincyActionDialog(request, 'approve')}
                                size="sm"
                                className="rounded-lg bg-green-600 hover:bg-green-700"
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Approve
                              </Button>
                              <Button
                                onClick={() => openCaptaincyActionDialog(request, 'reject')}
                                size="sm"
                                variant="destructive"
                                className="rounded-lg"
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Action Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="rounded-xl max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {action === 'approve' ? 'Review Testimonial Request' : 'Reject Testimonial'}
            </DialogTitle>
            <DialogDescription>
              {action === 'approve' 
                ? 'Review the requested dates and compare with actual vessel logs before approving.'
                : 'Please provide a reason for rejecting this testimonial request.'}
            </DialogDescription>
          </DialogHeader>
          {selectedTestimonial && (
            <div className="space-y-6 py-4">
              {/* Header Info - Cleaner Layout */}
              <div className="grid grid-cols-2 gap-4 pb-4 border-b">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Requested By</div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold text-base">{getUserName(selectedTestimonial)}</span>
                </div>
                  {(selectedTestimonial.user as any)?.email && (
                    <div className="text-xs text-muted-foreground mt-1 ml-6">
                      {(selectedTestimonial.user as any).email}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Vessel</div>
                  <div className="flex items-center gap-2">
                    <Ship className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold text-base">{getVesselName(selectedTestimonial.vessel_id)}</span>
                  </div>
                </div>
              </div>

              {/* Date Comparison - Show for approve action, but also allow rejection from this view */}
              {action === 'approve' && (
                <div className="space-y-6">
                  {/* Requested Date Range - Simplified */}
                  <div className="bg-muted/30 rounded-lg p-4 border">
                    <div className="flex items-center gap-2 mb-3">
                      <Calendar className="h-5 w-5 text-primary" />
                      <span className="font-semibold">Requested Date Range</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                  <div>
                        <div className="text-xs text-muted-foreground mb-1">Start Date</div>
                        <div className="font-medium">{format(new Date(selectedTestimonial.start_date), 'MMM d, yyyy')}</div>
                          </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">End Date</div>
                        <div className="font-medium">{format(new Date(selectedTestimonial.end_date), 'MMM d, yyyy')}</div>
                          </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Total Days</div>
                        <div className="font-semibold text-lg">{selectedTestimonial.total_days} days</div>
                          </div>
                          </div>
                        </div>

                    {/* Date Comparison View */}
                    {isLoadingLogs ? (
                      <div className="bg-muted/30 rounded-lg p-8 border">
                        <div className="flex items-center justify-center gap-3">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          <span className="text-sm font-medium">Loading vessel logs...</span>
                          </div>
                      </div>
                    ) : vesselStateLogs.length > 0 || allVesselLogs.length > 0 ? (
                      <DateComparisonView 
                        requestedStart={selectedTestimonial.start_date}
                        requestedEnd={selectedTestimonial.end_date}
                        requestedDays={selectedTestimonial.total_days}
                        actualLogs={vesselStateLogs}
                        vesselLogs={allVesselLogs}
                        testimonial={selectedTestimonial}
                        onComparisonChange={setComparisonData}
                      />
                    ) : (
                      <div className="bg-yellow-50 dark:bg-yellow-950/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-xl p-5">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                            <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 mb-1">No Logs Found</p>
                            <p className="text-xs text-yellow-700 dark:text-yellow-300">
                                No logged dates found for this user on this vessel. Please verify the date range before approving.
                              </p>
                            </div>
                          </div>
                  </div>
                    )}

                  {/* Captain Comments Section */}
                  <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold mb-1">Captain Comments *</h3>
                        <p className="text-xs text-muted-foreground">
                          Please provide comments on the following areas. These will be included in the testimonial document.
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="comment-conduct" className="text-sm font-medium">
                          Conduct *
                        </Label>
                        <Textarea
                          id="comment-conduct"
                          placeholder="Comment on the seafarer's conduct..."
                          value={commentConduct}
                          onChange={(e) => setCommentConduct(e.target.value)}
                          rows={2}
                          className="rounded-lg bg-background resize-none"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="comment-ability" className="text-sm font-medium">
                          Ability *
                        </Label>
                        <Textarea
                          id="comment-ability"
                          placeholder="Comment on the seafarer's ability..."
                          value={commentAbility}
                          onChange={(e) => setCommentAbility(e.target.value)}
                          rows={2}
                          className="rounded-lg bg-background resize-none"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="comment-general" className="text-sm font-medium">
                          General Comments *
                        </Label>
                        <Textarea
                          id="comment-general"
                          placeholder="Any additional general comments..."
                          value={commentGeneral}
                          onChange={(e) => setCommentGeneral(e.target.value)}
                          rows={2}
                          className="rounded-lg bg-background resize-none"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Captain Signature Preview */}
                  {captainSignature ? (
                    <div className="bg-muted/30 rounded-lg p-4 border">
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Your Signature Preview</Label>
                        <p className="text-xs text-muted-foreground mb-2">
                          This signature will be added to the testimonial PDF. Please confirm it is correct.
                        </p>
                        <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border-2 border-dashed border-primary/30 flex items-center justify-center min-h-[80px]">
                          <img
                            src={captainSignature}
                            alt="Captain signature preview"
                            className="max-h-[60px] max-w-full object-contain"
                          />
                        </div>
                        <div className="flex items-start gap-2 pt-2">
                          <Checkbox
                            id="signature-approval"
                            checked={signatureApproved}
                            onCheckedChange={(checked) => setSignatureApproved(checked === true)}
                            className="mt-0.5"
                          />
                          <div className="flex-1">
                            <Label htmlFor="signature-approval" className="text-sm font-medium cursor-pointer">
                              I approve the use of this signature on the testimonial PDF
                            </Label>
                            <p className="text-xs text-muted-foreground mt-1">
                              You can change your signature at any time in Settings → Signature
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-yellow-50 dark:bg-yellow-950/20 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 mb-1">
                            No Signature Found
                          </p>
                          <p className="text-xs text-yellow-700 dark:text-yellow-300">
                            You don't have a signature saved. Please add your signature in Settings → Signature before approving testimonials.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Rejection Reason Field - Collapsible section */}
                  <div className="bg-muted/30 rounded-lg p-4 border">
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="rejection-reason-review" className="text-sm font-medium">Rejection Reason (Optional)</Label>
                        <p className="text-xs text-muted-foreground mt-1 mb-2">
                          If you need to reject this request, provide a reason below.
                          {comparisonData && comparisonData.discrepancies && comparisonData.discrepancies.length > 0 && (
                            <span className="block mt-1 text-yellow-700 dark:text-yellow-300 font-medium">
                              ⚠️ {comparisonData.discrepancies.length} state mismatch{comparisonData.discrepancies.length !== 1 ? 'es' : ''} found. Mismatch details will be automatically included in the rejection message.
                            </span>
                          )}
                        </p>
                      </div>
                    <Textarea
                      id="rejection-reason-review"
                        placeholder="Enter rejection reason if needed..."
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                        className="rounded-lg min-h-[80px] bg-background"
                    />
                      {comparisonData && comparisonData.discrepancies && comparisonData.discrepancies.length > 0 && (
                        <div className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                          <p className="text-xs font-medium text-yellow-900 dark:text-yellow-100 mb-2">
                            Mismatch details that will be included:
                          </p>
                          <div className="text-xs text-yellow-800 dark:text-yellow-200 space-y-1 max-h-32 overflow-y-auto">
                            {comparisonData.discrepancies.slice(0, 5).map((day: any, idx: number) => (
                              <div key={idx} className="flex items-center gap-2">
                                <span className="font-medium">{format(new Date(day.date), 'MMM d')}:</span>
                                <span>Your log: <strong>{day.crewState === 'underway' ? 'At Sea' : day.crewState === 'at-anchor' ? 'At Anchor' : day.crewState === 'in-port' ? 'In Port' : day.crewState === 'in-yard' ? 'In Yard' : day.crewState}</strong></span>
                                <span>→</span>
                                <span>Vessel log: <strong>{day.vesselState === 'underway' ? 'At Sea' : day.vesselState === 'at-anchor' ? 'At Anchor' : day.vesselState === 'in-port' ? 'In Port' : day.vesselState === 'in-yard' ? 'In Yard' : day.vesselState}</strong></span>
                              </div>
                            ))}
                            {comparisonData.discrepancies.length > 5 && (
                              <p className="text-yellow-700 dark:text-yellow-300 italic mt-1">
                                +{comparisonData.discrepancies.length - 5} more mismatch{comparisonData.discrepancies.length - 5 !== 1 ? 'es' : ''}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {action === 'reject' && (
                <div className="space-y-2">
                  <Label htmlFor="rejection-reason">Rejection Reason *</Label>
                  <Textarea
                    id="rejection-reason"
                    placeholder="Please provide a reason for rejecting this request..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="rounded-lg min-h-[100px]"
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false);
                setSelectedTestimonial(null);
                setAction(null);
                setRejectionReason('');
                setCommentConduct('');
                setCommentAbility('');
                setCommentGeneral('');
                setCaptainSignature(null);
                setSignatureApproved(false);
                setComparisonData(null);
                setIsPasswordDialogOpen(false);
                setPassword('');
                setPasswordError('');
              }}
              disabled={isProcessing || isVerifyingPassword}
              className="rounded-xl"
            >
              Cancel
            </Button>
            {action === 'approve' && (
              <>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={isProcessing || isVerifyingPassword || !rejectionReason.trim()}
                  className="rounded-xl"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={isProcessing || isVerifyingPassword || !commentConduct.trim() || !commentAbility.trim() || !commentGeneral.trim() || !captainSignature || !signatureApproved}
                  className="rounded-xl bg-green-600 hover:bg-green-700"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Approve
                    </>
                  )}
                </Button>
              </>
            )}
            {action === 'reject' && (
              <Button
                onClick={handleReject}
                disabled={isProcessing || !rejectionReason.trim()}
                variant="destructive"
                className="rounded-xl"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Reject'
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Captain Role Application Action Dialog */}
      <Dialog open={isCaptainRoleDialogOpen} onOpenChange={setIsCaptainRoleDialogOpen}>
        <DialogContent className="rounded-xl max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {action === 'approve' ? 'Approve Captain Role Application' : 'Reject Captain Role Application'}
            </DialogTitle>
            <DialogDescription>
              {action === 'approve' 
                ? 'Are you sure you want to approve this application and grant the captain role?'
                : 'Please provide a reason for rejecting this application.'}
            </DialogDescription>
          </DialogHeader>
          {selectedCaptainRoleApplication && (
            <div className="space-y-4 py-4">
              {console.log('[INBOX] Rendering dialog with selectedCaptainRoleApplication:', {
                id: selectedCaptainRoleApplication.id,
                supporting_documents: selectedCaptainRoleApplication.supporting_documents,
                supporting_documents_type: typeof selectedCaptainRoleApplication.supporting_documents,
                is_array: Array.isArray(selectedCaptainRoleApplication.supporting_documents),
                length: selectedCaptainRoleApplication.supporting_documents?.length,
              })}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Applicant:</span>
                  <span className="font-medium">{getUserName(selectedCaptainRoleApplication)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium">{(selectedCaptainRoleApplication.user as any)?.email || 'N/A'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Position:</span>
                  <span className="font-medium">{(selectedCaptainRoleApplication.user as any)?.position || 'N/A'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Submitted:</span>
                  <span className="font-medium">
                    {format(new Date(selectedCaptainRoleApplication.created_at || new Date()), 'MMM d, yyyy')}
                  </span>
                </div>
              </div>

              {/* Supporting Documents - Always show this section */}
              <div className="space-y-2">
                <Label>Supporting Documents</Label>
                {(() => {
                  // Handle both snake_case and camelCase field names, and ensure it's an array
                  const docs = (selectedCaptainRoleApplication.supporting_documents || 
                               (selectedCaptainRoleApplication as any).supportingDocuments) || [];
                  const documentsArray = Array.isArray(docs) ? docs : [];
                  
                  console.log('[INBOX] Supporting documents check:', {
                    raw: selectedCaptainRoleApplication.supporting_documents,
                    camelCase: (selectedCaptainRoleApplication as any).supportingDocuments,
                    docs,
                    documentsArray,
                    length: documentsArray.length,
                    isArray: Array.isArray(docs),
                  });
                  
                  if (documentsArray.length > 0) {
                    return (
                      <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-4 bg-muted/30">
                        {documentsArray.map((doc: string, index: number) => {
                          const docUrl = typeof doc === 'string' ? doc : String(doc);
                          return (
                            <div key={index} className="flex items-start gap-2 p-2 rounded-lg bg-background border hover:bg-muted/50 transition-colors">
                              <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <a 
                                href={docUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 hover:underline break-all text-sm flex-1"
                              >
                                {docUrl}
                              </a>
                            </div>
                          );
                        })}
                      </div>
                    );
                  } else {
                    return (
                      <div className="border rounded-lg p-4 bg-muted/30 text-sm text-muted-foreground italic">
                        No supporting documents provided
                      </div>
                    );
                  }
                })()}
              </div>

              {/* Notes */}
              {selectedCaptainRoleApplication.notes && (
                <div className="space-y-2">
                  <Label>Additional Notes</Label>
                  <div className="text-sm text-muted-foreground border rounded-lg p-3 bg-muted/50">
                    {selectedCaptainRoleApplication.notes}
                  </div>
                </div>
              )}

              {action === 'reject' && (
                <div className="space-y-2">
                  <Label htmlFor="captain-role-rejection-reason">Rejection Reason *</Label>
                  <Textarea
                    id="captain-role-rejection-reason"
                    placeholder="Please provide a reason for rejecting this application..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="rounded-lg min-h-[100px]"
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCaptainRoleDialogOpen(false);
                setSelectedCaptainRoleApplication(null);
                setAction(null);
                setRejectionReason('');
              }}
              disabled={isProcessing}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={action === 'approve' ? handleApproveCaptainRole : handleRejectCaptainRole}
              disabled={isProcessing}
              className={action === 'approve' ? 'rounded-xl bg-green-600 hover:bg-green-700' : 'rounded-xl'}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                action === 'approve' ? 'Approve' : 'Reject'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Captaincy Action Dialog */}
      <Dialog open={isCaptaincyDialogOpen} onOpenChange={setIsCaptaincyDialogOpen}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>
              {action === 'approve' ? 'Approve Captaincy Request' : 'Reject Captaincy Request'}
            </DialogTitle>
            <DialogDescription>
              {action === 'approve' 
                ? 'Are you sure you want to approve this captaincy request?'
                : 'Please provide a reason for rejecting this captaincy request.'}
            </DialogDescription>
          </DialogHeader>
          {selectedCaptaincyRequest && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Requested By:</span>
                  <span className="font-medium">{getUserName(selectedCaptaincyRequest as any)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Vessel:</span>
                  <span className="font-medium">{(selectedCaptaincyRequest.vessel as any)?.name || getVesselName(selectedCaptaincyRequest.vessel_id)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Requested Role:</span>
                  <span className="font-medium">{selectedCaptaincyRequest.requested_role || 'captain'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Requested:</span>
                  <span className="font-medium">
                    {format(new Date(selectedCaptaincyRequest.created_at || new Date()), 'MMM d, yyyy')}
                  </span>
                </div>
              </div>
              {action === 'reject' && (
                <div className="space-y-2">
                  <Label htmlFor="captaincy-rejection-reason">Rejection Reason *</Label>
                  <Textarea
                    id="captaincy-rejection-reason"
                    placeholder="Please provide a reason for rejecting this request..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="rounded-lg min-h-[100px]"
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCaptaincyDialogOpen(false);
                setSelectedCaptaincyRequest(null);
                setAction(null);
                setRejectionReason('');
              }}
              disabled={isProcessing}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={action === 'approve' ? handleApproveCaptaincy : handleRejectCaptaincy}
              disabled={isProcessing}
              className={action === 'approve' ? 'rounded-xl bg-green-600 hover:bg-green-700' : 'rounded-xl'}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                action === 'approve' ? 'Approve' : 'Reject'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sea Time Request Action Dialog */}
      <Dialog open={isSeaTimeDialogOpen} onOpenChange={setIsSeaTimeDialogOpen}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>
              {action === 'approve' ? 'Approve Sea Time Request' : 'Reject Sea Time Request'}
            </DialogTitle>
            <DialogDescription>
              {action === 'approve' 
                ? 'Are you sure you want to approve this request? The vessel\'s sea time logs for this date range will be copied to the crew member.'
                : 'Please provide a reason for rejecting this sea time request.'}
            </DialogDescription>
          </DialogHeader>
          {selectedSeaTimeRequest && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Requested By:</span>
                  <span className="font-medium">{getUserName(selectedSeaTimeRequest as any)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Vessel:</span>
                  <span className="font-medium">{(selectedSeaTimeRequest.vessel as any)?.name || getVesselName(selectedSeaTimeRequest.vesselId)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Date Range:</span>
                  <span className="font-medium">
                    {(() => {
                      const startDateStr = selectedSeaTimeRequest.startDate;
                      const endDateStr = selectedSeaTimeRequest.endDate;
                      if (!startDateStr || !endDateStr) return '—';
                      
                      const startDate = parse(startDateStr, 'yyyy-MM-dd', new Date());
                      const endDate = parse(endDateStr, 'yyyy-MM-dd', new Date());
                      if (isValid(startDate) && isValid(endDate)) {
                        return `${format(startDate, 'MMM d, yyyy')} - ${format(endDate, 'MMM d, yyyy')}`;
                      }
                      return `${startDateStr} - ${endDateStr}`;
                    })()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Days:</span>
                  <span className="font-medium">
                    {(() => {
                      const startDateStr = selectedSeaTimeRequest.startDate;
                      const endDateStr = selectedSeaTimeRequest.endDate;
                      if (!startDateStr || !endDateStr) return '—';
                      
                      const startDate = parse(startDateStr, 'yyyy-MM-dd', new Date());
                      const endDate = parse(endDateStr, 'yyyy-MM-dd', new Date());
                      if (isValid(startDate) && isValid(endDate)) {
                        return `${differenceInDays(endDate, startDate) + 1} days`;
                      }
                      return '—';
                    })()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Requested:</span>
                  <span className="font-medium">
                    {selectedSeaTimeRequest.createdAt ? (() => {
                      const date = new Date(selectedSeaTimeRequest.createdAt);
                      return isValid(date) ? format(date, 'MMM d, yyyy') : '—';
                    })() : '—'}
                  </span>
                </div>
              </div>

              {action === 'reject' && (
                <div className="space-y-2">
                  <Label htmlFor="sea-time-rejection-reason">Rejection Reason</Label>
                  <Textarea
                    id="sea-time-rejection-reason"
                    placeholder="Please provide a reason for rejecting this request..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="resize-none"
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsSeaTimeDialogOpen(false);
                setSelectedSeaTimeRequest(null);
                setAction(null);
                setRejectionReason('');
              }}
              disabled={isProcessing}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={action === 'approve' ? handleApproveSeaTimeRequest : handleRejectSeaTimeRequest}
              disabled={isProcessing}
              className={action === 'approve' ? 'rounded-xl bg-green-600 hover:bg-green-700' : 'rounded-xl'}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                action === 'approve' ? 'Approve' : 'Reject'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Verification Dialog */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent className="rounded-xl max-w-md">
          <DialogHeader>
            <DialogTitle>Verify Your Identity</DialogTitle>
            <DialogDescription>
              For security purposes, please enter your password to approve this testimonial.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="approval-password">Password</Label>
              <Input
                id="approval-password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isVerifyingPassword) {
                    verifyPasswordAndApprove();
                  }
                }}
                disabled={isVerifyingPassword}
                className="rounded-lg"
                autoFocus
              />
              {passwordError && (
                <p className="text-sm text-destructive">{passwordError}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsPasswordDialogOpen(false);
                setPassword('');
                setPasswordError('');
              }}
              disabled={isVerifyingPassword}
            >
              Cancel
            </Button>
            <Button
              onClick={verifyPasswordAndApprove}
              disabled={isVerifyingPassword || !password}
              className="bg-green-600 hover:bg-green-700"
            >
              {isVerifyingPassword ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Verify & Approve
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
