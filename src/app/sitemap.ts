import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://studio.yatishara.com/",
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://yatishara.com/",
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: "https://link.yatishara.com/",
      changeFrequency: "weekly",
      priority: 0.6,
    },
  ];
}
