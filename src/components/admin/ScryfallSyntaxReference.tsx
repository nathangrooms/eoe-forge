import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Code } from "lucide-react";

export function ScryfallSyntaxReference() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Scryfall Search Syntax Reference
            </CardTitle>
            <CardDescription>Advanced search operators for MTG Brain queries</CardDescription>
          </div>
          <Badge variant="outline">v2.0</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="basics" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="basics">Basics</TabsTrigger>
            <TabsTrigger value="colors">Colors</TabsTrigger>
            <TabsTrigger value="types">Types</TabsTrigger>
            <TabsTrigger value="stats">Stats</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <TabsContent value="basics" className="space-y-4">
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-4">
                <Alert>
                  <Code className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Basic Syntax:</strong> Use keywords and operators to build precise searches
                  </AlertDescription>
                </Alert>

                <div className="space-y-3">
                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Name Search</h4>
                    <code className="text-sm">lightning bolt</code>
                    <p className="text-sm text-muted-foreground mt-1">Finds cards with "lightning" and "bolt" in name</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Exact Match</h4>
                    <code className="text-sm">!"Lightning Bolt"</code>
                    <p className="text-sm text-muted-foreground mt-1">Exact card name only</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Oracle Text</h4>
                    <code className="text-sm">o:"draw a card"</code>
                    <p className="text-sm text-muted-foreground mt-1">Cards with this phrase in rules text</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Type Line</h4>
                    <code className="text-sm">t:legendary t:creature</code>
                    <p className="text-sm text-muted-foreground mt-1">Legendary creatures only</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Combining Searches</h4>
                    <code className="text-sm">t:instant o:draw cmc&lt;=3</code>
                    <p className="text-sm text-muted-foreground mt-1">Cheap instant-speed card draw</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Negation</h4>
                    <code className="text-sm">t:creature -c:blue</code>
                    <p className="text-sm text-muted-foreground mt-1">Non-blue creatures</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">OR Operator</h4>
                    <code className="text-sm">(o:destroy OR o:exile) t:instant</code>
                    <p className="text-sm text-muted-foreground mt-1">Instant-speed removal</p>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="colors" className="space-y-4">
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-4">
                <Alert>
                  <Code className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Color Filters:</strong> c: = colors, id: = color identity
                  </AlertDescription>
                </Alert>

                <div className="space-y-3">
                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Single Color</h4>
                    <code className="text-sm">c:blue</code> or <code className="text-sm">c:u</code>
                    <p className="text-sm text-muted-foreground mt-1">Only blue cards</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Multiple Colors (AND)</h4>
                    <code className="text-sm">c:wu</code>
                    <p className="text-sm text-muted-foreground mt-1">White AND blue cards</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Multiple Colors (OR)</h4>
                    <code className="text-sm">c&gt;=wu</code>
                    <p className="text-sm text-muted-foreground mt-1">White OR blue OR both</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Colorless</h4>
                    <code className="text-sm">c:c</code>
                    <p className="text-sm text-muted-foreground mt-1">Colorless cards only</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Color Identity (Commander)</h4>
                    <code className="text-sm">id&lt;=bug</code>
                    <p className="text-sm text-muted-foreground mt-1">Sultai (BUG) identity or less</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Exactly These Colors</h4>
                    <code className="text-sm">c=wr</code>
                    <p className="text-sm text-muted-foreground mt-1">Exactly white and red, no more, no less</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Monocolor</h4>
                    <code className="text-sm">c&lt;=g -c:c</code>
                    <p className="text-sm text-muted-foreground mt-1">Monogreen cards</p>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="types" className="space-y-4">
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-4">
                <Alert>
                  <Code className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Type Searches:</strong> t: for type line, st: for subtypes
                  </AlertDescription>
                </Alert>

                <div className="space-y-3">
                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Card Types</h4>
                    <code className="text-sm">t:creature t:artifact</code>
                    <p className="text-sm text-muted-foreground mt-1">Artifact creatures</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Legendary Filter</h4>
                    <code className="text-sm">t:legendary t:creature</code>
                    <p className="text-sm text-muted-foreground mt-1">Legendary creatures (commander candidates)</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Subtypes</h4>
                    <code className="text-sm">t:elf t:warrior</code>
                    <p className="text-sm text-muted-foreground mt-1">Elf warriors</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Instant or Sorcery</h4>
                    <code className="text-sm">(t:instant OR t:sorcery)</code>
                    <p className="text-sm text-muted-foreground mt-1">All spells</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Planeswalkers</h4>
                    <code className="text-sm">t:planeswalker</code>
                    <p className="text-sm text-muted-foreground mt-1">All planeswalkers</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Exclude Types</h4>
                    <code className="text-sm">t:creature -t:legendary</code>
                    <p className="text-sm text-muted-foreground mt-1">Non-legendary creatures</p>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="stats" className="space-y-4">
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-4">
                <Alert>
                  <Code className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Numeric Filters:</strong> Use cmc, power, toughness, loyalty operators
                  </AlertDescription>
                </Alert>

                <div className="space-y-3">
                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Mana Value (CMC)</h4>
                    <code className="text-sm">cmc=3</code> or <code className="text-sm">cmc&lt;=3</code>
                    <p className="text-sm text-muted-foreground mt-1">Cards with specific converted mana cost</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Power/Toughness</h4>
                    <code className="text-sm">pow&gt;=5 tou&gt;=5</code>
                    <p className="text-sm text-muted-foreground mt-1">Big creatures (5/5 or better)</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">CMC Range</h4>
                    <code className="text-sm">cmc&gt;=2 cmc&lt;=4</code>
                    <p className="text-sm text-muted-foreground mt-1">Cards costing 2-4 mana</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Power = Toughness</h4>
                    <code className="text-sm">pow=tou</code>
                    <p className="text-sm text-muted-foreground mt-1">Square stats (2/2, 3/3, etc)</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Loyalty Counter</h4>
                    <code className="text-sm">loy&gt;=4</code>
                    <p className="text-sm text-muted-foreground mt-1">Planeswalkers with 4+ starting loyalty</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Free Spells</h4>
                    <code className="text-sm">cmc=0 -t:land</code>
                    <p className="text-sm text-muted-foreground mt-1">Zero-cost spells (not lands)</p>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-4">
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-4">
                <Alert>
                  <Code className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Advanced Operators:</strong> Complex queries and special filters
                  </AlertDescription>
                </Alert>

                <div className="space-y-3">
                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Format Legality</h4>
                    <code className="text-sm">f:commander legal:commander</code>
                    <p className="text-sm text-muted-foreground mt-1">Commander-legal cards</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Price Filter</h4>
                    <code className="text-sm">usd&lt;=5</code>
                    <p className="text-sm text-muted-foreground mt-1">Cards under $5</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Rarity</h4>
                    <code className="text-sm">r:rare r:mythic</code>
                    <p className="text-sm text-muted-foreground mt-1">Rare or mythic cards</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Keywords</h4>
                    <code className="text-sm">o:haste o:trample</code>
                    <p className="text-sm text-muted-foreground mt-1">Cards with specific keywords</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Set Search</h4>
                    <code className="text-sm">s:znr</code>
                    <p className="text-sm text-muted-foreground mt-1">Cards from Zendikar Rising</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Artist</h4>
                    <code className="text-sm">a:"Rebecca Guay"</code>
                    <p className="text-sm text-muted-foreground mt-1">Cards by specific artist</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Complex Combos</h4>
                    <code className="text-sm">t:creature cmc&lt;=3 pow&gt;=3 id&lt;=r usd&lt;=2</code>
                    <p className="text-sm text-muted-foreground mt-1">Budget red aggro creatures</p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold">Reserved List</h4>
                    <code className="text-sm">is:reserved</code>
                    <p className="text-sm text-muted-foreground mt-1">Reserved list cards</p>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
