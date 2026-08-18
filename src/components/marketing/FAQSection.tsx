import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { HelpCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { Section } from '@/components/marketing/Section';

/* Answers must describe what the product actually does. The previous set
   asserted "bank-level encryption", "95%+ accuracy validated by the community",
   "analyzes thousands of high-performing decks" and "we're the only platform
   that…" — none of which was true or checkable. */
const faqs = [
  {
    question: 'What is DeckMatrix?',
    answer:
      'A deck builder and collection manager for Magic: The Gathering. You catalogue the cards you own — ' +
      'including where they are physically stored — and build decks against that collection, so you always ' +
      'know what you already have and what you would still need to buy.',
  },
  {
    question: 'Where does the card data come from?',
    answer:
      'Scryfall. The full paper card pool is synced on a nightly schedule, so new sets become searchable ' +
      'shortly after Scryfall publishes them. Card images and rules text are Scryfall data.',
  },
  {
    question: 'What does the storage feature actually do?',
    answer:
      'You define your real containers — binders, deck boxes, bulk boxes — and assign cards to them, down to ' +
      'the slot. When a decklist calls for a card you own, DeckMatrix can tell you which container it is in ' +
      'rather than leaving you to search through everything.',
  },
  {
    question: 'How is collection value calculated?',
    answer:
      'Prices are captured on a daily schedule and stored as history, so value is shown as a trend over time ' +
      'rather than only a current figure. Prices are estimates from published market data and will not exactly ' +
      'match any particular seller or buylist.',
  },
  {
    question: 'Which formats are supported?',
    answer:
      'Format legality comes straight from Scryfall, which covers Commander, Modern, Pioneer, Standard, Legacy, ' +
      'Vintage, Pauper and the rest. Commander gets the most dedicated tooling, since colour identity and ' +
      'singleton rules are handled explicitly.',
  },
  {
    question: 'Is it free?',
    answer:
      'Yes, while DeckMatrix is in early access. There is no card required and no trial countdown. If paid ' +
      'plans are introduced later, existing accounts will be told before anything changes.',
  },
  {
    question: 'Is this an official Wizards of the Coast product?',
    answer:
      'No. DeckMatrix is unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy. ' +
      'It is not approved or endorsed by Wizards. Portions of the materials used are property of Wizards of ' +
      'the Coast.',
  },
];

export function FAQSection() {
  return (
    <Section id="faq">
      {/* Header */}
      <motion.div
        className="text-center max-w-3xl mx-auto mb-16"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0, margin: '0px 0px -10% 0px' }}
      >
        <Badge variant="outline" className="mb-4">
          <HelpCircle className="h-3 w-3 mr-2" />
          Got Questions?
        </Badge>
        <h2 className="text-4xl md:text-6xl font-bold mb-6">
          Frequently Asked Questions
        </h2>
        <p className="text-xl text-muted-foreground">
          Everything you need to know about DeckMatrix
        </p>
      </motion.div>

      {/* FAQ Accordion */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0, margin: '0px 0px -10% 0px' }}
      >
        <Card className="p-6 md:p-8 bg-card/50 backdrop-blur-sm border-border/50">
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`} className="border-border/50">
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
        className="text-center mt-12"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0, margin: '0px 0px -10% 0px' }}
      >
        <p className="text-muted-foreground mb-4">
          Still have questions?
        </p>
        <a href="mailto:support@deckmatrix.com" className="text-primary hover:underline font-medium">
          Contact our support team →
        </a>
      </motion.div>
    </Section>
  );
}