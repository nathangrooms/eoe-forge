import { Link } from 'react-router-dom';
import { LegalDocument, LegalSection } from '@/components/legal/LegalDocument';
import { LEGAL_UPDATED } from '@/lib/legal/updated';

/**
 * ⚠️ THE OWNER MUST READ THIS BEFORE LAUNCH. See the same note on Terms.tsx.
 *
 * Every statement below was checked against the code rather than written from a
 * template, because a privacy page that describes a different product is worse
 * than none:
 *
 *   - sign-in and sessions:  src/integrations/supabase/client.ts, which sets
 *     `auth.storage = localStorage` and `persistSession: true`. So the session
 *     lives in browser storage, not in a cookie, and there is no cookie banner
 *     to show because there are no tracking cookies to consent to.
 *   - what a profile holds:  `profiles` carries username and avatar_url; the
 *     email address lives in Supabase auth.
 *   - no third party analytics:  grepped index.html, main.tsx and App.tsx for
 *     gtag, googletagmanager, analytics, plausible, posthog, mixpanel and
 *     sentry. Zero hits. If any of those is ever added, this page has to change
 *     in the same commit.
 *   - card data source:  Scryfall, per section 6 of CLAUDE.md.
 *
 * What is NOT written here, because it could not be verified: the legal entity
 * behind the service, where it is established, which data protection regulator
 * it answers to, how long backups are retained, and the named routes for a
 * subject access or erasure request under UK GDPR or GDPR. Those are real
 * obligations and they need real answers before launch.
 */
export default function Privacy() {
  return (
    <LegalDocument
      title="Privacy"
      standfirst="What DeckMatrix stores, why it stores it, and what it does not do with it."
      updated={LEGAL_UPDATED}
      sibling={{ to: '/terms', label: 'Terms of use' }}
    >
      <LegalSection heading="The short version">
        <p>
          We store the things you type in so that they are still there next time: your decks,
          your collection, your lists and your posts. We do not sell any of it, we do not share
          it with advertisers, and there are no tracking scripts on this site.
        </p>
      </LegalSection>

      <LegalSection heading="What is stored when you create an account">
        <p>Your email address, used to sign you in and to reset your password.</p>
        <p>
          A username and, if you set one, a profile picture. Your username is visible to other
          members, so pick something you are happy for other people to see. If you type your
          email address into it, other members can see that too.
        </p>
        <p>We do not ask for your real name, your address or your date of birth.</p>
      </LegalSection>

      <LegalSection heading="What is stored as you use it">
        <p>
          The decks you build and the cards in them. The cards you record as owned, including
          quantity, condition, which printing and which box you keep it in. Your wishlist,
          shopping list and proxy list.
        </p>
        <p>
          Anything you list for sale, and the messages you send about a listing. Posts and
          replies you write on the discussion board. Games you play, while the table exists.
        </p>
        <p>
          When a published deck is opened, the fact that it was opened is recorded so the deck's
          owner can see a view count. That record is about the deck, not about who read it.
        </p>
      </LegalSection>

      <LegalSection heading="Payment details">
        <p>
          None are asked for and none are stored. DeckMatrix does not take payment. If that ever
          changes, payment would be handled by a payment provider and this page would say who
          before it happened.
        </p>
      </LegalSection>

      <LegalSection heading="Cookies and tracking">
        <p>
          There are no advertising cookies, no analytics scripts and no third party trackers on
          this site. Nothing follows you to other sites.
        </p>
        <p>
          Staying signed in works by keeping a session in your own browser's storage. It is on
          your device, it is what stops you having to type your password on every page, and
          clearing your browser data signs you out.
        </p>
      </LegalSection>

      <LegalSection heading="Who else can see it">
        <p>
          Other members can see your username, anything you post on the board, anything you list
          for sale and any deck you have chosen to publish. Nothing else.
        </p>
        <p>
          Your collection is private. Your unpublished decks are private. Your lists are private.
          The database enforces that per row rather than relying on a screen not showing it.
        </p>
      </LegalSection>

      <LegalSection heading="Where it is kept">
        <p>
          Account data is stored with Supabase, which hosts the database and handles sign-in.
          The site itself is served by Vercel. Card names, images, rules text and prices come
          from Scryfall.
        </p>
        <p>
          Opening a card image loads it from Scryfall, so Scryfall sees the request the same way
          any site loading an image from elsewhere would.
        </p>
      </LegalSection>

      <LegalSection heading="How long it is kept">
        <p>
          Your data is kept while your account exists. Ask us to delete your account and the
          decks, collection, lists and listings attached to it go with it.
        </p>
        <p>
          Posts you have written on the board are handled the way the terms describe: the words
          are deleted and an empty row is kept so replies underneath still make sense.
        </p>
      </LegalSection>

      <LegalSection heading="Getting a copy, or getting it deleted">
        <p>
          You can export your collection to a spreadsheet at any time from the collection page,
          and any deck to a text list from the deck page. You do not have to ask anybody for
          that.
        </p>
        <p>
          To have your account and everything in it deleted, ask on the{' '}
          <Link to="/play/online" className="text-foreground underline underline-offset-4">
            open discussion board
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>
          DeckMatrix is not aimed at children. Do not create an account if you are under the age
          your country sets for agreeing to online services on your own.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this page">
        <p>
          If what we store or who we store it with changes, this page changes and the date at the
          top changes with it.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
