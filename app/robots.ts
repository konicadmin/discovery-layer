import type { MetadataRoute } from "next";
import { absoluteUrl, getSiteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const publicRules = {
    allow: [
      "/",
      "/vendors/",
      "/pricing",
      "/pricing/",
      "/llms.txt",
      "/llms-full.txt",
      "/sitemap.xml",
    ],
    disallow: ["/admin", "/buyer", "/vendor", "/api/internal", "/api/buyer"],
  };

  return {
    rules: [
      { userAgent: "*", ...publicRules },
      { userAgent: "OAI-SearchBot", ...publicRules },
      { userAgent: "GPTBot", ...publicRules },
      { userAgent: "ChatGPT-User", ...publicRules },
      { userAgent: "ClaudeBot", ...publicRules },
      { userAgent: "Claude-SearchBot", ...publicRules },
      { userAgent: "PerplexityBot", ...publicRules },
      { userAgent: "Google-Extended", ...publicRules },
      { userAgent: "Googlebot", ...publicRules },
      { userAgent: "Bingbot", ...publicRules },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: getSiteUrl(),
  };
}

