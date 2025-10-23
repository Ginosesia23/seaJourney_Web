import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Quote } from 'lucide-react';
import { PlaceHolderImages } from '@/lib/placeholder-images';

const testimonialsData = [
  {
    id: 'user1',
    quote: "The AI tour generator is a game-changer! It planned my entire 2-week trip to Southeast Asia flawlessly. I discovered places I would have never found on my own.",
    name: 'Alex Johnson',
    location: 'San Francisco, CA',
  },
  {
    id: 'user2',
    quote: "I used to spend weeks planning trips. With SeaJourney, I had a detailed, personalized itinerary in minutes. The AI understood my interests perfectly.",
    name: 'Samantha Lee',
    location: 'London, UK',
  },
  {
    id: 'user3',
    quote: "As a solo traveler, the AI-generated tips and suggestions were invaluable. It felt like having a local guide in my pocket. Highly recommend!",
    name: 'David Chen',
    location: 'Sydney, AU',
  },
];

const Testimonials = () => {
  return (
    <section id="testimonials" className="py-16 sm:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-headline text-3xl font-bold tracking-tight text-primary sm:text-4xl">
            Loved by Travelers Worldwide
          </h2>
          <p className="mt-4 text-lg leading-8 text-foreground/80">
            Don't just take our word for it. Here's what our users have to say about the AI-powered tour creator.
          </p>
        </div>
        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 lg:max-w-none lg:grid-cols-3">
          {testimonialsData.map((testimonial) => {
            const image = PlaceHolderImages.find(p => p.id === testimonial.id);
            return (
              <Card key={testimonial.name} className="flex flex-col justify-between shadow-lg transition-shadow duration-300 hover:shadow-xl">
                <CardContent className="flex-grow p-6">
                  <Quote className="h-8 w-8 text-primary/20" />
                  <blockquote className="mt-4 text-lg text-foreground/90">
                    "{testimonial.quote}"
                  </blockquote>
                </CardContent>
                <div className="mt-4 flex items-center gap-4 border-t bg-primary/5 p-6">
                  {image && (
                    <Image
                      src={image.imageUrl}
                      alt={`Avatar of ${testimonial.name}`}
                      width={48}
                      height={48}
                      className="h-12 w-12 rounded-full object-cover"
                      data-ai-hint={image.imageHint}
                    />
                  )}
                  <div>
                    <p className="font-bold text-primary">{testimonial.name}</p>
                    <p className="text-sm text-foreground/70">{testimonial.location}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
