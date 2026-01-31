import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Sparkles, 
  Crown, 
  Sword, 
  Wand2, 
  Target,
  ArrowRight,
  Check,
  Layers,
  Search,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ManaSymbols } from '@/components/ui/mana-symbols';

interface FirstDeckOnboardingProps {
  onCreateDeck: (name: string, format: 'commander' | 'standard' | 'custom', commanderId?: string) => void;
  loading?: boolean;
}

const formatOptions = [
  {
    id: 'commander',
    name: 'Commander',
    description: '100 cards, legendary commander',
    icon: Crown,
    color: 'from-purple-500/20 to-purple-600/10',
    borderColor: 'border-purple-500/30',
    iconColor: 'text-purple-500',
    popular: true
  },
  {
    id: 'standard',
    name: 'Standard',
    description: '60 cards, competitive play',
    icon: Sword,
    color: 'from-blue-500/20 to-blue-600/10',
    borderColor: 'border-blue-500/30',
    iconColor: 'text-blue-500',
    popular: false
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'No restrictions, any format',
    icon: Wand2,
    color: 'from-emerald-500/20 to-emerald-600/10',
    borderColor: 'border-emerald-500/30',
    iconColor: 'text-emerald-500',
    popular: false
  }
];

export function FirstDeckOnboarding({ onCreateDeck, loading }: FirstDeckOnboardingProps) {
  const [step, setStep] = useState(1);
  const [selectedFormat, setSelectedFormat] = useState<'commander' | 'standard' | 'custom' | null>(null);
  const [deckName, setDeckName] = useState('');
  
  // Commander selection state
  const [commander, setCommander] = useState<any>(null);
  const [commanderSearch, setCommanderSearch] = useState('');
  const [commanderSearchResults, setCommanderSearchResults] = useState<any[]>([]);
  const [searchingCommanders, setSearchingCommanders] = useState(false);

  const handleFormatSelect = (format: 'commander' | 'standard' | 'custom') => {
    setSelectedFormat(format);
    setTimeout(() => setStep(2), 300);
  };

  const handleCreate = () => {
    if (deckName.trim() && selectedFormat) {
      // For commander format, include commander ID if selected
      if (selectedFormat === 'commander' && commander) {
        onCreateDeck(deckName.trim(), selectedFormat, commander.id);
      } else {
        onCreateDeck(deckName.trim(), selectedFormat);
      }
    }
  };
  
  // Search commanders using Scryfall
  const searchCommanders = async (query: string) => {
    if (!query.trim()) {
      setCommanderSearchResults([]);
      return;
    }
    
    setSearchingCommanders(true);
    try {
      const response = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}+is%3Acommander&order=edhrec`
      );
      
      if (!response.ok) {
        if (response.status === 404) {
          setCommanderSearchResults([]);
          return;
        }
        throw new Error('Search failed');
      }
      
      const data = await response.json();
      setCommanderSearchResults(data.data || []);
    } catch (error) {
      console.error('Commander search error:', error);
      setCommanderSearchResults([]);
    } finally {
      setSearchingCommanders(false);
    }
  };
  
  // Debounced commander search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchCommanders(commanderSearch);
    }, 400);
    return () => clearTimeout(timer);
  }, [commanderSearch]);
  
  const handleCommanderSelect = (card: any) => {
    setCommander(card);
    // Auto-fill deck name if empty
    if (!deckName) {
      setDeckName(card.name);
    }
  };
  
  const handleNameStepNext = () => {
    if (selectedFormat === 'commander') {
      setStep(3); // Go to commander selection
    } else {
      handleCreate(); // Create directly for non-commander formats
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="text-center max-w-2xl"
          >
            {/* Hero Icon */}
            <motion.div 
              className="relative w-24 h-24 mx-auto mb-8"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", duration: 0.6 }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-purple-600/30 rounded-2xl blur-xl" />
              <div className="relative w-full h-full bg-gradient-to-br from-primary to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Layers className="h-12 w-12 text-white" />
              </div>
              <motion.div
                className="absolute -top-2 -right-2"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: "spring" }}
              >
                <Sparkles className="h-6 w-6 text-yellow-500" />
              </motion.div>
            </motion.div>

            {/* Welcome Text */}
            <motion.h1 
              className="text-3xl md:text-4xl font-bold mb-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              Create New Deck
            </motion.h1>
            <motion.p 
              className="text-lg text-muted-foreground mb-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Choose a format to get started. You can always change this later.
            </motion.p>

            {/* Format Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {formatOptions.map((format, index) => (
                <motion.div
                  key={format.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + index * 0.1 }}
                >
                  <Card 
                    className={cn(
                      "relative cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-xl border-2 h-[180px]",
                      selectedFormat === format.id 
                        ? `${format.borderColor} bg-gradient-to-br ${format.color}` 
                        : "border-border/50 hover:border-primary/50"
                    )}
                    onClick={() => handleFormatSelect(format.id as any)}
                  >
                    {format.popular && (
                      <Badge className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs">
                        Popular
                      </Badge>
                    )}
                    <CardContent className="p-6 text-center h-full flex flex-col justify-center">
                      <div className={cn(
                        "w-14 h-14 rounded-xl mx-auto mb-4 flex items-center justify-center",
                        `bg-gradient-to-br ${format.color}`
                      )}>
                        <format.icon className={cn("h-7 w-7", format.iconColor)} />
                      </div>
                      <h3 className="font-semibold text-lg mb-1">{format.name}</h3>
                      <p className="text-sm text-muted-foreground">{format.description}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="text-center max-w-md w-full"
          >
            {/* Progress indicator */}
            <div className="flex items-center justify-center gap-2 mb-8">
              <div className="flex items-center gap-1">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <Check className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="text-sm text-muted-foreground">Format</span>
              </div>
              <div className="w-8 h-0.5 bg-primary" />
              <div className="flex items-center gap-1">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-sm font-medium text-primary-foreground">2</span>
                </div>
                <span className="text-sm font-medium">Name</span>
              </div>
            </div>

            {/* Selected format badge */}
            <div className="flex justify-center mb-6">
              <Badge variant="secondary" className="text-sm py-1 px-3">
                {formatOptions.find(f => f.id === selectedFormat)?.name} Deck
              </Badge>
            </div>

            {/* Name Input */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="space-y-4"
            >
              <h2 className="text-2xl font-bold mb-2">Name Your Deck</h2>
              <p className="text-muted-foreground mb-6">
                Give your deck a memorable name
              </p>

              <div className="space-y-2 text-left">
                <Label htmlFor="deck-name" className="text-sm font-medium">
                  Deck Name
                </Label>
                <Input
                  id="deck-name"
                  value={deckName}
                  onChange={(e) => setDeckName(e.target.value)}
                  placeholder={selectedFormat === 'commander' ? "e.g., Atraxa Superfriends" : "e.g., Mono Red Aggro"}
                  className="h-12 text-lg"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && deckName.trim()) {
                      handleCreate();
                    }
                  }}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep(1);
                    setSelectedFormat(null);
                  }}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNameStepNext}
                  disabled={!deckName.trim() || loading}
                  className="flex-1 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
                >
                  {selectedFormat === 'commander' ? (
                    <span className="flex items-center">
                      Choose Commander
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </span>
                  ) : loading ? (
                    <span className="flex items-center">
                      <Target className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </span>
                  ) : (
                    <span className="flex items-center">
                      Create Deck
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </span>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Step 3: Commander Selection (Commander format only) */}
        {step === 3 && selectedFormat === 'commander' && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="text-center max-w-2xl w-full"
          >
            {/* Progress indicator */}
            <div className="flex items-center justify-center gap-2 mb-8">
              <div className="flex items-center gap-1">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <Check className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="text-sm text-muted-foreground">Format</span>
              </div>
              <div className="w-8 h-0.5 bg-primary" />
              <div className="flex items-center gap-1">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <Check className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="text-sm text-muted-foreground">Name</span>
              </div>
              <div className="w-8 h-0.5 bg-primary" />
              <div className="flex items-center gap-1">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-sm font-medium text-primary-foreground">3</span>
                </div>
                <span className="text-sm font-medium">Commander</span>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="space-y-4"
            >
              <h2 className="text-2xl font-bold mb-2">Choose Your Commander</h2>
              <p className="text-muted-foreground mb-6">
                Search for a legendary creature to lead your deck
              </p>

              {/* Commander Search */}
              <div className="space-y-4 text-left">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    placeholder="Search for a legendary creature..."
                    value={commanderSearch}
                    onChange={(e) => setCommanderSearch(e.target.value)}
                    className="pl-10 h-12 text-lg"
                    autoFocus
                  />
                </div>
                
                {/* Selected Commander Display */}
                {commander && (
                  <div className="flex gap-4 p-4 bg-gradient-to-r from-purple-500/10 to-purple-600/10 rounded-xl border border-purple-500/30">
                    <img 
                      src={commander.image_uris?.normal || commander.card_faces?.[0]?.image_uris?.normal || '/placeholder.svg'} 
                      alt={commander.name}
                      className="w-20 h-auto rounded-lg shadow-lg"
                    />
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2 mb-1">
                        <Crown className="h-4 w-4 text-purple-500" />
                        <h3 className="font-bold">{commander.name}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{commander.type_line}</p>
                      <ManaSymbols colors={commander.color_identity || []} size="sm" />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCommander(null)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      Change
                    </Button>
                  </div>
                )}
                
                {/* Search Results */}
                {commanderSearch && !commander && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[300px] overflow-y-auto p-1">
                    {searchingCommanders ? (
                      <div className="col-span-full flex justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : commanderSearchResults.length > 0 ? (
                      commanderSearchResults.slice(0, 12).map((card: any) => (
                        <div
                          key={card.id}
                          className="cursor-pointer group relative aspect-[488/680] rounded-lg overflow-hidden border-2 border-transparent hover:border-primary transition-all hover:scale-105"
                          onClick={() => handleCommanderSelect(card)}
                        >
                          <img
                            src={card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || '/placeholder.svg'}
                            alt={card.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))
                    ) : (
                      <div className="col-span-full text-center py-8 text-muted-foreground">
                        No commanders found matching "{commanderSearch}"
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
                >
                  {loading ? (
                    <span className="flex items-center">
                      <Target className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </span>
                  ) : (
                    <span className="flex items-center">
                      {commander ? 'Create Deck' : 'Skip for Now'}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </span>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
