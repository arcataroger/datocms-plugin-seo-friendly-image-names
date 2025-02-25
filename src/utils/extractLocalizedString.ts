/**
 * Extracts a localized string from an unknown input.
 *
 * If the input is a string, it is returned directly.
 * If the input is an object, it attempts to find a key that starts with the provided locale.
 * If an exact match isn't found and the locale contains a region (e.g. "en-US"),
 * it will also try to find a key that starts with the base language (e.g. "en").
 * If a matching key is found and its value is a non-empty string, that string is returned.
 * Otherwise, it returns an empty string.
 *
 * @param input - The unknown input which might be a string or a localized object.
 * @param locale - The locale to look for (e.g., "en-US", "fr", etc.).
 * @returns The localized string if found, otherwise '' (empty string).
 */
export const extractLocalizedString = (
  input: unknown,
  locale: string,
): string => {
  const emptyString = ""; // What to return on error states

  // If the input is a string, return it as is.
  if (typeof input === "string") {
    return input;
  }

  // If the input is an object, attempt to find a localized string.
  if (input && typeof input === "object") {
    const maybeResult = input as Record<string, unknown>;

    // Try to find the first key that starts with the provided locale.
    let closestLocale = Object.keys(maybeResult).find((key) =>
      key.startsWith(locale),
    );

    // If no exact match is found and the locale includes a region code (e.g. "en-US"),
    // fall back to searching for the base language (e.g. "en").
    if (!closestLocale && locale.includes("-")) {
      const baseLocale = locale.split("-")[0];
      closestLocale = Object.keys(maybeResult).find((key) =>
        key.startsWith(baseLocale),
      );
    }

    if (!closestLocale) {
      return emptyString;
    }

    const maybeStringFromClosestLocale = maybeResult[closestLocale];

    // If the localized value is a non-empty string, return it.
    if (
      typeof maybeStringFromClosestLocale === "string" &&
      maybeStringFromClosestLocale.length > 0
    ) {
      return maybeStringFromClosestLocale;
    }
  }

  // If none of the conditions match, return an empty string.
  return emptyString;
};
