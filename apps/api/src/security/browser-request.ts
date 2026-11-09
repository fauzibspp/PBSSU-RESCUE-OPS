/**
 * Validate browser request metadata for cookie-authenticated safe reads.
 * Fetch Metadata and Referer are defense-in-depth signals; callers must still
 * require the bound session and CSRF double-submit token.
 */
export function isTrustedCookieReadRequest(
  origin: string | undefined,
  referer: string | undefined,
  fetchSite: string | undefined,
  trustedOrigin: string,
  allowOriginlessRead: boolean,
): boolean {
  if (origin !== undefined) {
    if (origin !== trustedOrigin) return false;
  } else if (!allowOriginlessRead || fetchSite !== "same-origin") {
    return false;
  }

  if (fetchSite !== undefined && fetchSite !== "same-origin") return false;

  if (referer !== undefined) {
    try {
      if (new URL(referer).origin !== trustedOrigin) return false;
    } catch {
      return false;
    }
  }

  return true;
}
