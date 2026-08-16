import { z } from "zod";
import { jsonResult, studioFetch } from "../client.js";
function registerAcademyTools(server) {
  server.tool(
    "studio_list_academy_courses",
    "List published Studio Academy courses (price, sale, owned). Requires read scope.",
    { compact: z.boolean().optional() },
    async ({ compact }) => jsonResult(await studioFetch("/academy/courses"), compact)
  );
  server.tool(
    "studio_list_my_academy_courses",
    "List Academy courses this account owns or has an active deposit plan on. Requires read scope.",
    { compact: z.boolean().optional() },
    async ({ compact }) => jsonResult(await studioFetch("/academy/courses/mine"), compact)
  );
  server.tool(
    "studio_get_academy_course",
    "Get one Academy course by courseId or slug (lessons, price, owned). Requires read scope.",
    {
      courseId: z.string().optional(),
      slug: z.string().optional(),
      compact: z.boolean().optional()
    },
    async ({ courseId, slug, compact }) => {
      const key = courseId?.trim() || slug?.trim();
      if (!key) {
        return jsonResult({ error: "courseId or slug is required" });
      }
      return jsonResult(
        await studioFetch(`/academy/courses/${encodeURIComponent(key)}`),
        compact
      );
    }
  );
  server.tool(
    "studio_purchase_academy_course",
    "Unlock an Academy course by spending Studio credits. If a Wam deposit is in progress this fails \u2014 use studio_start_checkout with academyCourseId instead. Requires generate scope. Confirm with the user before calling.",
    {
      courseId: z.string(),
      compact: z.boolean().optional()
    },
    async ({ courseId, compact }) => jsonResult(
      await studioFetch(
        `/academy/courses/${encodeURIComponent(courseId)}/purchase`,
        { method: "POST", body: JSON.stringify({}) }
      ),
      compact
    )
  );
  server.tool(
    "studio_get_academy_intro",
    "Signed intro/preview playback URL for a course (no purchase required). Requires read scope.",
    {
      courseId: z.string(),
      compact: z.boolean().optional()
    },
    async ({ courseId, compact }) => jsonResult(
      await studioFetch(
        `/academy/courses/${encodeURIComponent(courseId)}/intro`
      ),
      compact
    )
  );
  server.tool(
    "studio_get_academy_lesson",
    "Signed lesson playback URL. Course must already be owned. Requires read scope.",
    {
      lessonId: z.string(),
      compact: z.boolean().optional()
    },
    async ({ lessonId, compact }) => jsonResult(
      await studioFetch(
        `/academy/lessons/${encodeURIComponent(lessonId)}/playback`
      ),
      compact
    )
  );
}
export {
  registerAcademyTools
};
