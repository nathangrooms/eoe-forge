import { ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface AuthLayoutProps {
  title: string;
  description: string;
  children: ReactNode;
  showBackToHome?: boolean;
}

/**
 * Split auth layout: the six-panel colour artwork holds the full height of one
 * side on desktop and sits behind the form on mobile.
 *
 * Replaces a purple gradient with an animated grid, four blurred floating orbs,
 * and a "Trusted by thousands of Magic players worldwide" line that was not
 * true — the product is pre-launch.
 */
export function AuthLayout({
  title, description, children, showBackToHome = true,
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      {/* ---------------- artwork ---------------- */}
      <div className="relative hidden lg:block">
        <img
          src="/hero-1280.webp"
          srcSet="/hero-768.webp 768w, /hero-1280.webp 1280w, /hero-1920.webp 1920w"
          sizes="50vw"
          alt=""
          aria-hidden="true"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-background/40 via-transparent to-background"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-background/30"
        />
        {/* Dedicated ground for the tagline: the art is bright and high-chroma
            down there, and thin white type was picking up colour from it. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background via-background/85 to-transparent"
        />

        <div className="relative flex h-full flex-col justify-between p-10">
          <Link to="/" className="inline-flex w-fit">
            <Logo size="md" />
          </Link>

          <div className="max-w-sm">
            <p className="text-2xl font-medium leading-snug text-balance">
              Every card you own, in one place.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Catalogue your collection, track where each card is stored, and build decks
              against what is already on your shelf.
            </p>
          </div>
        </div>
      </div>

      {/* ---------------- form ---------------- */}
      <div className="relative flex min-h-screen items-center justify-center p-6 lg:min-h-0">
        {/* Mobile: the same artwork sits behind the form. */}
        <div className="absolute inset-0 lg:hidden" aria-hidden="true">
          <img
            src="/hero-768.webp"
            alt=""
            decoding="async"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-background/90" />
        </div>

        <div className="relative w-full max-w-sm">
          {showBackToHome && (
            <Link
              to="/"
              className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to home
            </Link>
          )}

          <Link to="/" className="mb-8 inline-flex lg:hidden">
            <Logo size="md" />
          </Link>

          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>

          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
