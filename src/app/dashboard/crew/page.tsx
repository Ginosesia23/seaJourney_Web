
'use client';

import { useState, useMemo } from 'react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collectionGroup, query } from 'firebase/firestore';
import { MoreHorizontal, Loader2, Search, Users, User as UserIcon } from 'lucide-react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

interface UserProfile {
    id: string;
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    profilePicture?: string;
    registrationDate: string;
    role: 'crew' | 'vessel' | 'admin';
    subscriptionTier: string;
}

const getInitials = (name: string) => name ? name.split(' ').map((n) => n[0]).join('') : '';

export default function CrewPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const firestore = useFirestore();

    const profilesCollectionGroup = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collectionGroup(firestore, 'profile'));
    }, [firestore]);

    const { data: profiles, isLoading: isLoadingProfiles } = useCollection<UserProfile>(profilesCollectionGroup);
    
    const filteredProfiles = useMemo(() => {
        if (!profiles) return [];
        if (!searchTerm) return profiles;

        return profiles.filter(profile => {
            const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.toLowerCase();
            const username = profile.username.toLowerCase();
            const email = profile.email.toLowerCase();
            const lowercasedTerm = searchTerm.toLowerCase();

            return fullName.includes(lowercasedTerm) || 
                   username.includes(lowercasedTerm) || 
                   email.includes(lowercasedTerm);
        });
    }, [profiles, searchTerm]);

    const isLoading = isLoadingProfiles;

    return (
        <div className="w-full max-w-7xl mx-auto">
            <Card className="rounded-xl shadow-md transition-shadow hover:shadow-lg">
                <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <Users className="h-6 w-6" />
                            <CardTitle>Crew Members</CardTitle>
                        </div>
                        <CardDescription>View and manage all users on the platform.</CardDescription>
                    </div>
                    <div className="relative w-full sm:max-w-xs">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by name, username, or email..."
                            className="pl-8"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>User</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Subscription</TableHead>
                                <TableHead>Joined</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">
                                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                                    </TableCell>
                                </TableRow>
                            ) : filteredProfiles && filteredProfiles.length > 0 ? (
                                filteredProfiles.map((profile) => {
                                    const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
                                    const displayName = fullName || profile.username;
                                    const regDate = profile.registrationDate ? new Date(profile.registrationDate) : null;

                                    return (
                                        <TableRow key={profile.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-9 w-9">
                                                        <AvatarImage src={profile.profilePicture} alt={displayName} />
                                                        <AvatarFallback className="bg-primary/20">
                                                            {getInitials(displayName) || <UserIcon />}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <div className="font-medium">{displayName}</div>
                                                        <div className="text-sm text-muted-foreground">@{profile.username}</div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>{profile.email}</TableCell>
                                            <TableCell>
                                                <Badge variant={profile.subscriptionTier === 'free' ? 'outline' : 'secondary'}>
                                                    {profile.subscriptionTier}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {regDate && !isNaN(regDate.getTime()) ? format(regDate, 'dd MMM, yyyy') : 'N/A'}
                                            </TableCell>
                                            <TableCell>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0 rounded-full">
                                                            <span className="sr-only">Open menu</span>
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                        <DropdownMenuItem>View Profile</DropdownMenuItem>
                                                        <DropdownMenuItem>Assign to Vessel</DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem className="text-destructive">Remove User</DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">
                                        No users found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
