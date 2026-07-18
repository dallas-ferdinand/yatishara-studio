// @ts-nocheck
"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { api } from "../../../convex/_generated/api";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { EditorPreview } from "./EditorPreview";
import {
  EditorInspector,
  EditorModeRail,
  inspectorPanelOpen,
} from "./EditorInspector";
import { EditorTimeline, EditorTransportBar } from "./EditorTimeline";
import {
  clipDuration,
  createEmptyProject,
  createInitialState,
  projectEndTime,
  reducer,
} from "./editorState";
import { useEditorHotkeys } from "./useEditorHotkeys";
import { jointByKey } from "./editorTimelineUtils";
import {
  DEFAULT_AUDIO_CLIP_SEC,
  DEFAULT_IMAGE_CLIP_SEC,
  DEFAULT_VIDEO_CLIP_SEC,
  defaultClipDuration,
} from "./editorDnd";
import { MAX_PPS, MIN_PPS } from "./types";

function probeMediaDuration(url, fallback = DEFAULT_VIDEO_CLIP_SEC) {
  return new Promise((resolve) => {
    if (!url || typeof document === "undefined") {
      resolve(fallback);
      return;
    }
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const finish = (value) => {
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };
    video.onloadedmetadata = () => {
      const duration = Number(video.duration);
      finish(Number.isFinite(duration) && duration > 0.1 ? duration : fallback);
    };
    video.onerror = () => finish(fallback);
    video.src = url;
  });
}

