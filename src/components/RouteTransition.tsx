import { forwardRef, type ComponentPropsWithoutRef, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { Link, useLocation, useNavigate, useResolvedPath } from "react-router-dom";
import { runRouteUpdate } from "@/lib/navigation/routeTransition";

type RouteLinkProps = ComponentPropsWithoutRef<typeof Link>;

/**
 * A router Link whose click is wrapped in a View Transition, so the current page
 * fades out while the next one settles in. Modified clicks, downloads, new tabs
 * and links to the current location keep their native Link behaviour.
 */
export const RouteLink = forwardRef<HTMLAnchorElement, RouteLinkProps>(function RouteLink(
  { to, replace = false, state, relative, preventScrollReset, onClick, target, download, ...rest },
  ref,
) {
  const navigate = useNavigate();
  const location = useLocation();
  const resolved = useResolvedPath(to);
  const isCurrent =
    resolved.pathname === location.pathname &&
    resolved.search === location.search &&
    resolved.hash === location.hash;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (target && target !== "_self") return;
    if (download !== undefined || isCurrent) return;

    event.preventDefault();
    runRouteUpdate(() => {
      flushSync(() => navigate(to, { replace, state, relative, preventScrollReset }));
    });
  };

  return (
    <Link
      ref={ref}
      to={to}
      replace={replace}
      state={state}
      relative={relative}
      preventScrollReset={preventScrollReset}
      onClick={handleClick}
      target={target}
      download={download}
      {...rest}
    />
  );
});
