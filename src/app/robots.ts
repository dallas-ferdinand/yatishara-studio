import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/pay/", "/api/", "/desk/", "/admin/"],
      },
    ],
    sitemap: "https://studio.yatishara.com/sitemap.xml",
    host: "https://studio.yatishara.com",
  };
}
