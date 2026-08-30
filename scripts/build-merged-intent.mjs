/**
 * Assembles the merged intent-rule proposal from eight parallel proposals and
 * their refutations, and writes it to .shots/coverage-slices/merged.json.
 *
 * Kept as a script rather than a hand-edited JSON file so the grouping and the
 * reason for each choice sit next to the rule, and so a re-run reproduces the
 * exact file that was measured.
 */
import fs from 'node:fs';

const W = (...p) => p.map(([facet, weight]) => ({ facet, weight }));

const rules = [
  // ---------------------------------------------------------------- abilities
  {
    when: "\\{T\\}[,:](?![^()]*\\))",
    reads: 'does its work through a tap ability',
    wants: W(['eff:untap', 0.8], ['kw:haste', 0.6], ['sub:equipment', 0.45]),
  },
  {
    when: "(^|\\n)\\{[0-9X]+\\}:",
    reads: 'has an ability you can pay for over and over, so the deck wants a lot of mana',
    wants: W(['eff:add-mana', 0.8], ['cares:zone:library-land', 0.45], ['type:land', 0.35], ['eff:untap', 0.35]),
  },
  {
    when: "(unspent (green |red |black |white |blue )?mana|whenever you tap a land for mana|creature you control with a mana ability|adds \\{[WUBRGC]\\}|add \\{[WUBRGC]\\} for each)",
    reads: 'makes more mana than most decks, so give it big things to spend it on',
    wants: W(['eff:add-mana', 0.85], ['cares:zone:library-land', 0.5], ['type:land', 0.4]),
  },
  {
    when: "\\bcascade\\b|mana value \\d+ or greater(?![^.]{0,60}can't be cast)",
    reads: 'pays you for casting expensive spells',
    wants: W(['eff:add-mana', 0.85], ['eff:search-library', 0.55], ['cares:zone:library-land', 0.5]),
  },
  {
    when: "((?<!loyalty |equip )abilities you activate|activated abilities of|copy target activated)",
    reads: 'cares about the activated abilities on your permanents',
    wants: W(['acost:3', 0.7], ['acost:2', 0.65], ['acost:1', 0.6], ['eff:untap', 0.5]),
  },
  {
    when: "doesn't untap during your( next)? untap step\\.",
    reads: 'stays tapped unless you untap it',
    wants: W(['eff:untap', 0.85], ['eff:tap', 0.45]),
  },

  // ------------------------------------------------------------------- combat
  {
    when: "whenever [^.\\n]{0,40} deals combat damage to (a|an) (player|opponent)",
    reads: 'is paid when it hits a player in combat',
    wants: W(['sub:equipment', 0.8], ['eff:pump', 0.6], ['sub:aura', 0.55], ['kw:haste', 0.5], ['cares:sub:equipment', 0.4]),
  },
  {
    when: "can't be blocked(?! except)|unblockable|landwalk|horsemanship",
    reads: 'gets past blockers',
    wants: W(['sub:equipment', 0.8], ['eff:pump', 0.65], ['sub:aura', 0.55], ['cares:sub:equipment', 0.5], ['kw:haste', 0.45]),
  },
  {
    when: "(ninjutsu|sneak \\{)",
    reads: 'sneaks a ninja in on an unblocked attacker',
    wants: W(['sub:ninja', 0.75], ['kw:ninjutsu', 0.7], ['kw:menace', 0.45], ['sub:rogue', 0.4]),
  },
  {
    when: "(rampage \\d|bushido \\d|afflict \\d|must be blocked|becomes blocked, (it|that creature|they))",
    reads: 'is paid for being blocked',
    wants: W(['eff:pump', 0.75], ['sub:equipment', 0.6], ['kw:trample', 0.55], ['sub:aura', 0.45]),
  },
  {
    when: "(whenever you attack|creature attacking|attacking alone|creatures you control attack)",
    reads: 'pays you for attacking',
    wants: W(['trig:attacks', 0.8], ['kw:haste', 0.6], ['sub:equipment', 0.5], ['eff:pump', 0.5]),
  },
  {
    when: "at the beginning of combat on your turn(?!, if you've cast a noncreature spell)",
    reads: 'starts working at the beginning of every combat',
    wants: W(['trig:attacks', 0.7], ['kw:haste', 0.6], ['eff:pump', 0.55], ['sub:equipment', 0.45]),
  },
  {
    when: "attacks[^.]{0,25}if able(?![^()]*\\))",
    reads: 'has to attack whether you want it to or not',
    wants: W(['sub:equipment', 0.75], ['sub:aura', 0.6], ['eff:pump', 0.6], ['kw:trample', 0.5]),
  },
  {
    when: "creatures you control (gain|get \\+\\d)",
    reads: 'makes all of your creatures better at once',
    wants: W(['eff:create-token', 0.8], ['trig:enters', 0.45], ['eff:pump', 0.4]),
  },
  {
    when: "power (and toughness are each|is) equal to",
    reads: 'has no set power and grows as the game goes on',
    wants: W(['sub:equipment', 0.75], ['kw:trample', 0.6], ['sub:aura', 0.5], ['eff:pump', 0.5]),
  },
  {
    when: "where X is [A-Z][^.]{0,30}'s power",
    flags: '',
    reads: 'counts its own power',
    wants: W(['eff:add-counters', 0.8], ['ctr:+1/+1', 0.75], ['eff:pump', 0.7], ['sub:equipment', 0.6], ['sub:aura', 0.5]),
  },
  {
    when: "(switch [^.\\n]{0,40}power and toughness|damage equal to (its|their) toughness|toughness rather than (its|their) power|total toughness of creatures you control)",
    reads: 'fights with toughness instead of power',
    wants: W(['kw:defender', 0.8], ['sub:wall', 0.5], ['eff:pump', 0.5], ['cares:sub:wall', 0.4]),
  },
  {
    when: "(enchanted or equipped|is equipped|equipped creature|equip abilit)",
    reads: 'rewards the creature carrying your equipment and auras',
    wants: W(['sub:equipment', 0.85], ['sub:aura', 0.7], ['eff:attach', 0.65], ['cares:sub:equipment', 0.5]),
  },
  {
    when: "commanders? you control",
    reads: 'looks after your commander',
    wants: W(['sub:equipment', 0.8], ['sub:aura', 0.6], ['eff:pump', 0.6], ['kw:haste', 0.45]),
  },
  {
    when: "^(?:(?:reach|flying|trample|menace|deathtouch|first strike|double strike|vigilance|indestructible|haste|horsemanship|banding|shadow|fear|intimidate)\\b|\\([^)]*\\)|[;,.\\s])+$",
    reads: 'has combat keywords and nothing else we can read',
    wants: W(['sub:equipment', 0.75], ['sub:aura', 0.65], ['eff:pump', 0.6], ['cares:sub:equipment', 0.5], ['cares:sub:aura', 0.45]),
  },
  {
    when: "protection from everything",
    reads: 'cannot be blocked or killed, so the deck pushes it through',
    wants: W(['sub:equipment', 0.8], ['eff:pump', 0.7], ['sub:aura', 0.6], ['cares:sub:equipment', 0.5]),
  },
  {
    when: "the Ring tempts you",
    reads: 'is paid when the Ring tempts you',
    wants: W(['trig:attacks', 0.7], ['type:creature', 0.5], ['sub:equipment', 0.45]),
  },
  {
    when: "(whenever [^.\\n]{0,60}is dealt damage|enrage|if damage would be dealt to)",
    reads: 'turns damage dealt to it into something useful',
    wants: W(['eff:damage', 0.7], ['eff:pump', 0.5], ['ctr:+1/+1', 0.45], ['kw:trample', 0.4]),
  },

  // -------------------------------------------------------- graveyard, discard
  {
    when: "((return|put|exile|cast|play|reveal|mill)[^.\\n]{0,60}from your graveyard|in your graveyard (has|have|gains) (unearth|encore|flashback|escape)|(?<!or a creature )cards? in your graveyard|descend \\d|\\bdelve\\b|target [a-z ]{0,30}card in your graveyard|(is|are) put into your graveyard)",
    reads: 'plays with the cards in your graveyard',
    wants: W(['cares:zone:graveyard', 0.85], ['eff:return-from', 0.8], ['eff:mill', 0.7], ['eff:discard', 0.55]),
  },
  {
    when: "(from (a|your) graveyard onto the battlefield|from your graveyard to the battlefield|return that card to the battlefield|has unearth|gains encore)",
    reads: 'brings creatures back from your graveyard',
    wants: W(['eff:return-from', 0.85], ['cares:zone:graveyard', 0.8], ['eff:mill', 0.6], ['eff:discard', 0.5]),
  },
  {
    when: "instant (and|or) sorcery cards? in (your|a) graveyard|instant or sorcery card from (your|a) graveyard|cast target instant or sorcery card from a graveyard",
    reads: 'casts your instants and sorceries back out of the graveyard',
    wants: W(['cares:zone:graveyard', 0.85], ['type:instant', 0.75], ['type:sorcery', 0.75], ['eff:mill', 0.5], ['cares:type:instant', 0.5]),
  },
  {
    when: "(cast|play|put) [^.]{0,70}from (a|that player's|target player's|an opponent's|each) graveyard",
    reads: "casts spells out of other players' graveyards",
    wants: W(['eff:mill', 0.8], ['cares:zone:graveyard', 0.75], ['eff:return-from', 0.6], ['eff:discard', 0.45]),
  },
  {
    when: "(, discard (a|two|another|three|X)[^:\\n]{0,25}:|discard a card:|unless you discard a card|discard your hand|discard a card or pay|discard a creature card)",
    reads: 'turns the cards in your hand into fuel',
    wants: W(['eff:discard', 0.75], ['cares:zone:graveyard', 0.7], ['eff:return-from', 0.65], ['kw:madness', 0.4]),
  },
  {
    when: "connives?",
    reads: 'throws cards into your graveyard as you draw',
    wants: W(['cares:zone:graveyard', 0.8], ['eff:return-from', 0.7], ['eff:discard', 0.6], ['eff:mill', 0.45]),
  },
  {
    when: "((?<!unless )that (player|opponent) discards|each (player|opponent) discards|discarded a card this turn)",
    reads: 'makes your opponents discard',
    wants: W(['eff:discard', 0.85], ['cares:zone:hand', 0.6], ['eff:lose-life', 0.4]),
  },

  // ------------------------------------------------------- library, draw, exile
  {
    when: "(you may (play|cast) (that card|those cards|it|the exiled cards|one of those cards)|may cast [^.\\n]{0,40}from among|until end of turn, you may (play|cast)|for as long as (it remains|they remain) exiled|spend mana as though it were mana of any|cast a card exiled with)",
    reads: 'plays cards off the top of a library instead of drawing them',
    wants: W(['cares:zone:library', 0.75], ['eff:add-mana', 0.6], ['eff:scry', 0.5]),
  },
  {
    when: "((cast|play) [^.]{0,60}from the top of your library|look at the top card of your library|exiles? cards? from the top of your library)",
    reads: 'plays cards straight off the top of your library',
    wants: W(['cares:zone:library', 0.8], ['eff:scry', 0.65], ['eff:search-library', 0.45]),
  },
  {
    when: "whenever you scry|(\\{T\\}|\\{\\d\\}|combat on your turn|your upkeep|end step)[^.]{0,50}scry \\d",
    reads: 'looks at the top of your library every turn',
    wants: W(['eff:scry', 0.85], ['eff:draw', 0.6]),
  },
  {
    when: "(no maximum hand size|whenever you draw your (first|second|third) card|draw two cards instead|draws? an additional card)",
    reads: 'rewards you for drawing extra cards',
    wants: W(['eff:draw', 0.85], ['eff:scry', 0.5], ['cares:zone:hand', 0.5]),
  },
  {
    when: "((each|that|an) (player|opponent)[^.]{0,40}draws? (a card|an additional|two|\\w+ cards)|whenever an opponent draws)",
    reads: 'hands cards to the table, which is only good if the table pays for them',
    wants: W(['eff:draw', 0.75], ['eff:lose-life', 0.65], ['eff:damage', 0.55], ['eff:discard', 0.5]),
  },
  {
    when: "\\bmiracle\\b",
    reads: 'cares which card you draw first each turn',
    wants: W(['eff:scry', 0.75], ['eff:draw', 0.7], ['cares:zone:library', 0.5]),
  },
  {
    when: "search your library for (a|up to \\w+) creature cards?",
    reads: 'goes and finds a creature',
    wants: W(['eff:search-library', 0.7], ['type:creature', 0.55], ['cares:type:creature', 0.5]),
  },
  {
    when: "number of (Island|Swamp|Mountain|Forest|Plains)s you control|land cards? are put into your graveyard|number of lands you control|land card from your graveyard",
    reads: 'counts the lands you control',
    wants: W(['type:land', 0.75], ['cares:type:land', 0.7], ['cares:zone:library-land', 0.6], ['eff:search-library', 0.55]),
  },
  {
    when: "domain|basic land types among",
    reads: 'counts the basic land types you control',
    wants: W(['cares:zone:library-land', 0.85], ['eff:search-library', 0.8], ['cares:type:land', 0.6]),
  },

  // ------------------------------------------------------------------- spells
  {
    when: "(prowess|whenever you cast (your (first|second) spell each turn|a noncreature spell)|if you've cast a noncreature spell this turn|instants?,? (and|or) sorcer|noncreature spells? you cast|cast your second spell|artifact, instant, (and|or) sorcery)",
    reads: 'leans on your instants and sorceries',
    wants: W(['cares:type:instant', 0.85], ['cares:type:sorcery', 0.85], ['type:instant', 0.6], ['type:sorcery', 0.6]),
  },
  {
    when: "copy target instant or sorcery spell|instant, (and |or )?sorcery spell, copy that spell|copy target spell you control",
    reads: 'copies your instants and sorceries',
    wants: W(['type:instant', 0.85], ['type:sorcery', 0.8], ['cares:type:instant', 0.6], ['cares:type:sorcery', 0.55]),
  },
  {
    when: "counter target spell|counters? that spell|counter it unless(?![^()]*\\))",
    reads: 'counters spells',
    wants: W(['eff:counter', 0.85], ['cares:zone:stack', 0.75], ['type:instant', 0.6], ['eff:draw', 0.4]),
  },
  {
    when: "(as though (it|they) had flash|have flash\\b)",
    reads: "lets you cast things at the end of someone else's turn",
    wants: W(['kw:flash', 0.6], ['type:instant', 0.6], ['trig:enters', 0.5], ['eff:counter', 0.45]),
  },
  {
    when: "(whenever an opponent casts|spells your opponents cast(?! that target)|opponents? can't cast|(?<!that target [^.]{0,40})cost \\{?\\w+\\}? more to cast|can't be cast|can't cast spells|players can cast spells only|lands don't untap)",
    reads: 'taxes and slows down what your opponents can do',
    wants: W(['eff:counter', 0.75], ['cares:zone:stack', 0.65], ['type:instant', 0.55], ['eff:add-mana', 0.5]),
  },
  {
    when: "(whenever you cast a creature spell|(?<!non)creature spells? you cast|cast (green )?creature spells)",
    reads: 'cares about the creature spells you cast',
    wants: W(['type:creature', 0.8], ['cares:type:creature', 0.55], ['trig:cast', 0.35]),
  },
  {
    when: "(you can't cast noncreature spells|noncreature spells with mana value \\d+ or greater can't be cast)",
    reads: 'shuts off your own noncreature spells',
    wants: W(['type:creature', 0.85], ['cares:type:creature', 0.5], ['eff:add-mana', 0.35]),
  },
  {
    when: "commit a crime",
    reads: 'is paid for pointing spells at your opponents',
    wants: W(['eff:destroy', 0.7], ['eff:damage', 0.6], ['type:instant', 0.55], ['eff:exile', 0.5]),
  },

  // ------------------------------------------------------------ permanent types
  {
    when: "(artifact (card|spell|creature)s?|artifacts you control|control an artifact|another artifact|an artifact you control|artifact, instant, (and|or) sorcery|ability of an artifact|from an artifact source|all artifacts|an artifact entered)",
    reads: 'builds around the artifacts you control',
    wants: W(['type:artifact', 0.85], ['cares:type:artifact', 0.7], ['cares:sub:treasure', 0.45], ['tok:treasure', 0.4]),
  },
  {
    when: "(legendary (permanent|creature|card|spell)|legendaries)",
    reads: 'rewards you for filling the deck with legends',
    wants: W(['type:legendary', 0.85], ['eff:search-library', 0.45]),
  },
  {
    when: "(historic|artifacts, legendaries)",
    reads: 'is paid for your artifacts, legends and Sagas',
    wants: W(['type:artifact', 0.75], ['type:legendary', 0.7], ['sub:saga', 0.5], ['cares:sub:saga', 0.4]),
  },
  {
    when: "(enchanted creature|enchantment cards? in your hand|each enchantment (card|permanent|spell)|enchantment (spell|card|permanent)s? you (control|cast))",
    reads: 'builds around enchantments',
    wants: W(['type:enchantment', 0.85], ['cares:type:enchantment', 0.6], ['sub:aura', 0.55], ['kw:enchant', 0.5]),
  },
  {
    when: "(planeswalkers? you control (dies|enters|deals)|planeswalker (card|spell)|loyalty abilit)",
    reads: 'builds around planeswalkers',
    wants: W(['type:planeswalker', 0.85], ['cares:type:planeswalker', 0.6], ['ctr:loyalty', 0.5]),
  },
  {
    when: "(face-down creature|turn (target )?[^.\\n]{0,25}face up|\\bmorph\\b)",
    reads: 'plays creatures face down and flips them up',
    wants: W(['kw:morph', 0.85], ['kw:megamorph', 0.6], ['type:creature', 0.4]),
  },
  {
    when: "(changeling|every creature type|creatures you control of the chosen type)",
    reads: 'counts as every creature type at once',
    wants: W(['kw:changeling', 0.7], ['type:creature', 0.7], ['cares:type:creature', 0.45]),
  },
  {
    when: "\\boutlaws?\\b",
    reads: 'counts your outlaws',
    wants: W(['sub:rogue', 0.7], ['sub:assassin', 0.7], ['sub:mercenary', 0.7], ['sub:pirate', 0.7], ['sub:warlock', 0.7], ['trig:enters', 0.35]),
  },
  {
    when: "becomes? the monarch",
    reads: 'brings the monarch into the game',
    wants: W(['eff:set-monarch', 0.85], ['kw:deathtouch', 0.5], ['kw:vigilance', 0.45]),
  },
  {
    when: "(open an attraction|whenever you roll)",
    reads: 'opens Attractions and rolls dice',
    wants: W(['sub:attraction', 0.8], ['trig:enters', 0.4]),
  },

  // -------------------------------------------------- bodies, tokens and copies
  {
    when: "(as a copy of|becomes? a copy of|tokens? that are copies of|copy of (another )?target creature)",
    reads: 'copies your creatures',
    wants: W(['trig:enters', 0.8], ['type:creature', 0.6], ['eff:create-token', 0.5]),
  },
  {
    when: "((create|creates) [^.]{0,40}tokens? that('s| are) (a )?cop(y|ies)|tokens? would be created)",
    reads: 'makes copies of your own permanents',
    wants: W(['eff:create-token', 0.85], ['trig:enters', 0.7], ['type:creature', 0.4]),
  },
  {
    when: "created a token this turn|created one or more tokens|create a token|creates a token|creates? [^.\n]{0,45}creature tokens?",
    reads: 'makes tokens of its own',
    wants: W(['eff:create-token', 0.85], ['trig:enters', 0.45], ['eff:sacrifice', 0.4], ['eff:pump', 0.4]),
  },
  {
    when: "investigate",
    reads: 'makes Clues you cash in later',
    wants: W(['tok:clue', 0.75], ['cares:sub:clue', 0.7], ['type:artifact', 0.5], ['eff:draw', 0.45]),
  },
  {
    when: "return [^.]{0,40}(creature|permanent|spell|card)s?[^.]{0,40} to (its|their) owner'?s hands?",
    reads: 'keeps sending permanents back to hand',
    wants: W(['trig:enters', 0.8], ['eff:move-zone', 0.6], ['type:creature', 0.4]),
  },
  {
    when: "(when|whenever)[^.\\n]{0,70}exile [A-Z][^.\\n]{0,25}\\. Return it to the battlefield",
    reads: 'leaves and comes straight back',
    wants: W(['trig:enters', 0.8], ['eff:move-zone', 0.55], ['type:creature', 0.5]),
  },
  {
    when: "creatures? entered the battlefield under your control|creatures? you control entered the battlefield",
    reads: 'rewards a turn where lots of creatures arrived',
    wants: W(['eff:create-token', 0.8], ['trig:enters', 0.65], ['type:creature', 0.5]),
  },
  {
    when: "put (a|an) (permanent|artifact, creature, or land) card from (your|their) hand onto the battlefield",
    reads: 'puts permanents from your hand straight onto the battlefield',
    wants: W(['type:creature', 0.6], ['eff:draw', 0.5], ['type:artifact', 0.4], ['type:enchantment', 0.4]),
  },
  {
    when: "for each card type among",
    reads: 'pays you for casting a spread of card types',
    wants: W(['type:instant', 0.7], ['type:sorcery', 0.7], ['type:artifact', 0.7], ['type:enchantment', 0.7], ['type:creature', 0.45]),
  },

  // ------------------------- sacrifice, drain, damage, life, counters, control
  {
    when: "(, sacrifice (a|an|another|three other|any number of)\\b|you may sacrifice any number of)",
    reads: 'sacrifices your own permanents as a cost',
    wants: W(['eff:sacrifice', 0.8], ['trig:dies', 0.7], ['eff:create-token', 0.6], ['eff:return-from', 0.4]),
  },
  {
    when: "(sacrifices? a permanent|sacrifices? an artifact, creature, or land|each player sacrifices|each opponent sacrifices)",
    reads: 'makes everyone sacrifice permanents',
    wants: W(['eff:create-token', 0.8], ['eff:sacrifice', 0.6], ['trig:dies', 0.55], ['eff:return-from', 0.4]),
  },
  {
    when: "(each opponent loses \\w+ life|lost \\d+ or more life|lost life this turn|that player loses \\w+ life)",
    reads: 'is paid when your opponents lose life',
    wants: W(['eff:lose-life', 0.8], ['eff:gain-life', 0.6], ['eff:damage', 0.5]),
  },
  {
    when: "(whenever you gain life|if you gained \\d+ or more life this turn|if you gained life this turn|causes you to gain life)",
    reads: 'is paid whenever you gain life',
    wants: W(['eff:gain-life', 0.85], ['kw:lifelink', 0.65], ['trig:gains-life', 0.6], ['eff:lose-life', 0.4]),
  },
  {
    when: "(double all damage|damage to each player|damage to each opponent|half that player's life total)",
    reads: 'hits every opponent at once',
    wants: W(['eff:damage', 0.85], ['type:instant', 0.55], ['type:sorcery', 0.55], ['eff:lose-life', 0.45]),
  },
  {
    when: "(double (all )?[^.\\n]{0,30}damage|deals double that damage)",
    reads: 'doubles the damage your cards deal',
    wants: W(['eff:damage', 0.85], ['eff:pump', 0.5], ['type:instant', 0.35], ['type:sorcery', 0.35]),
  },
  {
    when: "(proliferate|put one or more counters on|counters? would be put on|plus one of each of those kinds of counters|move a counter from|put your choice of a counter|creatures? you control with counters on them|counters? on (a|another) (creature|permanent))",
    reads: 'piles extra counters onto your permanents',
    wants: W(['eff:add-counters', 0.85], ['ctr:+1/+1', 0.8], ['eff:proliferate', 0.7], ['eff:player-counter', 0.45]),
  },
  {
    when: "put [^.]{0,20}stun counters? on (each|target|those|up to)",
    reads: "taps your opponents' creatures down and keeps them there",
    wants: W(['eff:tap', 0.8], ['eff:proliferate', 0.6], ['eff:untap', 0.35]),
  },
  {
    when: "gain control of target",
    reads: "takes your opponents' permanents",
    wants: W(['eff:gain-control', 0.8], ['eff:untap', 0.55], ['kw:haste', 0.5], ['eff:sacrifice', 0.45]),
  },
  {
    when: "(prevent the next [0-9]|prevent all combat damage|damage that would be dealt to [^.]{0,40} is dealt to)",
    reads: 'keeps your creatures alive through combat',
    wants: W(['kw:indestructible', 0.65], ['kw:protection', 0.6], ['kw:hexproof', 0.5], ['eff:gain-life', 0.5], ['kw:vigilance', 0.4]),
  },
  {
    when: "creature an opponent controls would die, exile it instead",
    reads: 'keeps the creatures your removal kills',
    wants: W(['eff:destroy', 0.85], ['eff:damage', 0.6], ['cares:type:creature', 0.4]),
  },
  {
    when: "(casts? a spell that targets|spell you control that targets|creature you control becomes the target of a spell or ability)",
    reads: 'rewards you for aiming spells at your own creatures',
    wants: W(['sub:aura', 0.7], ['eff:pump', 0.7], ['sub:equipment', 0.5], ['type:instant', 0.45]),
  },
  {
    when: "triggers an additional time|copy target triggered ability",
    reads: 'makes your other triggered abilities happen twice',
    wants: W(['trig:enters', 0.75], ['trig:attacks', 0.75], ['trig:dies', 0.55], ['eff:create-token', 0.45]),
  },
  {
    when: "if (a|another) creature (you control )?died this turn|if (three|two|four|\\d+) or more creatures died this turn",
    reads: 'only pays out on a turn one of your creatures died',
    wants: W(['trig:dies', 0.8], ['eff:sacrifice', 0.75], ['eff:create-token', 0.6]),
  },
  {
    when: "(^|\\n)Flash( |\\n|$)",
    reads: "can be cast on someone else's turn, so the deck holds mana up",
    wants: W(['type:instant', 0.7], ['eff:counter', 0.55], ['kw:flash', 0.5], ['trig:enters', 0.45]),
  },
  {
    when: "deals? [^.\\n]{0,30}damage (divided as you choose |equal to [^.\\n]{0,25})?(to (any target|target creature|that player|each of up to)|divided as you choose among)",
    reads: 'points damage at whatever needs shooting',
    wants: W(['eff:damage', 0.8], ['type:instant', 0.5], ['type:sorcery', 0.5], ['eff:destroy', 0.4]),
  },
  {
    when: "prevent all damage that would be dealt to (?!target|any target|each|all)",
    reads: 'cannot be killed by damage, so the deck arms it and swings',
    wants: W(['sub:equipment', 0.8], ['eff:pump', 0.7], ['sub:aura', 0.6], ['cares:sub:equipment', 0.5]),
  },
  {
    when: "whenever [^.\\n]{0,45}another (nontoken )?creature you control enters",
    reads: 'triggers whenever your other creatures arrive',
    wants: W(['type:creature', 0.75], ['trig:enters', 0.7], ['eff:create-token', 0.5]),
  },
  {
    when: "whenever [^.\\n]{0,25} blocks (one or more|a |another)",
    reads: 'is paid for blocking',
    wants: W(['kw:defender', 0.7], ['kw:vigilance', 0.55], ['eff:pump', 0.5], ['sub:wall', 0.45]),
  },
];

fs.writeFileSync('.shots/coverage-slices/merged.json', JSON.stringify({ rules }, null, 2));
console.log('rules', rules.length);
