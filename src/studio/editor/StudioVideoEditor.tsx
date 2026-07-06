// @ts-nocheck
"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { api } from "../../../convex/_generated/api";
import { EditorPreview } from "./EditorPreview";
import { EditorInspector } from "./EditorInspector";
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
import { MAX_PPS, MIN_PPS } from "./types";

export function StudioVideoEditor({
  folderId,
  projectId,
  sourceAssetId,
  sourceAssetName,
  tabKey,
  onOpenAsset,
  onStatus,
  onProjectSaved,
}) {
  const [urlExpiresUnix] = useState(() => Math.floor(Date.now() / 1000) + 60 * 60 * 12);
  const saveTimerRef = useRef(null);

  const existing = useQuery(api.videoEdits.get, projectId ? { projectId } : "skip");
  const existingBySource = useQuery(
    api.videoEdits.getBySourceAsset,
    sourceAssetId && !projectId ? { sourceAssetId } : "skip",
  );
  const folderAssets = useQuery(api.assets.listByFolder, {
    folderId,
    expiresUnix: urlExpiresUnix,
  });

  const saveProject = useMutation(api.videoEdits.save);
  const exportProject = useAction(api.videoEditActions.exportVideo);

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
  const [localProjectId, setLocalProjectId] = useState(projectId ?? null);

  useEffect(() => {
    if (hydrated) return;
    const saved = existing ?? existingBySource;
    if (projectId && existing === undefined) return;
    if (sourceAssetId && !projectId && existingBySource === undefined) return;
    if (saved?.project) {
      dispatch({ type: "replace_project", project: saved.project });
      setLocalProjectId(saved._id);
      onProjectSaved?.(saved._id, saved.name);
      setHydrated(true);
      return;
    }
    if (sourceAssetId && folderAssets === undefined) return;
    if (sourceAssetId && folderAssets?.length) {
      const source = folderAssets.find((asset) => asset._id === sourceAssetId);
      if (source) {
        dispatch({
          type: "add_clip",
          clip: {
            assetId: source._id,
            trackId: "track-v1",
            startTime: 0,
            trimIn: 0,
            trimOut: 4,
            label: source.name,
            kind: "video",
          },
        });
      }
    }
    setHydrated(true);
  }, [existing, existingBySource, folderAssets, hydrated, projectId, sourceAssetId]);

  useEffect(() => {
    if (!hydrated) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveProject({
        projectId: localProjectId ?? undefined,
        folderId,
        name: state.project.name,
        project: state.project,
        sourceAssetId,
      }).then((result) => {
        if (result?.projectId && !localProjectId) {
          setLocalProjectId(result.projectId);
          onProjectSaved?.(result.projectId, state.project.name);
        }
      });
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state.project, hydrated, localProjectId, folderId, sourceAssetId, saveProject, onProjectSaved]);

  const mediaItems = useMemo(() => {
    return (folderAssets ?? [])
      .filter((asset) => asset.kind === "video" || asset.kind === "audio" || asset.kind === "image")
      .map((asset) => ({
        assetId: asset._id,
        name: asset.name,
        kind: asset.kind,
        url: asset.signedReadUrl,
        thumbnailUrl: asset.signedThumbnailUrl ?? asset.signedReadUrl,
      }));
  }, [folderAssets]);

  const mediaById = useMemo(() => new Map(mediaItems.map((item) => [item.assetId, item])), [mediaItems]);

  const timelineDuration = Math.max(state.project.duration, projectEndTime(state.project));
  const selectedClip = state.project.clips.find((clip) => clip.id === state.ui.selectedClipId) ?? null;
  const selectedJoint = jointByKey(state.project, state.ui.selectedJointKey);

  const canSplit =
    Boolean(selectedClip) &&
    selectedClip.kind !== "text" &&
    state.ui.playhead > selectedClip.startTime + 0.05 &&
    state.ui.playhead < selectedClip.startTime + clipDuration(selectedClip) - 0.05;

  const handleExport = useCallback(async () => {
    setExporting(true);
    onStatus?.("Rendering your video…");
    try {
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
      onStatus?.(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }, [exportProject, folderId, localProjectId, onOpenAsset, onStatus, saveProject, sourceAssetId, state.project]);

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
    hasSelection: Boolean(state.ui.selectedClipId),
  });

  return (
    <div className="studio-editor h-full">
      <PanelGroup
        direction="horizontal"
        autoSaveId="studio-video-editor-h"
        className="studio-editor-panels min-h-0 min-w-0 flex-1"
      >
        <Panel defaultSize={78} minSize={50} className="min-h-0 min-w-0">
          <PanelGroup direction="vertical" autoSaveId="studio-video-editor-v" className="studio-editor-panels min-h-0 h-full">
            <Panel defaultSize={48} minSize={28} className="min-h-0 min-w-0">
              <EditorPreview
                project={state.project}
                playhead={state.ui.playhead}
                playing={state.ui.playing}
                mediaById={mediaById}
                onPlayheadChange={(time) => dispatch({ type: "set_playhead", time })}
                onPlayingChange={(playing) => dispatch({ type: "set_playing", playing })}
              />
            </Panel>
            <PanelResizeHandle className="studio-editor-resize studio-editor-resize-y" />
            <Panel defaultSize={52} minSize={30} className="min-h-0 min-w-0 flex flex-col">
              <EditorTransportBar
                playing={state.ui.playing}
                playhead={state.ui.playhead}
                duration={timelineDuration}
                canUndo={state.past.length > 0}
                canRedo={state.future.length > 0}
                canSplit={canSplit}
                hasSelection={Boolean(state.ui.selectedClipId)}
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
                onSetPlayhead={(time) => dispatch({ type: "set_playhead", time })}
                onAddClip={(clip) => dispatch({ type: "add_clip", clip })}
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
                onRippleAddClip={(clip) =>
                  dispatch({
                    type: "ripple_add_clip",
                    clip: {
                      assetId: clip.assetId,
                      trackId: clip.trackId,
                      startTime: clip.startTime,
                      trimIn: clip.trimIn,
                      trimOut: clip.trimOut,
                      sourceDuration: clip.sourceDuration,
                      label: clip.label,
                      kind: clip.kind,
                    },
                    centerTime: clip.centerTime,
                    insertTrackAt: clip.insertTrackAt,
                  })
                }
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
              />
            </Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle className="studio-editor-resize cursor-resize" />
        <Panel
          defaultSize={22}
          minSize={16}
          maxSize={36}
          collapsible
          collapsedSize={0}
          className="min-h-0 min-w-0"
        >
          <EditorInspector
            editorMode={state.ui.editorMode}
            onModeChange={(mode) => dispatch({ type: "set_editor_mode", mode })}
            exporting={exporting}
            onExport={() => void handleExport()}
            clip={selectedClip}
            jointKey={selectedJoint?.key ?? null}
            project={state.project}
            playhead={state.ui.playhead}
            onUpdateClip={(clipId, patch) => dispatch({ type: "update_clip", clipId, patch })}
            onSetJointTransition={(jointKey, transition) =>
              dispatch({ type: "set_joint_transition", jointKey, transition })
            }
            onAddTextClip={() => {
              dispatch({ type: "set_editor_mode", mode: "text" });
              dispatch({ type: "add_text_clip" });
            }}
            onAddTrackLayer={(kind) => dispatch({ type: "add_track_layer", kind })}
          />
        </Panel>
      </PanelGroup>
    </div>
  );
}
