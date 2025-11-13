import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Brain, Sparkles, Wand2, MessageSquare, ArrowRight, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

const demoQuestions = [
  "What are the best ramp cards for a green deck?",
  "How do I build a competitive Atraxa deck?",
  "Explain the stack and priority in MTG",
  "What's the optimal land count for Commander?"
];

const demoResponses: Record<string, string> = {
  "What are the best ramp cards for a green deck?": "For green ramp, the classics remain king: **Cultivate** and **Kodama's Reach** are reliable 3-mana plays that thin your deck. **Three Visits** and **Nature's Lore** are superior 2-mana options that can fetch dual lands. For explosive plays, **Sakura-Tribe Elder** offers repeatable value, while **Ranger Class** provides sustained acceleration. Don't sleep on **Exploration** and **Burgeoning** for early game dominance!",
  
  "How do I build a competitive Atraxa deck?": "Atraxa shines in **Superfriends** and **+1/+1 counters** strategies. Focus on premium planeswalkers like **Teferi, Time Raveler** and **Wrenn and Six**. Include proliferate engines: **Inexorable Tide**, **Flux Channeler**, and **Karn's Bastion**. Your mana base needs **Urborg** + **Coffers**, plus fetch lands for consistency. Key removal: **Swords to Plowshares**, **Assassin's Trophy**, and **Cyclonic Rift**. Average CMC should stay around 2.5 for competitive play.",
  
  "Explain the stack and priority in MTG": "The stack is MTG's last-in-first-out (LIFO) system for resolving spells and abilities. When you cast a spell, it goes on the stack. Players get **priority** in turn order to respond. The most recent spell/ability resolves first. For example: You cast Lightning Bolt → opponent casts Counterspell → Counterspell resolves first, countering your Bolt. Priority passes after each player action, allowing strategic timing of instant-speed interaction.",
  
  "What's the optimal land count for Commander?": "For Commander, the sweet spot is **36-38 lands** depending on your strategy. Low-curve aggressive decks (avg CMC <3) can run 35-36. Midrange value engines want 37-38. Include **8-10 ramp spells** to effectively hit 45+ mana sources. Fast mana like **Sol Ring**, **Mana Crypt**, and signets are crucial. Use **MDFCs** (Modal Double-Faced Cards) like **Valakut Awakening** to reduce flood while maintaining land count."
};

export function AIBrainDemo() {
  const [selectedQuestion, setSelectedQuestion] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const handleQuestionClick = (question: string) => {
    setSelectedQuestion(question);
    setResponse('');
    setLoading(true);
    
    // Simulate AI response delay
    setTimeout(() => {
      setResponse(demoResponses[question] || "This is a demo response. Sign up to get real AI-powered answers!");
      setLoading(false);
    }, 1500);
  };

  return (
    <section className="py-24 px-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/30 to-background" />
      <div className="absolute inset-0">
        <div className="absolute top-20 left-20 w-64 h-64 bg-spacecraft/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-warp/10 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-16 space-y-4">
          <div className="flex items-center justify-center mb-6">
            <div className="relative group">
              <div className="absolute -inset-2 bg-cosmic blur-xl opacity-50 group-hover:opacity-75 transition-opacity animate-glow-pulse" />
              <div className="relative w-20 h-20 rounded-2xl bg-cosmic flex items-center justify-center shadow-glow-elegant">
                <Brain className="h-10 w-10 text-primary-foreground" />
              </div>
            </div>
          </div>
          
          <Badge className="bg-warp/20 text-warp border-warp/30 px-4 py-2">
            <Sparkles className="h-4 w-4 mr-2" />
            Powered by Google Gemini 2.5
          </Badge>
          
          <h2 className="text-4xl md:text-6xl font-bold">
            <span className="bg-gradient-to-r from-warp via-spacecraft to-warp bg-clip-text text-transparent">
              AI Super Brain
            </span>
          </h2>
          
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Get instant expert analysis, deck optimization strategies, and rules clarification from our advanced AI assistant
          </p>
        </div>

        {/* Demo Interface */}
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Question Selector */}
            <Card className="border-spacecraft/30 bg-card/60 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-spacecraft" />
                  Try These Questions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {demoQuestions.map((question, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    className="w-full justify-start text-left h-auto py-4 px-4 border-border/50 hover:border-spacecraft/50 hover:bg-spacecraft/10 transition-all"
                    onClick={() => handleQuestionClick(question)}
                  >
                    <Wand2 className="h-4 w-4 mr-3 flex-shrink-0 text-spacecraft" />
                    <span className="text-sm">{question}</span>
                  </Button>
                ))}
              </CardContent>
            </Card>

            {/* AI Response */}
            <Card className="border-warp/30 bg-card/60 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-warp" />
                  AI Response
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!selectedQuestion && !response ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Select a question to see the AI in action</p>
                  </div>
                ) : loading ? (
                  <div className="text-center py-12">
                    <Loader2 className="h-12 w-12 mx-auto mb-4 text-warp animate-spin" />
                    <p className="text-muted-foreground">Analyzing with AI...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-spacecraft/10 border border-spacecraft/20">
                      <p className="text-sm font-medium text-spacecraft mb-2">Your Question:</p>
                      <p className="text-sm">{selectedQuestion}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-warp/10 border border-warp/20">
                      <p className="text-sm font-medium text-warp mb-2">AI Analysis:</p>
                      <p className="text-sm leading-relaxed whitespace-pre-line">{response}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* CTA */}
          <div className="text-center mt-12">
            <Link to="/register">
              <Button size="lg" className="bg-cosmic hover:shadow-glow-elegant hover:scale-105 transition-all">
                <Brain className="h-5 w-5 mr-2" />
                Unlock Full AI Brain
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground mt-4">
              Sign up free to access unlimited AI-powered insights
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
