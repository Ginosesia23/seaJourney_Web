
'use client';

import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { User, Ship, CalendarDays, FileSignature, FileText, PlusCircle, ArrowRight, Star, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const steps = [
  {
    icon: <User className="h-8 w-8 text-accent" />,
    title: '1. Set Up Your Profile',
    description: "Create your account and fill in your professional details to get started. This information will be used for your official documents.",
    component: (
        <Card className="w-full max-w-sm mx-auto bg-black/20 border-primary/20 backdrop-blur-sm text-white">
            <CardHeader>
                <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16">
                        <AvatarFallback className="bg-primary/80 text-primary-foreground text-xl">JD</AvatarFallback>
                    </Avatar>
                    <div>
                        <CardTitle className="text-white">Jane Doe</CardTitle>
                        <CardDescription className="text-white/70">@janedoe</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between items-center p-2 rounded-md bg-white/5">
                    <span className="text-white/70">Email</span>
                    <span className="font-medium">j.doe@sea.com</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded-md bg-white/5">
                    <span className="text-white/70">Subscription</span>
                    <Badge variant="secondary" className="bg-accent/20 text-accent border-accent/30">Premium</Badge>
                </div>
            </CardContent>
        </Card>
    )
  },
  {
    icon: <Ship className="h-8 w-8 text-accent" />,
    title: '2. Add Your Vessels',
    description: "Easily add the vessels you've worked on. Include details like the vessel name, type, and official number for accurate record-keeping.",
     component: (
        <Card className="w-full max-w-sm mx-auto bg-black/20 border-primary/20 backdrop-blur-sm text-white">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-white text-lg">Your Vessels</CardTitle>
                <Button variant="ghost" size="icon" className="text-accent h-8 w-8"><PlusCircle className="h-5 w-5" /></Button>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow className="border-white/10">
                            <TableHead className="text-white/80">Vessel</TableHead>
                            <TableHead className="text-white/80">Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow className="border-white/10 hover:bg-white/5">
                            <TableCell className="font-medium text-white">M/Y Odyssey</TableCell>
                            <TableCell><Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30">Current</Badge></TableCell>
                        </TableRow>
                        <TableRow className="border-white/10 hover:bg-white/5">
                            <TableCell className="font-medium text-white">S/Y Wanderer</TableCell>
                            <TableCell><Badge variant="outline" className="border-white/20 text-white/60">Past</Badge></TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    )
  },
  {
    icon: <CalendarDays className="h-8 w-8 text-accent" />,
    title: '3. Log Your Sea Time',
    description: "Log your sea days with our intuitive calendar. Just select the dates, and the app will calculate your time for you.",
    component: (
        <Card className="w-full max-w-sm mx-auto bg-black/20 border-primary/20 backdrop-blur-sm text-white p-4">
            <div className="text-center font-bold mb-2">May 2024</div>
            <div className="grid grid-cols-7 gap-1 text-xs text-center text-white/60 mb-2">
                <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-sm">
                {Array.from({length: 31}).map((_, i) => {
                    const day = i + 1;
                    const isSeaDay = [3,4,5,10,11,12,13,14,18,19,25,26,27].includes(day);
                    const isPortDay = [1,2,6,7,8,9,15,16,17,20,21,22,23,24,28,29,30,31].includes(day);
                    return (
                        <div key={i} className={cn(
                            "h-8 w-8 flex items-center justify-center rounded-full",
                            isSeaDay && "bg-accent text-accent-foreground",
                            isPortDay && "bg-green-500/80 text-white",
                            !isSeaDay && !isPortDay && "text-white/50"
                        )}>
                            {day}
                        </div>
                    )
                })}
            </div>
        </Card>
    )
  },
  {
    icon: <FileSignature className="h-8 w-8 text-accent" />,
    title: '4. Request Digital Testimonials',
    description: "Generate a sea time testimonial and send a secure link to your captain or superior to get it digitally signed.",
    component: (
       <Card className="w-full max-w-sm mx-auto bg-black/20 border-primary/20 backdrop-blur-sm text-white">
            <CardHeader className="text-center items-center">
                <FileSignature className="h-10 w-10 text-accent mb-2" />
                <CardTitle className="text-white">Request Signature</CardTitle>
                <CardDescription className="text-white/70">Generate a secure link for Capt. Smith to sign off on your sea time for M/Y Odyssey.</CardDescription>
            </CardHeader>
            <CardContent className="text-center">
                <Button variant="accent" className="w-full rounded-lg">Generate & Send Request</Button>
            </CardContent>
        </Card>
    )
  },
  {
    icon: <FileText className="h-8 w-8 text-accent" />,
    title: '5. Export Your Documents',
    description: "When you're ready to apply for a new certificate, export all your logged sea time and signed testimonials into a single, professional PDF.",
    component: (
        <Card className="w-full max-w-sm mx-auto bg-black/20 border-primary/20 backdrop-blur-sm text-white">
             <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-white/80">
                    <FileText className="h-5 w-5" />
                    Export Center
                </CardTitle>
                 <CardDescription className="text-white/50">One-click professional documents.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm p-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer transition-colors">
                    <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-white/70" />
                        <span className="text-white">Full Sea Time Report.pdf</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-white/50" />
                </div>
                 <div className="flex items-center justify-between text-sm p-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer transition-colors">
                     <div className="flex items-center gap-3">
                        <Star className="h-4 w-4 text-white/70" />
                        <span className="text-white">Testimonial_Capt_Smith.pdf</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-white/50" />
                </div>
            </CardContent>
        </Card>
    )
  },
  {
    icon: <ShieldCheck className="h-8 w-8 text-accent" />,
    title: '6. Request Official Approval',
    description: "Submit your digitally signed and verified documents to maritime authorities for official review and certificate issuance.",
    comingSoon: true,
    component: (
      <Card className="w-full max-w-sm mx-auto bg-black/20 border-primary/20 backdrop-blur-sm text-white">
        <CardHeader className="text-center items-center">
            <ShieldCheck className="h-10 w-10 text-accent mb-2" />
            <CardTitle className="text-white">Submit to MCA</CardTitle>
            <CardDescription className="text-white/70">Send your verified documents for official review.</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
            <Button variant="accent" className="w-full rounded-lg" disabled>Submit for Approval</Button>
        </CardContent>
      </Card>
    )
  },
];

const StepSection = ({ step, index }: { step: (typeof steps)[0], index: number }) => {
  const isOdd = index % 2 === 1;
  
  return (
    <div className="py-12" style={{ backgroundColor: '#000b15' }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className={cn(
            "text-center lg:text-left",
            isOdd ? 'lg:order-2' : 'lg:order-1'
          )}>
            <div className="flex items-center justify-center lg:justify-start gap-3 mb-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                {step.icon}
              </div>
              {step.comingSoon && (
                <Badge className="px-3 py-1 rounded-full text-xs font-semibold border" style={{ backgroundColor: 'rgba(249, 115, 22, 0.2)', borderColor: 'rgba(249, 115, 22, 0.5)', color: '#fb923c' }}>
                  Coming Soon
                </Badge>
              )}
            </div>
            <h2 className="font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl">{step.title}</h2>
            <p className="mt-6 text-lg leading-8 text-blue-100">{step.description}</p>
          </div>
          <div className={cn(
            "flex justify-center",
            isOdd ? 'lg:order-1' : 'lg:order-2'
          )}>
            <div className="w-full max-w-md p-2 border rounded-xl backdrop-blur-sm" style={{ borderColor: 'rgba(255, 255, 255, 0.1)', backgroundColor: 'rgba(2, 22, 44, 0.5)' }}>
                 <div className="relative aspect-[4/3] w-full rounded-lg flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.3)' }}>
                    {step.component}
                 </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HowToUsePage() {

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: '#000b15' }}>
      <Header />
      <main className="flex-1">
        <section className="py-16 sm:py-24 text-center" style={{ backgroundColor: '#000b15' }}>
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl">
              <h1 className="font-headline text-4xl font-bold tracking-tight text-white sm:text-5xl">
                How to Use SeaJourney
              </h1>
              <p className="mt-4 text-lg leading-8 text-blue-100">
                Follow these simple steps to start tracking your sea time like a pro and accelerate your career.
              </p>
            </div>
          </div>
        </section>

        <section style={{ backgroundColor: '#000b15', color: '#ffffff' }} className="overflow-hidden">
             {steps.map((step, index) => (
               <StepSection key={index} step={step} index={index} />
             ))}
        </section>

      </main>
      <Footer />
    </div>
  );
}
