export const NAVIGATION_EVENT = "max:navigation";

const LEGACY_ROUTE = /^#(?:projects(?:\/|$)|blog$|papers$|profiles$)/;

export function readRoute(location = window.location) {
  return {
    pathname: location.pathname || "/",
    search: location.search || "",
    hash: location.hash || "",
  };
}

export function legacyRouteHref(hash) {
  const value = String(hash || "");
  return LEGACY_ROUTE.test(value) ? `/${value.slice(1)}` : null;
}

export function migrateLegacyRoute(
  location = window.location,
  history = window.history,
) {
  const href = legacyRouteHref(location.hash);
  if (!href) return false;
  history.replaceState(history.state, "", href);
  return true;
}

export function navigateTo(href, options = {}) {
  const target = new URL(href, window.location.href);
  if (target.origin !== window.location.origin) {
    window.location.assign(target.href);
    return;
  }

  const method = options.replace ? "replaceState" : "pushState";
  window.history[method](
    options.replace ? window.history.state : null,
    "",
    `${target.pathname}${target.search}${target.hash}`,
  );
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
}
