/**
 * @deprecated Prefer services/studio-agent/piTools.mjs (Pi defineTool + TypeBox).
 * This adapter used plain JSON Schema and wrong execute arity — causes Unknown tool.
 */
export function createPiStudioTools() {
  throw new Error(
    "createPiStudioTools is retired. Use services/studio-agent/piTools.mjs createStudioPiTools (Pi SDK defineTool).",
  );
}
