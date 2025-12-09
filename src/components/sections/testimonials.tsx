
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
    <section id="testimonials" className="py-16 sm:py-24" style={{ backgroundColor: '#000b15' }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Trusted by Crew and Captains Alike
          </h2>
          <p className="mt-4 text-lg leading-8 text-blue-100">
            See why maritime professionals around the world trust SeaJourney to manage their careers.
          </p>
        </div>
        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 lg:max-w-none lg:grid-cols-3">
          {testimonialsData.map((testimonial) => {
            const image = PlaceHolderImages.find(p => p.id === testimonial.id);
            return (
              <Card key={testimonial.name} className="flex flex-col justify-between shadow-lg transition-shadow duration-300 hover:shadow-xl backdrop-blur-sm overflow-hidden rounded-xl border" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                <CardContent className="flex-grow p-6">
                  <Quote className="h-8 w-8 text-blue-400" />
                  <blockquote className="mt-4 text-lg text-white">
                    "{testimonial.quote}"
                  </blockquote>
                </CardContent>
                <div className="flex items-center gap-4 p-6 border-t" style={{ backgroundColor: 'rgba(0, 22, 44, 0.3)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                  {image && (
                    <Image
                      src={image.imageUrl}
                      alt={`Avatar of ${testimonial.name}`}
                      width={48}
                      height={48}
                      className="h-12 w-12 rounded-full object-cover border-2 border-blue-700/50 shadow-sm"
                      data-ai-hint={image.imageHint}
                    />
                  )}
                  <div>
                    <p className="font-bold text-white">{testimonial.name}</p>
                    <p className="text-sm" style={{ color: '#c7d2fe' }}>{testimonial.title}</p>
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

    