export function StudioVideoEditor({
  folderId,
  projectId,
  sourceAssetId,
  sourceAssetName,
  onOpenAsset,
  onStatus,
  onProjectSaved,
}) {
  const [urlExpiresUnix] = useState(() => Math.floor(Date.now() / 1000) + 60 * 60 * 12);
  const saveTimerRef = useRef(null);
  const saveChainRef = useRef(Promise.resolve());
  const creatingProjectRef = useRef(false);

  const existing = useQuery(api.videoEdits.get, projectId ? { projectId } : "skip");
  const existingBySource = useQuery(
    api.videoEdits.getBySourceAsset,
    sourceAssetId && !projectId ? { sourceAssetId } : "skip",
  );
  const folderAssets = useQuery(api.assets.listByFolder, {
    folderId,
    expiresUnix: urlExpiresUnix,
    quality: "preview",
  });

  const saveProject = useMutation(api.videoEdits.save);
  const ensureEditProxy = useMutation(api.assets.ensureEditProxy);
  const exportProject = useAction(api.videoEditActions.exportVideo);
  const requestedProxyIdsRef = useRef(new Set());

  useEffect(() => {
    for (const asset of folderAssets ?? []) {
      if (
        asset.kind !== "video" ||
        asset.editProxyStatus === "ready" ||
        requestedProxyIdsRef.current.has(asset._id)
      ) {
        continue;
      }
      requestedProxyIdsRef.current.add(asset._id);
      void ensureEditProxy({ assetId: asset._id }).catch(() => {
        requestedProxyIdsRef.current.delete(asset._id);
      });
    }
  }, [ensureEditProxy, folderAssets]);

  const [state, dispatch] = useReducer(reducer, null, () =>
    createInitialState(
      createEmptyProject({
        name: sourceAssetName ? `${sourceAssetName} edit` : "New edit",
        folderId,
        sourceAssetId,
      }),
    ),
  );
  const [hydrated, setHydrated] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [localProjectId, setLocalProjectId] = useState(projectId ?? null);

  // Remount-safe reset when the shell swaps projects without a new component key.
  useEffect(() => {
    // First autosave can surface a projectId for the same in-memory edit — keep clips.
    if (hydrated && projectId && localProjectId && projectId === localProjectId) {
      return;
    }
    setHydrated(false);
    setLocalProjectId(projectId ?? null);
    setSaveError(null);
    creatingProjectRef.current = false;
    dispatch({
      type: "replace_project",
      project: createEmptyProject({
        name: sourceAssetName ? `${sourceAssetName} edit` : "New edit",
        folderId,
        sourceAssetId,
      }),
    });
    // Intentionally omit sourceAssetName / hydrated / localProjectId —
    // rename and first-save promotion must not wipe the timeline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sourceAssetId, folderId]);

  useEffect(() => {
    if (hydrated) return;
    const saved = existing ?? existingBySource;
    if (projectId && existing === undefined) return;
    if (sourceAssetId && !projectId && existingBySource === undefined) return;

    if (projectId && existing === null) {
      setSaveError("This edit project could not be loaded.");
      setHydrated(true);
      return;
    }

    if (saved?.project) {
      dispatch({ type: "replace_project", project: saved.project });
      setLocalProjectId(saved._id);
      onProjectSaved?.(saved._id, saved.name);
      setHydrated(true);
      return;
    }

    if (sourceAssetId && folderAssets === undefined) return;

    let cancelled = false;
    (async () => {
      if (sourceAssetId && folderAssets?.length) {
        const source = folderAssets.find((asset) => asset._id === sourceAssetId);
        if (source?.kind === "video") {
          const duration = await probeMediaDuration(source.signedReadUrl);
          if (cancelled) return;
          dispatch({
            type: "add_clip",
            clip: {
              assetId: source._id,
              trackId: "track-v1",
              startTime: 0,
              trimIn: 0,
              trimOut: duration,
              sourceDuration: duration,
              label: source.name,
              kind: "video",
            },
          });
        }
      }
      if (!cancelled) setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [existing, existingBySource, folderAssets, hydrated, projectId, sourceAssetId, onProjectSaved]);

  const queueSave = useCallback(
    (projectSnapshot, name) => {
      saveChainRef.current = saveChainRef.current
        .then(async () => {
          if (creatingProjectRef.current && !localProjectId) return;
          if (!localProjectId) creatingProjectRef.current = true;
          try {
            const result = await saveProject({
              projectId: localProjectId ?? undefined,
              folderId,
              name,
              project: projectSnapshot,
              sourceAssetId,
            });
            if (result?.projectId && !localProjectId) {
              setLocalProjectId(result.projectId);
              onProjectSaved?.(result.projectId, name);
            }
            setSaveError(null);
          } catch (error) {
            setSaveError(friendlyConvexError(error, "Could not save edit."));
            onStatus?.(friendlyConvexError(error, "Could not save edit."));
          } finally {
            creatingProjectRef.current = false;
          }
        })
        .catch(() => undefined);
      return saveChainRef.current;
    },
    [folderId, localProjectId, onProjectSaved, onStatus, saveProject, sourceAssetId],
  );

  useEffect(() => {
    if (!hydrated || saveError) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void queueSave(state.project, state.project.name);
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state.project, hydrated, queueSave, saveError]);

  const mediaItems = useMemo(() => {
    return (folderAssets ?? [])
      .filter((asset) => asset.kind === "video" || asset.kind === "audio" || asset.kind === "image")
      .map((asset) => ({
        assetId: asset._id,
        name: asset.name,
        kind: asset.kind,
        url:
          asset.kind === "audio"
            ? asset.signedReadUrl ?? asset.signedEditProxyUrl
            : asset.signedEditProxyUrl ?? asset.signedReadUrl,
        proxyUrl: asset.kind === "audio" ? undefined : asset.signedEditProxyUrl,
        proxyHighUrl: asset.signedEditProxy1080Url,
        thumbnailUrl: asset.signedThumbnailUrl ?? (asset.kind === "image" ? asset.signedReadUrl : undefined),
        duration: asset.durationSeconds,
        width: asset.width,
        height: asset.height,
        frameRate: asset.frameRate,
        videoCodec: asset.videoCodec,
        videoProfile: asset.videoProfile,
        audioCodec: asset.audioCodec,
        proxyKeyframeIntervalSeconds: asset.proxyKeyframeIntervalSeconds,
        byteSize: asset.byteSize,
        proxyByteSize: asset.editProxyByteSize,
        proxyHighByteSize: asset.editProxy1080ByteSize,
        proxyStatus: asset.editProxyStatus,
      }));
  }, [folderAssets]);

  const mediaById = useMemo(() => new Map(mediaItems.map((item) => [item.assetId, item])), [mediaItems]);

  const resolveClipDuration = useCallback(
    async (assetId, mediaKind, fallbackDuration) => {
      if (mediaKind === "image") {
        return DEFAULT_IMAGE_CLIP_SEC;
      }
      const media = mediaById.get(assetId);
      const known = Number(media?.duration);
      if (Number.isFinite(known) && known > 0.1) return known;
      const fallback =
        Number(fallbackDuration) > 0.1
          ? Number(fallbackDuration)
          : defaultClipDuration(mediaKind);
      if (media?.url) {
        return probeMediaDuration(media.url, fallback);
      }
      return fallback;
    },
    [mediaById],
  );

  // When proxy/metadata fills in real duration, unlock clips still stuck on the 4s fallback.
  useEffect(() => {
    if (!hydrated) return;
    for (const clip of state.project.clips) {
      if (!clip.assetId || clip.kind === "text" || clip.kind === "image") continue;
      const media = mediaById.get(clip.assetId);
      const real = Number(media?.duration);
      if (!Number.isFinite(real) || real <= 0.1) continue;
      const source = Number(clip.sourceDuration);
      const fallback =
        clip.kind === "audio" ? DEFAULT_AUDIO_CLIP_SEC : DEFAULT_VIDEO_CLIP_SEC;
      const stuckOnFallback =
        Number.isFinite(source) &&
        Math.abs(source - fallback) < 0.05 &&
        real > source + 0.05;
      const usesFullSource =
        (clip.trimIn ?? 0) <= 0.05 &&
        Number.isFinite(source) &&
        Math.abs((clip.trimOut ?? 0) - source) < 0.05;
      if (!stuckOnFallback || !usesFullSource) continue;
      dispatch({
        type: "update_clip",
        clipId: clip.id,
        patch: { sourceDuration: real, trimOut: real },
      });
    }
  }, [hydrated, mediaById, state.project.clips]);

  const timelineDuration = Math.max(state.project.duration, projectEndTime(state.project));
  const selectedClip = state.project.clips.find((clip) => clip.id === state.ui.selectedClipId) ?? null;
  const selectedJoint = jointByKey(state.project, state.ui.selectedJointKey);
  const canExport = state.project.clips.some((clip) => clip.kind === "video" && clip.assetId);
  const inspectorOpen = inspectorPanelOpen({
    editorMode: state.ui.editorMode,
    clip: selectedClip,
    joint: selectedJoint,
  });

  // If the selection that a tool needs goes away, fall back to select mode.
  useEffect(() => {
    if (state.ui.editorMode === "transition" && !selectedJoint) {
      dispatch({ type: "set_editor_mode", mode: "select" });
    }
  }, [selectedJoint, state.ui.editorMode]);

  const canSplit =
    Boolean(selectedClip) &&
    selectedClip.kind !== "text" &&
    state.ui.playhead > selectedClip.startTime + 0.05 &&
    state.ui.playhead < selectedClip.startTime + clipDuration(selectedClip) - 0.05;

  const handleExport = useCallback(async () => {
    if (!canExport) {
      onStatus?.("Add a video clip before exporting.");
      return;
    }
    setExporting(true);
    onStatus?.("Rendering your video…");
    try {
      await queueSave(state.project, state.project.name);
      let pid = localProjectId;
      if (!pid) {
        const saved = await saveProject({
          folderId,
          name: state.project.name,
          project: state.project,
          sourceAssetId,
        });
        pid = saved.projectId;
        setLocalProjectId(pid);
        onProjectSaved?.(pid, state.project.name);
      }
      const result = await exportProject({
        projectId: pid,
        folderId,
        name: state.project.name,
        project: state.project,
      });
      onStatus?.("Export ready.");
      if (result?.assetId) onOpenAsset?.(result.assetId);
    } catch (error) {
      onStatus?.(friendlyConvexError(error, "Export failed."));
    } finally {
      setExporting(false);
    }
  }, [
    canExport,
    exportProject,
    folderId,
    localProjectId,
    onOpenAsset,
    onProjectSaved,
    onStatus,
    queueSave,
    saveProject,
    sourceAssetId,
    state.project,
  ]);

  useEditorHotkeys({
    onPlayToggle: () => dispatch({ type: "set_playing", playing: !state.ui.playing }),
    onUndo: () => dispatch({ type: "undo" }),
    onRedo: () => dispatch({ type: "redo" }),
    onDelete: () => dispatch({ type: "delete_selected" }),
    onSplit: () => dispatch({ type: "split_at_playhead" }),
    onDuplicate: () => dispatch({ type: "duplicate_selected" }),
    onNudgePlayhead: (delta) =>
      dispatch({
        type: "set_playhead",
        time: Math.max(0, Math.min(timelineDuration, state.ui.playhead + delta)),
      }),
    onZoom: (delta) =>
      dispatch({
        type: "set_zoom",
        pixelsPerSecond: Math.max(MIN_PPS, Math.min(MAX_PPS, state.ui.pixelsPerSecond + delta)),
      }),
    onDeselect: () => {
      dispatch({ type: "select_clip", clipId: null });
      dispatch({ type: "select_joint", jointKey: null });
    },
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    canSplit,
    hasSelection: Boolean(state.ui.selectedClipId || state.ui.selectedJointKey),
  });

  if (!hydrated) {
    return (
      <div className="studio-editor h-full grid place-items-center text-sm text-[var(--mos-muted)]">
        Loading editor…
      </div>
    );
  }

  if (saveError && projectId && existing === null) {
    return (
      <div className="studio-editor h-full grid place-items-center p-6 text-sm text-[var(--mos-muted)]">
        {saveError}
      </div>
    );
  }

  return (
    <div className="studio-editor h-full">
      <div className="studio-editor-shell">
        <div className="studio-editor-workspace min-h-0 min-w-0 flex-1">
          <PanelGroup
            direction="vertical"
            autoSaveId="studio-video-editor-v"
            className="studio-editor-panels min-h-0 h-full"
          >
            <Panel defaultSize={48} minSize={28} className="min-h-0 min-w-0">
              <EditorPreview
                project={state.project}
                playhead={state.ui.playhead}
                playing={state.ui.playing}
                mediaById={mediaById}
                selectedClipId={state.ui.selectedClipId}
                onPlayheadChange={(time) => dispatch({ type: "set_playhead", time })}
                onPlayingChange={(playing) => dispatch({ type: "set_playing", playing })}
                onSelectClip={(clipId) => dispatch({ type: "select_clip", clipId })}
                onUpdateClip={(clipId, patch) =>
                  dispatch({ type: "update_clip", clipId, patch })
                }
              />
            </Panel>
            <PanelResizeHandle className="studio-editor-resize studio-editor-resize-y" />
            <Panel defaultSize={52} minSize={30} className="min-h-0 min-w-0">
              <div className="studio-editor-timeline-panel">
                <EditorTransportBar
                  playing={state.ui.playing}
                  playhead={state.ui.playhead}
                  duration={timelineDuration}
                  canUndo={state.past.length > 0}
                  canRedo={state.future.length > 0}
                  canSplit={canSplit}
                  hasSelection={Boolean(state.ui.selectedClipId || state.ui.selectedJointKey)}
                  pixelsPerSecond={state.ui.pixelsPerSecond}
                  onPlayingChange={(playing) => dispatch({ type: "set_playing", playing })}
                  onUndo={() => dispatch({ type: "undo" })}
                  onRedo={() => dispatch({ type: "redo" })}
                  onSplit={() => dispatch({ type: "split_at_playhead" })}
                  onDelete={() => dispatch({ type: "delete_selected" })}
                  onZoom={(pixelsPerSecond) => dispatch({ type: "set_zoom", pixelsPerSecond })}
                />
                <EditorTimeline
                  project={state.project}
                  playhead={state.ui.playhead}
                  pixelsPerSecond={state.ui.pixelsPerSecond}
                  selectedClipId={state.ui.selectedClipId}
                  selectedJointKey={state.ui.selectedJointKey}
                  editorMode={state.ui.editorMode}
                  mediaById={mediaById}
                  onSelectClip={(clipId) => dispatch({ type: "select_clip", clipId })}
                  onSelectJoint={(jointKey) => dispatch({ type: "select_joint", jointKey })}
                  onSetPlayhead={(time) => {
                    if (state.ui.playing) dispatch({ type: "set_playing", playing: false });
                    dispatch({ type: "set_playhead", time });
                  }}
                  onZoom={(pixelsPerSecond) => dispatch({ type: "set_zoom", pixelsPerSecond })}
                  onAddClip={(clip) => {
                    void (async () => {
                      const mediaKind =
                        clip.kind === "audio"
                          ? "audio"
                          : clip.kind === "image"
                            ? "image"
                            : "video";
                      const duration = await resolveClipDuration(
                        clip.assetId,
                        mediaKind,
                        clip.sourceDuration ?? clip.trimOut,
                      );
                      dispatch({
                        type: "add_clip",
                        clip: {
                          ...clip,
                          trimIn: 0,
                          trimOut: duration,
                          sourceDuration: duration,
                        },
                      });
                    })();
                  }}
                  onMoveClip={(clipId, startTime, trackId, live) =>
                    dispatch({ type: "move_clip", clipId, startTime, trackId, live })
                  }
                  onTrimClip={(clipId, trimIn, trimOut, startTime, live) =>
                    dispatch({ type: "trim_clip", clipId, trimIn, trimOut, startTime, live })
                  }
                  onToggleTrackMute={(trackId) => dispatch({ type: "toggle_track_mute", trackId })}
                  onApplyTrackLayout={(placements) =>
                    dispatch({ type: "apply_track_layout", placements, live: false })
                  }
                  onRippleAddClip={(clip) => {
                    void (async () => {
                      const mediaKind =
                        clip.kind === "audio"
                          ? "audio"
                          : clip.kind === "image"
                            ? "image"
                            : "video";
                      const duration = await resolveClipDuration(
                        clip.assetId,
                        mediaKind,
                        clip.sourceDuration ?? clip.trimOut,
                      );
                      dispatch({
                        type: "ripple_add_clip",
                        clip: {
                          assetId: clip.assetId,
                          trackId: clip.trackId,
                          startTime: clip.startTime,
                          trimIn: 0,
                          trimOut: duration,
                          sourceDuration: duration,
                          label: clip.label,
                          kind: clip.kind,
                        },
                        centerTime: clip.centerTime,
                        insertTrackAt: clip.insertTrackAt,
                      });
                    })();
                  }}
                  onMoveToTrack={(payload) =>
                    dispatch({
                      type: "move_clip_to_track",
                      clipId: payload.clipId,
                      startTime: payload.startTime,
                      trackId: payload.trackId,
                      insertTrackAt: payload.insertTrackAt,
                      ripplePlacements: payload.ripplePlacements,
                    })
                  }
                  onSetJointTransition={(jointKey, transition, live) =>
                    dispatch({ type: "set_joint_transition", jointKey, transition, live })
                  }
                />
              </div>
            </Panel>
          </PanelGroup>
        </div>

        {/* Inspector panel, then icon rail to its right. */}
        <div className="studio-editor-side">
          <aside
            className={`studio-editor-inspector-dock${inspectorOpen ? "" : " is-collapsed"}`}
            aria-hidden={!inspectorOpen}
          >
            {inspectorOpen ? (
              <EditorInspector
                editorMode={state.ui.editorMode}
                clip={selectedClip}
                media={
                  selectedClip?.assetId
                    ? mediaById.get(selectedClip.assetId) ?? null
                    : null
                }
                jointKey={selectedJoint?.key ?? null}
                project={state.project}
                playhead={state.ui.playhead}
                onUpdateClip={(clipId, patch) => dispatch({ type: "update_clip", clipId, patch })}
                onUpdateProject={(patch) => dispatch({ type: "update_project", patch })}
                onSetJointTransition={(jointKey, transition) =>
                  dispatch({ type: "set_joint_transition", jointKey, transition })
                }
                onAddTextClip={() => {
                  dispatch({ type: "set_editor_mode", mode: "text" });
                  dispatch({ type: "add_text_clip" });
                }}
              />
            ) : null}
          </aside>
          <EditorModeRail
            editorMode={state.ui.editorMode}
            onModeChange={(mode) => dispatch({ type: "set_editor_mode", mode })}
            exporting={exporting}
            canExport={canExport}
            onExport={() => void handleExport()}
            joint={selectedJoint}
          />
        </div>
      </div>
    </div>
  );
}
