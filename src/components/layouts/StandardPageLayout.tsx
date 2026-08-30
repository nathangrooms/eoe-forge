import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { StandardSectionHeader } from '@/components/ui/standardized-components';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { findActiveNavItem } from '@/components/navigation/nav-items';

interface StandardPageLayoutProps {
  title: ReactNode;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Set false on pages that render their own positional cue. */
  breadcrumbs?: boolean;
}

export function StandardPageLayout({
  title,
  description,
  action,
  children,
  className = '',
  breadcrumbs = true,
}: StandardPageLayoutProps) {
  const { pathname } = useLocation();
  const navItem = findActiveNavItem(pathname);

  // Only nested routes get a breadcrumb. On `/decks` the rail already says where
  // you are; on `/deck/:id` — which had no positional cue at all — it does not.
  const showBreadcrumbs = breadcrumbs && navItem && pathname !== navItem.href;

  /*
   * THE SECOND CRUMB IS THE FIRST ONE AGAIN WHEN THE NAV ITEM IS THE ROOT.
   *
   * `NAV_HOME` is `href: '/'` with `matches: ['/dashboard']`, so on the
   * dashboard `pathname !== navItem.href` is true, the breadcrumb renders, and
   * it reads "Home › Home › Welcome back, Harness". Two crumbs with the same
   * label pointing at the same URL.
   *
   * Tested on the nav item rather than on the pathname. Hiding the crumb
   * whenever the route is one of the item's `matches` would have been the
   * obvious rule and it is wrong: "My Decks" lists `/precons` and
   * `/templates` among its matches and those are real nested pages whose
   * breadcrumb is the only thing saying where they sit.
   */
  const navCrumbIsRoot = navItem?.href === '/';

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 pb-6 pt-2 md:px-6 md:pt-4">
      {showBreadcrumbs && (
        <Breadcrumb className="mb-3">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {!navCrumbIsRoot && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to={navItem.href}>{navItem.title}</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </>
            )}
            {typeof title === 'string' && title.trim().length > 0 && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="max-w-[16rem] truncate">{title}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      )}

      <StandardSectionHeader title={title} description={description} action={action} />

      <div className={`mt-4 overflow-x-hidden md:mt-6 ${className}`}>{children}</div>
    </div>
  );
}
