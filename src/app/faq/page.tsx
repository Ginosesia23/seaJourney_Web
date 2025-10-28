import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const faqData = [
  {
    question: 'What is SeaJourney?',
    answer:
      'SeaJourney is a digital logbook designed for maritime professionals to easily track their sea time, manage testimonials, and prepare documentation for certificate applications.',
  },
  {
    question: 'Who is SeaJourney for?',
    answer:
      'SeaJourney is for all maritime professionals, including yacht crew, deckhands, engineers, and captains, who need to maintain an accurate record of their time at sea.',
  },
  {
    question: 'How do I log my sea time?',
    answer:
      "You can easily add new entries for your sea time, including vessel details, dates, and your position. The app's intuitive interface makes logging quick and simple.",
  },
  {
    question: 'Can I get digital testimonials signed?',
    answer:
      'Yes, you can generate sea time testimonials within the app and have them digitally signed by your captain or chief engineer, making your documentation official and secure.',
  },
  {
    question: 'Is my data secure?',
    answer:
      'We take data security very seriously. All your information is securely stored and backed up, so you never have to worry about losing your valuable sea time records.',
  },
];

export default function FAQPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <section className="py-16 sm:py-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl">
              <div className="text-center">
                <h1 className="font-headline text-4xl font-bold tracking-tight text-primary sm:text-5xl">
                  Frequently Asked Questions
                </h1>
                <p className="mt-4 text-lg leading-8 text-foreground/80">
                  Have questions? We have answers. If you can't find what you're looking for, feel free to contact us.
                </p>
              </div>
              <div className="mt-12">
                <Accordion type="single" collapsible className="w-full">
                  {faqData.map((item, index) => (
                    <AccordionItem key={index} value={`item-${index}`}>
                      <AccordionTrigger className="text-left text-lg font-bold hover:no-underline">
                        {item.question}
                      </AccordionTrigger>
                      <AccordionContent className="text-base text-foreground/80">
                        {item.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}