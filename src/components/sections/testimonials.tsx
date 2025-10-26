import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Quote } from 'lucide-react';
import { PlaceHolderImages } from '@/lib/placeholder-images';

const testimonialsData = [
  {
    id: 'user1',
    quote: "SeaJourney is a must-have for any deckhand. It made applying for my Yachtmaster a breeze. No more messy spreadsheets!",
    name: 'Alex Johnson',
    title: 'First Mate',
  },
  {
    id: 'user2',
    quote: "Finally, a logbook that understands a seafarer's life. The testimonial export feature saved me hours of paperwork.",
    name: 'Samantha Lee',
    title: 'Chief Engineer',
  },
  {
    id: 'user3',
    quote: "As a captain, I recommend this to all my crew. It simplifies my job of signing off testimonials and tracking their progress.",
    name: 'David Chen',
    title: 'Captain',
  },
];

const Testimonials = () => {
  return (
    <section id="testimonials" className="py-16 sm:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-headline text-3xl font-bold tracking-tight text-primary sm:text-4xl">
            Trusted by Crew and Captains Alike
          </h2>
          <p className="mt-4 text-lg leading-8 text-foreground/80">
            See why maritime professionals around the world trust SeaJourney to manage their careers.
          </p>
        </div>
        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 lg:max-w-none lg:grid-cols-3">
          {testimonialsData.map((testimonial) => {
            const image = PlaceHolderImages.find(p => p.id === testimonial.id);
            return (
              <Card key={testimonial.name} className="flex flex-col justify-between shadow-lg transition-shadow duration-300 hover:shadow-xl bg-card text-card-foreground overflow-hidden">
                <CardContent className="flex-grow p-6">
                  <Quote className="h-8 w-8 text-primary" />
                  <blockquote className="mt-4 text-lg text-foreground/90">
                    "{testimonial.quote}"
                  </blockquote>
                </CardContent>
                <div className="flex items-center gap-4 bg-[hsl(222.2,84%,10.5%)] text-primary-foreground p-6">
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
                    <p className="font-bold text-white">{testimonial.name}</p>
                    <p className="text-sm text-primary-foreground/70">{testimonial.title}</p>
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
