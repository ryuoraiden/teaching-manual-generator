import type { LinkItem, LinkType } from "./manual-schema";

/**
 * Turns model-suggested *search intents* into guaranteed-valid URLs.
 *
 * The LLM never writes URLs (it hallucinates dead ones). It only proposes
 * {label, searchQuery, platform}; this module builds a search URL that cannot
 * 404. Teachers can still paste exact deep links by hand in the editor.
 */

export const RESOURCE_PLATFORMS = ["youtube", "wikipedia", "google"] as const;
export type ResourcePlatform = (typeof RESOURCE_PLATFORMS)[number];

export interface ResourceSuggestion {
  label: string;
  searchQuery: string;
  platform: ResourcePlatform;
}

const MALAYALAM_RE = /[ഀ-ൿ]/u;

export function suggestionToLink(s: ResourceSuggestion): LinkItem {
  const q = encodeURIComponent(s.searchQuery.trim());
  let url: string;
  let linkType: LinkType;

  switch (s.platform) {
    case "youtube":
      url = `https://www.youtube.com/results?search_query=${q}`;
      linkType = "video";
      break;
    case "wikipedia": {
      // Malayalam queries go to ml.wikipedia, everything else to en.
      const lang = MALAYALAM_RE.test(s.searchQuery) ? "ml" : "en";
      url = `https://${lang}.wikipedia.org/w/index.php?search=${q}`;
      linkType = "resource";
      break;
    }
    default:
      url = `https://www.google.com/search?q=${q}`;
      linkType = "resource";
  }

  return { kind: "link", label: s.label.trim(), url, linkType };
}

/** Known-good Kerala/education portals offered as quick-adds in the editor. */
export const CURATED_PORTALS: LinkItem[] = [
  {
    kind: "link",
    label: "Samagra (KITE Kerala) resource portal",
    url: "https://samagra.kite.kerala.gov.in",
    linkType: "resource",
  },
  {
    kind: "link",
    label: "DIKSHA national teaching resources",
    url: "https://diksha.gov.in",
    linkType: "resource",
  },
  {
    kind: "link",
    label: "KITE VICTERS channel (YouTube)",
    url: "https://www.youtube.com/@itsvicters",
    linkType: "video",
  },
  {
    kind: "link",
    label: "PhET interactive simulations",
    url: "https://phet.colorado.edu",
    linkType: "simulation",
  },
];
