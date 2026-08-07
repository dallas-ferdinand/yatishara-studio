const PULL_FRAMES_GUIDE = `# Pull frames from Studio videos

Use this when you need to *see* what's in an MP4 before trimming or after a cut. Cursor cannot scrub video via Read \u2014 pull stills, then Read the image URLs.

## Tool

**\`studio_pull_frames\`** (preferred). Alias: \`studio_sample_video_frames\` (deprecated).

### Range + count (usual)

\`\`\`json
{
  "assetId": "<video asset id>",
  "startSec": 6,
  "endSec": 10,
  "count": 4
}
\`\`\`

Evenly spaced samples in \`[startSec, endSec]\` (inclusive endpoints when count \u2265 2). Default window = full duration; default count = 3; max count = 12.

### Exact times

\`\`\`json
{ "assetId": "...", "timesSec": [0.5, 7.5, 14] }
\`\`\`

\`timesSec\` overrides start/end/count when set.

## Where files go

Stills are named \`Frame \xB7 {clip} \xB7 {time}.jpg\` and saved in a **sibling** folder **\`Pulled Frames\`** under the same parent as the source folder (not next to the clips). Response includes \`folderId\` + \`folderPath\`.

Single-frame edit pulls (\`studio_pull_frame\`) use the same folder.

## Agent lane

1. \`studio_pull_frames\` on each candidate source
2. Cursor **Read** each \`preferredViewUrl\`
3. \`studio_create_edit\` / trim / \`studio_update_edit\`
4. \`studio_pull_frame\` or another \`studio_pull_frames\` to verify
5. \`studio_export_edit\`
6. Trash \`Pulled Frames\` contents when done (optional)

Keep source audio unless the user asks to mute. Prefer full \`studio_update_edit\` if the open editor races granular clip ops. Do not shell-ffmpeg for this \u2014 the MCP tools exist.
`;
function registerGuideResources(server) {
  server.resource(
    "pull-frames",
    "studio://guides/pull-frames",
    {
      description: "How to pull N video stills between two times, where they save (Pulled Frames), and the edit QC lane.",
      mimeType: "text/markdown"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: PULL_FRAMES_GUIDE
        }
      ]
    })
  );
}
export {
  registerGuideResources
};
