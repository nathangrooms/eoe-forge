import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Crown, TrendingUp, Sparkles, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ScryfallCard {
  id: string;
  name: string;
  image_uris?: {
    normal: string;
    small: string;
  };
  mana_cost?: string;
  type_line: string;
  colors?: string[];
}

export function LiveCardsShowcase() {
  const [topCards, setTopCards] = useState<ScryfallCard[]>([]);
  const [topCommanders, setTopCommanders] = useState<ScryfallCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCards = async () => {
      try {
        // Fetch popular legendary creatures for commanders
        const commandersRes = await fetch(
          'https://api.scryfall.com/cards/search?q=type:legendary+type:creature+is:commander&order=edhrec&unique=cards&limit=4'
        );
        const commandersData = await commandersRes.json();
        
        // Fetch popular cards
        const cardsRes = await fetch(
          'https://api.scryfall.com/cards/search?q=f:commander+type:instant+OR+type:sorcery&order=edhrec&unique=cards&limit=4'
        );
        const cardsData = await cardsRes.json();

        setTopCommanders(commandersData.data || []);
        setTopCards(cardsData.data || []);
      } catch (error) {
        console.error('Failed to fetch cards:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCards();
  }, []);

  const CardGrid = ({ cards, title, icon: Icon, color }: { cards: ScryfallCard[], title: string, icon: any, color: string }) => (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className={`p-3 rounded-xl bg-${color}/10 border border-${color}/20`}>
          <Icon className={`h-6 w-6 text-${color}`} />
        </div>
        <div>
          <h3 className="text-2xl font-bold">{title}</h3>
          <p className="text-sm text-muted-foreground">Live from Scryfall API</p>
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading ? (
          Array(4).fill(0).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="aspect-[63/88] w-full" />
              <CardContent className="p-3">
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-3 w-2/3" />
              </CardContent>
            </Card>
          ))
        ) : (
          cards.map((card) => (
            <Card 
              key={card.id} 
              className="group overflow-hidden hover:shadow-glow-elegant transition-all duration-300 hover:scale-105 cursor-pointer border-border/50 hover:border-primary/50"
            >
              <div className="aspect-[63/88] overflow-hidden bg-muted/30">
                <img 
                  src={card.image_uris?.normal || card.image_uris?.small} 
                  alt={card.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <CardContent className="p-3 bg-card/60 backdrop-blur-sm">
                <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                  {card.name}
                </p>
                <Badge variant="outline" className="text-xs mt-1 border-primary/30 bg-primary/10">
                  {card.type_line.split('—')[0].trim()}
                </Badge>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );

  return (
    <section className="py-24 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/20 to-background" />
      <div className="absolute inset-0 bg-starfield opacity-10" />
      
      <div className="container mx-auto relative z-10 space-y-16">
        {/* Header */}
        <div className="text-center space-y-4">
          <Badge className="bg-spacecraft/20 text-spacecraft border-spacecraft/30">
            <Sparkles className="h-4 w-4 mr-2" />
            Live Card Database
          </Badge>
          <h2 className="text-4xl md:text-5xl font-bold">
            <span className="bg-gradient-to-r from-spacecraft via-station to-spacecraft bg-clip-text text-transparent">
              Explore Magic's Best Cards
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Browse the most popular commanders and cards in real-time from our comprehensive database
          </p>
        </div>

        {/* Top Commanders */}
        <CardGrid 
          cards={topCommanders} 
          title="Top Commanders" 
          icon={Crown}
          color="type-commander"
        />

        {/* Top Cards */}
        <CardGrid 
          cards={topCards} 
          title="Popular Spells" 
          icon={TrendingUp}
          color="type-instants"
        />

        {/* CTA */}
        <div className="text-center">
          <Link to="/register">
            <Button size="lg" className="bg-gradient-to-r from-spacecraft to-station hover:shadow-glow-elegant hover:scale-105 transition-all">
              <Sparkles className="h-5 w-5 mr-2" />
              Search 500,000+ Cards
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
