'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useEffect, useRef } from 'react';
import { createTour } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Sparkles } from 'lucide-react';

const initialState = {
  message: '',
  data: undefined,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
      {pending ? 'Generating...' : 'Generate Your Adventure'}
    </Button>
  );
}

const AITourGenerator = () => {
  const [state, formAction] = useFormState(createTour, initialState);
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.message) {
      if(state.data) {
         toast({
          title: "Success!",
          description: state.message,
        });
        formRef.current?.reset();
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: state.message,
        });
      }
    }
  }, [state, toast]);

  return (
    <section id="ai-tool" className="py-16 sm:py-24 bg-primary/5">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-headline text-3xl font-bold tracking-tight text-primary sm:text-4xl">
            Craft Your Dream Trip with AI
          </h2>
          <p className="mt-4 text-lg leading-8 text-foreground/80">
            Describe your perfect getaway, and our AI will build a personalized itinerary just for you.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
          <Card className="shadow-lg">
            <form ref={formRef} action={formAction}>
              <CardHeader>
                <CardTitle>Tour Details</CardTitle>
                <CardDescription>Tell us where you want to go and what you love to do.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="location">Destination</Label>
                  <Input id="location" name="location" placeholder="e.g., The coast of Italy" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration">Trip Duration</Label>
                  <Input id="duration" name="duration" placeholder="e.g., 7 days" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="interests">Interests</Label>
                  <Textarea id="interests" name="interests" placeholder="e.g., Ancient history, beaches, authentic food" required />
                </div>
              </CardContent>
              <CardFooter>
                <SubmitButton />
              </CardFooter>
            </form>
          </Card>
          
          <Card className="flex flex-col shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-accent" />
                Your AI-Generated Itinerary
              </CardTitle>
              <CardDescription>
                Your personalized tour plan will appear here.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow overflow-y-auto">
              {state.data?.tourDetails ? (
                <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap rounded-md bg-muted p-4">
                  {state.data.tourDetails}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center rounded-md border border-dashed p-8 text-center text-muted-foreground">
                  <p>Awaiting your travel dreams...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default AITourGenerator;
