import { z } from "zod";
import { jsonResult, studioFetch } from "../client.js";
function registerVoiceTools(server) {
  server.tool(
    "studio_explore_voices",
    "Browse ElevenLabs voices for voiceover generation. Use voice_id as elevenVoiceId in studio_generate_audio.",
    {
      search: z.string().optional(),
      language: z.string().optional(),
      accent: z.string().optional(),
      gender: z.string().optional(),
      age: z.string().optional(),
      category: z.string().optional(),
      sort: z.string().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional()
    },
    async (args) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(args)) {
        if (value !== void 0 && value !== null && value !== "") {
          params.set(key, String(value));
        }
      }
      const query = params.toString() ? `?${params}` : "";
      return jsonResult(await studioFetch(`/voices${query}`));
    }
  );
  server.tool(
    "studio_list_saved_voices",
    "List Studio favorite voices for this API key owner.",
    {},
    async () => jsonResult(await studioFetch("/voices/saved"))
  );
  server.tool(
    "studio_save_voice",
    "Save a voice favorite for faster reuse. Requires write scope.",
    {
      voiceId: z.string(),
      name: z.string(),
      publicOwnerId: z.string().optional(),
      previewUrl: z.string().optional(),
      language: z.string().optional(),
      accent: z.string().optional(),
      gender: z.string().optional(),
      age: z.string().optional(),
      category: z.string().optional(),
      description: z.string().optional()
    },
    async (args) => jsonResult(
      await studioFetch("/voices/saved", {
        method: "POST",
        body: JSON.stringify(args)
      })
    )
  );
  server.tool(
    "studio_remove_voice",
    "Remove a saved voice favorite. Requires write scope.",
    { voiceId: z.string() },
    async ({ voiceId }) => jsonResult(
      await studioFetch(`/voices/saved/${encodeURIComponent(voiceId)}`, {
        method: "DELETE"
      })
    )
  );
}
export {
  registerVoiceTools
};
