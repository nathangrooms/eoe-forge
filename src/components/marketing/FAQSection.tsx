import { Card } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { motion } from 'framer-motion';
import { Section, SectionHeading } from '@/components/marketing/Section';

/* Answers must describe what the product actually does. The previous set
   asserted "bank-level encryption", "95%+ accuracy validated by the community",
   "analyzes thousands of high-performing decks" and "we're the only platform
   that…" — none of which was true or checkable.
​
   SEVEN QUESTIONS BECAME FIVE, AND THE IMPORTANT ONE MOVED.
​
   "Is it free?" was sixth of seven. It is the second thing every visitor wants
   to know and it is now the second question, as well as being on the hero's own
   meta line above the fold.
​
   Cut: "What does the storage feature actually do?" — there is an illustrated
   section on storage sixteen screens above, and "actually" is the page bracing
   for disbelief. And "Is this an official Wizards of the Coast product?" —
   the footer carries that text verbatim, two inches below this accordion. */
const faqs = [
  {
    question: 'What is DeckMatrix?',
    answer:
      'A deck builder and collection manager for Magic: The Gathering. What it does that others do ' +
      'not is keep track of where your cards physically are, so a decklist can tell you which box ' +
      'to open.',
  },
  {
    question: 'Is it free?',
    answer:
      'Yes, while DeckMatrix is in early access. There is no card required and no trial countdown. If paid ' +
      'plans are introduced later, existing accounts will be told before anything changes.',
  },
  {
    question: 'Where does the card data come from?',
    answer:
      'Scryfall. The full paper card pool is synced on a nightly schedule, so new sets become searchable ' +
      'shortly after Scryfall publishes them. Card images and rules text are Scryfall data.',
  },
  {
    question: 'Which formats can I build in?',
    answer:
      'Format legality comes straight from Scryfall, so Commander, Modern, Pioneer, Standard, Legacy, ' +
      'Vintage, Pauper and the rest. Commander gets the most tooling, since colour identity and ' +
      'singleton are handled in the builder itself.',
  },
  {
    question: 'How is collection value worked out?',
    answer:
      'Prices are captured daily and kept as history, so value is a trend over time rather than only a ' +
      'current figure. They are estimates from published market data and will not exactly match any ' +
      'particular seller or buylist.',
  },
];

export function FAQSection() {
  return (
    <Section id="faq">
      {/* Header.

          This was the one headline on the page that did not come from
          SectionHeading: `text-4xl md:text-6xl font-bold` against the shared
          `text-3xl sm:text-4xl lg:text-5xl font-semibold`, so the FAQ shouted a
          size and a weight louder than "Know which box it is in" — the page's
          actual argument. The outline Badge above it and the generic
          "Everything you need to know about DeckMatrix" line went with it: a
          bordered chip breaks design law 2, and the line said nothing the
          heading had not already said. */}
      <motion.div
        className="mb-9 sm:mb-16"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0, margin: '0px 0px -10% 0px' }}
      >
        <SectionHeading title="Frequently asked questions" />
      </motion.div>

      {/* FAQ Accordion */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0, margin: '0px 0px -10% 0px' }}
      >
        <Card className="border-0 bg-card/50 p-4 backdrop-blur-sm sm:p-6 md:p-8">
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`} className="border-b-0">
                <AccordionTrigger className="text-left hover:text-primary transition-colors">
                  <span className="font-semibold">{faq.question}</span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Card>
      </motion.div>

      {/* Contact CTA */}
      <motion.div
        className="text-center mt-9 sm:mt-12"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0, margin: '0px 0px -10% 0px' }}
      >
        {/* "Contact our support team" is a claim about a company with thirteen
            registered accounts. The address is true and friendlier, and it is
            the same address the link always pointed at. */}
        <p className="text-muted-foreground mb-4">
          Still have questions?
        </p>
        <a
          href="mailto:support@deckmatrix.com"
          className="inline-block py-2.5 font-medium text-primary hover:underline sm:py-0"
        >
          Email support@deckmatrix.com
        </a>
      </motion.div>
    </Section>
  );
}