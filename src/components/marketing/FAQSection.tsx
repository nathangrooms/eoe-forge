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

const faqs = [
  {
    question: 'How does the deck builder work?',
    answer: 'Our intelligent system analyzes thousands of high-performing decks, card synergies, and meta trends to suggest optimal card choices. It considers your budget, playstyle preferences, and deck strategy to build competitive decks in seconds.'
  },
  {
    question: 'Is my collection data secure?',
    answer: 'Absolutely. We use bank-level encryption for all user data. Your collection information is stored securely and never shared with third parties. You maintain complete control over your data privacy settings.'
  },
  {
    question: 'Can I import my existing decks?',
    answer: 'Yes! You can import decks from Archidekt, Moxfield, TappedOut, and other platforms. We also support bulk imports via CSV and text files. Your deck data transfers seamlessly with full formatting preserved.'
  },
  {
    question: 'How accurate is the power level scoring?',
    answer: 'Our EDH power level calculator is calibrated against thousands of competitive and casual decks. It analyzes combo potential, interaction, consistency, and over 50 other factors with 95%+ accuracy validated by the community.'
  },
  {
    question: 'What formats are supported?',
    answer: 'We support all major formats including Commander/EDH, Modern, Pioneer, Standard, Legacy, Vintage, Pauper, and more. Each format has specific analysis tools and legality checking.'
  },
  {
    question: 'How does pricing and collection tracking work?',
    answer: 'We integrate with TCGPlayer for real-time pricing data. Your collection value updates automatically, and you can set price alerts for specific cards. Historical price charts help you track investments over time.'
  },
  {
    question: 'Is there a mobile app?',
    answer: 'Our web platform is fully optimized for mobile browsers with a responsive design. You can build decks, track your collection, and access all features seamlessly on any device.'
  },
  {
    question: 'What makes DeckMatrix different from competitors?',
    answer: 'We\'re the only platform that combines smart deck building, power level analysis, collection tracking, and marketplace features in one place. Our unique synergy detection and storage management tools set us apart.'
  }
];

export function FAQSection() {
  return (
    <section className="py-24 relative overflow-hidden bg-gradient-to-b from-background to-card/20">
      <div className="container mx-auto px-4 relative z-10">
        {/* Header */}
        <motion.div 
          className="text-center max-w-3xl mx-auto mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
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
          viewport={{ once: true }}
          className="max-w-4xl mx-auto"
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
          viewport={{ once: true }}
        >
          <p className="text-muted-foreground mb-4">
            Still have questions?
          </p>
          <a href="mailto:support@deckmatrix.com" className="text-primary hover:underline font-medium">
            Contact our support team →
          </a>
        </motion.div>
      </div>
    </section>
  );
}