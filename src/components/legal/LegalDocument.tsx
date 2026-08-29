import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface LegalDocumentProps {
  title: string;
  /** Plain sentence under the title. Not a summary of the whole document. */
  standfirst: string;
  /** The date the wording last changed. Real, and read from one place. */
  updated: string;
  /** The other document, so the two are never a dead end from each other. */
  sibling: { to: string; label: string };
  children: ReactNode;
}

/**
 * The shell both legal documents sit in.
 *
 * Deliberately plain. Charcoal ground, no borders, no card art: this is the one
 * kind of page in the product where decoration reads as an attempt to distract
 * from the words. What it does owe the reader is a comfortable measure, real
 * heading structure and a visible way back, because the person reading it is
 * usually part way through creating an account.
 */
export function LegalDocument({
  title,
  standfirst,
  updated,
  sibling,
  children,
}: LegalDocumentProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-md py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to DeckMatrix
        </Link>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">{standfirst}</p>
        <p className="mt-6 text-xs uppercase tracking-wide text-muted-foreground/80">
          Last updated {updated}
        </p>

        <div className="legal-prose mt-10 space-y-8">{children}</div>

        <div className="mt-14 space-y-3 rounded-xl bg-muted/30 p-6">
          <p className="text-sm text-muted-foreground">
            The other half of the small print:
          </p>
          <Link
            to={sibling.to}
            className="inline-flex text-sm font-medium text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {sibling.label}
          </Link>
        </div>
      </div>
    </div>
  );
}

/** One numbered section. The heading is a real `h2` so it can be jumped to. */
export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  const id = heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-lg font-semibold tracking-tight">
        {heading}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}
