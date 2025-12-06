import { useState } from 'react';
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
  Layers
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FirstDeckOnboardingProps {
  onCreateDeck: (name: string, format: 'commander' | 'standard' | 'custom') => void;
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

  const handleFormatSelect = (format: 'commander' | 'standard' | 'custom') => {
    setSelectedFormat(format);
    setTimeout(() => setStep(2), 300);
  };

  const handleCreate = () => {
    if (deckName.trim() && selectedFormat) {
      onCreateDeck(deckName.trim(), selectedFormat);
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
                  onClick={handleCreate}
                  disabled={!deckName.trim() || loading}
                  className="flex-1 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
                >
                  {loading ? (
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
      </AnimatePresence>
    </div>
  );
}
