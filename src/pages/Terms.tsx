import { Link } from 'react-router-dom';
import { LegalDocument, LegalSection } from '@/components/legal/LegalDocument';
import { LEGAL_UPDATED } from '@/lib/legal/updated';

/**
 * ⚠️ THE OWNER MUST READ THIS BEFORE LAUNCH.
 *
 * The sign-up form has been telling people, in shipped copy, that creating an
 * account means agreeing to "the DeckMatrix Terms of Service and Privacy
 * Policy". Neither document existed anywhere in the repo, neither phrase was a
 * link, and `/terms` and `/privacy` were not routes, so typing them landed on
 * the sign-in wall. Asking somebody to agree to a document they cannot read is
 * the sort of thing that is worth fixing before a launch and not after one.
 *
 * WHAT IS WRITTEN HERE IS ONLY WHAT COULD BE VERIFIED FROM THE PRODUCT ITSELF:
 * what the service is, what an account may and may not do with it, and the Fan
 * Content position, which is already stated in the homepage FAQ and in
 * THIRD-PARTY-NOTICES.md. Nothing invents a company, an address, a governing
 * jurisdiction, a liability cap, an arbitration clause or a refund policy,
 * because none of those facts exist anywhere I could read them, and guessing at
 * them would be worse than the gap they fill.
 *
 * That means this is a plain statement of how the service works, and it is NOT
 * a substitute for the paragraphs a solicitor would add. Have it reviewed.
 */
export default function Terms() {
  return (
    <LegalDocument
      title="Terms of use"
      standfirst="What DeckMatrix is, what you can do with it, and what it does not promise."
      updated={LEGAL_UPDATED}
      sibling={{ to: '/privacy', label: 'Privacy' }}
    >
      <LegalSection heading="What this is">
        <p>
          DeckMatrix is a deck builder and collection tracker for Magic: The Gathering. You
          record the cards you own, build decks against that list, and play games in the browser.
          It is run as a small independent project and it is in early access.
        </p>
        <p>
          Early access means features change, some of them are unfinished, and screens you use
          today may work differently next month. Where a number is estimated rather than measured,
          the page you are reading says so.
        </p>
      </LegalSection>

      <LegalSection heading="Your account">
        <p>
          You need an account to build decks, record a collection or sit down at a table. Keep
          your password to yourself. You are responsible for what happens under your account.
        </p>
        <p>
          One person, one account. Do not sign up on behalf of somebody else, and do not create
          an account if you are under the age your country sets for agreeing to online services
          on your own.
        </p>
        <p>
          You can stop using DeckMatrix at any time. Ask us to delete your account and the decks,
          collection and lists attached to it are deleted with it.
        </p>
      </LegalSection>

      <LegalSection heading="Your cards, decks and lists belong to you">
        <p>
          The decks you build, the collection you record and the lists you keep are yours. We do
          not claim ownership of them and we do not sell them.
        </p>
        <p>
          A deck is private until you publish it. Publishing one creates a link anybody can open,
          so only publish a deck you are happy for other people to read. You can unpublish it
          again.
        </p>
      </LegalSection>

      <LegalSection heading="The discussion board">
        <p>
          Anybody can read the open board. You need an account to post. Write the way you would
          talk at a table you want to be invited back to.
        </p>
        <p>
          Do not post anything unlawful, anything that harasses another person, or anything that
          is not yours to post. Posts that break that can be removed and accounts that keep
          breaking it can be blocked from posting.
        </p>
        <p>
          You can remove your own posts, and you can report somebody else's. Removing a post
          deletes the words. The empty row is kept only so that any reply written underneath it
          still makes sense.
        </p>
      </LegalSection>

      <LegalSection heading="Buying and selling between members">
        <p>
          Where DeckMatrix lets you list a card for sale, it is showing you what another member
          has listed and passing on messages. It is not the seller, it does not take payment, it
          does not hold the card and it does not check that either side does what they said they
          would.
        </p>
        <p>
          Any deal you make is between you and the other person. Agree how you will pay and how
          the card will be sent before you send anything.
        </p>
      </LegalSection>

      <LegalSection heading="Prices are estimates">
        <p>
          Prices come from published market data and are refreshed on a schedule. They are an
          estimate of what a card has been selling for. They are not a quote, not an offer, and
          they will not match any particular shop, buylist or auction on any particular day.
        </p>
        <p>
          Where we hold no price for a card, the page leaves it blank and says so rather than
          showing zero. Do not use a DeckMatrix figure as the sole basis for an insurance claim,
          a sale or a purchase without checking it yourself.
        </p>
      </LegalSection>

      <LegalSection heading="What you should not do">
        <p>
          Do not try to break into other people's accounts or data. Do not scrape the site in
          bulk or hammer it with automated traffic. Do not resell access to it. Do not upload
          anything designed to damage the service or the people using it.
        </p>
      </LegalSection>

      <LegalSection heading="Card data, images and Fan Content">
        <p>
          Card names, rules text, images, printings and format legality come from Scryfall.
          Card images are shown whole and unmodified.
        </p>
        <p>
          DeckMatrix is unofficial Fan Content permitted under the Wizards of the Coast Fan
          Content Policy. It is not approved or endorsed by Wizards. Portions of the materials
          used are property of Wizards of the Coast. Magic: The Gathering is a trademark of
          Wizards of the Coast LLC.
        </p>
        <p>
          The open source projects DeckMatrix builds on, and the licences they are used under,
          are listed in the project's third party notices.
        </p>
      </LegalSection>

      <LegalSection heading="No warranty">
        <p>
          DeckMatrix is provided as it is. We do not promise it will always be available, that
          every figure it shows is correct, or that nothing will ever be lost. Keep your own copy
          of anything you would be upset to lose. The export on the collection page is there for
          exactly that.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to these terms">
        <p>
          If these terms change, the date at the top of this page changes with them. If a change
          materially affects what you can do with your account, existing accounts will be told
          before it takes effect.
        </p>
      </LegalSection>

      <LegalSection heading="Getting in touch">
        <p>
          Questions about these terms, or about your account, can be raised on the{' '}
          <Link to="/play/online" className="text-foreground underline underline-offset-4">
            open discussion board
          </Link>
          , which is readable without an account.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
