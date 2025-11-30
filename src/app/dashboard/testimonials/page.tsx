
'use client';

import { useState, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, Timestamp } from 'firebase/firestore';
import { LifeBuoy, Loader2, Star, Quote, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

type Testimonial = {
  id: string;
  userProfileId: string;
  content: string;
  rating: number;
  dateCreated: Timestamp;
};

const StarRating = ({ rating }: { rating: number }) => {
    return (
        <div className="flex items-center">
            {[...Array(5)].map((_, i) => (
                <Star
                    key={i}
                    className={`h-5 w-5 ${i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`}
                />
            ))}
        </div>
    );
};

export default function TestimonialsPage() {
    const { user } = useUser();
    const firestore = useFirestore();

    const testimonialsCollectionRef = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        return collection(firestore, 'users', user.uid, 'testimonials');
    }, [user, firestore]);

    const { data: testimonials, isLoading } = useCollection<Testimonial>(testimonialsCollectionRef);

    const sortedTestimonials = useMemo(() => {
        if (!testimonials) return [];
        return [...testimonials].sort((a, b) => b.dateCreated.seconds - a.dateCreated.seconds);
    }, [testimonials]);


    return (
        <div className="w-full max-w-7xl mx-auto space-y-8">
            <div className="flex items-center gap-3">
                <LifeBuoy className="h-6 w-6" />
                <div>
                    <CardTitle className="text-2xl">Testimonials</CardTitle>
                    <CardDescription>View and manage the testimonials you've received.</CardDescription>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                </div>
            ) : sortedTestimonials.length > 0 ? (
                <div className="grid grid-cols-1 gap-8">
                    {sortedTestimonials.map(testimonial => (
                        <Card key={testimonial.id} className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg">
                            <CardHeader>
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-4">
                                        <Avatar>
                                            <AvatarFallback>??</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="font-semibold">From Captain/Superior</p>
                                            <p className="text-sm text-muted-foreground">Vessel Name</p>
                                        </div>
                                    </div>
                                    <StarRating rating={testimonial.rating} />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <blockquote className="relative border-l-4 border-muted pl-6">
                                    <Quote className="absolute -top-1 -left-1 h-8 w-8 text-muted/50" />
                                    <p className="text-foreground/80 italic">{testimonial.content}</p>
                                </blockquote>
                                <div className="flex items-center justify-end text-sm text-muted-foreground mt-4 gap-2">
                                    <Calendar className="h-4 w-4" />
                                    <span>{format(new Date(testimonial.dateCreated.seconds * 1000), 'dd MMM, yyyy')}</span>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-xl">
                    <LifeBuoy className="h-16 w-16 text-muted-foreground" />
                    <h3 className="mt-4 text-xl font-semibold">No Testimonials Yet</h3>
                    <p className="mt-1 text-muted-foreground">You haven't received any testimonials.</p>
                </div>
            )}
        </div>
    );
}
