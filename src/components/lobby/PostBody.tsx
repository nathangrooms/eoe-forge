import { Fragment, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { tablePath } from '@/lib/lobby';
import { tokenisePost } from '@/lib/lobby/richText';

/**
 * Somebody else's words, on your screen.
 *
 * ---------------------------------------------------------------------------
 * THERE IS NO dangerouslySetInnerHTML IN THIS FILE AND THERE NEVER WILL BE
 * ---------------------------------------------------------------------------
 * `tokenisePost` returns small objects, not markup, and this component turns
 * them into React children. React escapes children. That is the whole defence,
 * and it holds because there is no point in the path where a string of HTML
 * exists to be handed to anything.
 *
 * If a future change wants bold text or card links, it adds a TOKEN KIND and a
 * branch here. It does not add a parser that emits tags, because the moment
 * markup is being produced somebody has to get the escaping right by hand, and
 * this is the one surface in the app where a stranger chooses the input.
 *
 * ---------------------------------------------------------------------------
 * LINKS
 * ---------------------------------------------------------------------------
 * An outside link opens in a new tab with `rel="noopener noreferrer nofollow"`.
 * `noopener` because a page opened from a link can otherwise reach back through
 * `window.opener` and navigate the tab it came from. `nofollow` because the
 * board is readable without an account, which makes it worth something to
 * somebody who wants links from it.
 *
 * A link back into this app is a route, so it does not reload everything, and a
 * link to a table is drawn as the table it is.
 */

export interface PostBodyProps {
  /** Null when a post has been taken down. The words are gone, not hidden. */
  body: string | null;
  /** Passed in rather than read off `window`, so this is testable and honest. */
  origin?: string;
}

export function PostBody({ body, origin }: PostBodyProps) {
  const here = origin ?? globalThis.location?.origin ?? '';
  const tokens = useMemo(() => tokenisePost(body ?? '', here), [body, here]);

  if (body === null) {
    return <p className="text-sm italic text-muted-foreground">This was removed.</p>;
  }

  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
      {tokens.map((token, index) => {
        switch (token.kind) {
          case 'text':
            return <Fragment key={index}>{token.text}</Fragment>;

          case 'link':
            return (
              <a
                key={index}
                href={token.href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="underline underline-offset-2 transition-opacity duration-150 hover:opacity-70"
              >
                {token.label}
              </a>
            );

          case 'route':
            return (
              <Link
                key={index}
                to={token.path}
                className="underline underline-offset-2 transition-opacity duration-150 hover:opacity-70"
              >
                {token.label}
              </Link>
            );

          case 'table':
            return (
              <Link
                key={index}
                to={tablePath(token.code)}
                className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-xs text-foreground transition-opacity duration-150 hover:opacity-70"
              >
                Table {token.code}
              </Link>
            );
        }
      })}
    </p>
  );
}
