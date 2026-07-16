// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef } from "react";
import { clipOpacityAtLocalTime, textAnimationStyle } from "./editorEffects";
import {
  clipAtPlayhead,
  clipDuration,
  projectEndTime,
  topVideoClipAtPlayhead,
} from "./editorState";

function timelineFromMediaTime(clip, mediaTime) {
  return clip.startTime + (mediaTime - clip.trimIn);
}

function mediaTimeFromTimeline(clip, timelineTime) {
  return clip.trimIn + (timelineTime - clip.startTime);
}

function clampMediaTime(clip, mediaTime) {
  return Math.max(clip.trimIn, Math.min(mediaTime, clip.trimOut - 0.02));
}

function bindElement(el, url, clip, timelineTime) {
  if (!el || !url || !clip) return false;
  const key = `${clip.id}:${url}`;
  if (el.dataset.editorBind !== key) {
    el.src = url;
    el.dataset.editorBind = key;
  }
  const target = clampMediaTime(clip, mediaTimeFromTimeline(clip, timelineTime));
  if (Math.abs(el.currentTime - target) > 0.04) {
    try {
      el.currentTime = target;
    } catch {
      /* ignore */
    }
  }
  return true;
}

export function useEditorPlayback({
  project,
  playhead,
  playing,
  mediaById,
  onPlayheadChange,
  onPlayingChange,
  videoRef,
  audioRef,
}) {
  const projectRef = useRef(project);
  const playheadRef = useRef(playhead);
  const playingRef = useRef(playing);
  const rafRef = useRef(null);
  const boundVideoClipRef = useRef(null);
  const boundAudioClipRef = useRef(null);
  const lastPlayheadCommitRef = useRef(0);

  const clipsSig = useMemo(
    () =>
      project.clips
        .map((c) => `${c.id}:${c.startTime}:${c.trimIn}:${c.trimOut}:${c.trackId}:${c.assetId ?? ""}`)
        .join("|"),
    [project.clips],
  );

  projectRef.current = project;
  playheadRef.current = playhead;
  playingRef.current = playing;

  const commitPlayhead = (time, force = false) => {
    playheadRef.current = time;
    const now = performance.now();
    // Keep media clock at full frame rate via refs; throttle React commits to ~30 Hz.
    if (!force && now - lastPlayheadCommitRef.current < 33) return;
    lastPlayheadCommitRef.current = now;
    onPlayheadChange(time);
  };

  useEffect(() => {
    boundVideoClipRef.current = null;
    boundAudioClipRef.current = null;
    for (const el of [videoRef.current, audioRef.current]) {
      if (el) el.dataset.editorBind = "";
    }
  }, [clipsSig, videoRef, audioRef]);

  // Scrub / pause: timeline drives media
  useEffect(() => {
    if (playing) return;

    const proj = projectRef.current;
    const ph = playheadRef.current;
    const video = videoRef.current;
    const audio = audioRef.current;
    const videoClip = topVideoClipAtPlayhead(proj, ph);
    const audioTrack = proj.tracks.find((t) => t.kind === "audio");
    const audioClip = audioTrack ? clipAtPlayhead(proj, audioTrack.id, ph) : null;

    if (video && videoClip) {
      const url = mediaById.get(videoClip.assetId)?.url;
      const media = mediaById.get(videoClip.assetId);
      if (url && media?.kind !== "image") {
        bindElement(video, url, videoClip, ph);
        video.pause();
        boundVideoClipRef.current = videoClip.id;
      }
    }

    if (audio && audioClip) {
      const url = mediaById.get(audioClip.assetId)?.url;
      if (url) {
        bindElement(audio, url, audioClip, ph);
        audio.muted = Boolean(audioTrack?.muted);
        audio.volume = Math.max(0, Math.min(1, audioClip.effects?.volume ?? 1));
        audio.pause();
        boundAudioClipRef.current = audioClip.id;
      }
    }
  }, [playing, playhead, clipsSig, mediaById, videoRef, audioRef]);

  // Play: media master clock
  useEffect(() => {
    if (!playing) {
      videoRef.current?.pause();
      audioRef.current?.pause();
      return;
    }

    let lastWall = performance.now();

    const advanceGap = (dt) => {
      const proj = projectRef.current;
      const end = projectEndTime(proj);
      const next = Math.min(end, playheadRef.current + dt);
      if (next >= end - 0.01) {
        commitPlayhead(end, true);
        onPlayingChange(false);
        return;
      }
      commitPlayhead(next);
    };

    const tick = (now) => {
      if (!playingRef.current) return;

      const proj = projectRef.current;
      const ph = playheadRef.current;
      const video = videoRef.current;
      const audio = audioRef.current;
      const videoClip = topVideoClipAtPlayhead(proj, ph);
      const audioTrack = proj.tracks.find((t) => t.kind === "audio");
      const audioClip = audioTrack ? clipAtPlayhead(proj, audioTrack.id, ph) : null;

      if (videoClip) {
        const media = mediaById.get(videoClip.assetId);
        const url = media?.url;
        if (url && media?.kind !== "image") {
          if (boundVideoClipRef.current !== videoClip.id) {
            bindElement(video, url, videoClip, ph);
            boundVideoClipRef.current = videoClip.id;
          }

          if (video.paused) void video.play().catch(() => {});

          if (video.readyState >= 2) {
            const next = timelineFromMediaTime(videoClip, video.currentTime);
            const clipEnd = videoClip.startTime + clipDuration(videoClip);
            if (next >= clipEnd - 0.02) {
              const after = clipEnd + 0.001;
              if (after >= projectEndTime(proj) - 0.01) {
                commitPlayhead(projectEndTime(proj), true);
                onPlayingChange(false);
                return;
              }
              commitPlayhead(after, true);
              boundVideoClipRef.current = null;
            } else {
              commitPlayhead(next);
            }
          }
        } else {
          advanceGap(Math.min(0.05, (now - lastWall) / 1000));
        }
      } else {
        advanceGap(Math.min(0.05, (now - lastWall) / 1000));
      }

      if (audio && audioClip) {
        const url = mediaById.get(audioClip.assetId)?.url;
        if (url) {
          if (boundAudioClipRef.current !== audioClip.id) {
            bindElement(audio, url, audioClip, playheadRef.current);
            boundAudioClipRef.current = audioClip.id;
          }
          audio.muted = Boolean(audioTrack?.muted);
          audio.volume = Math.max(0, Math.min(1, audioClip.effects?.volume ?? 1));
          const target = clampMediaTime(audioClip, mediaTimeFromTimeline(audioClip, playheadRef.current));
          if (Math.abs(audio.currentTime - target) > 0.12) {
            try {
              audio.currentTime = target;
            } catch {
              /* ignore */
            }
          }
          if (!audioTrack?.muted && audio.paused) void audio.play().catch(() => {});
        }
      } else {
        audio?.pause();
      }

      lastWall = now;
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, clipsSig, mediaById, onPlayheadChange, onPlayingChange, videoRef, audioRef]);
}

export function EditorPreview({
  project,
  playhead,
  playing,
  mediaById,
  onPlayheadChange,
  onPlayingChange,
}) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  const textTracks = project.tracks.filter((track) => track.kind === "text");
  const videoClip = topVideoClipAtPlayhead(project, playhead);
  const audioTrack = project.tracks.find((track) => track.kind === "audio");
  const audioClip = audioTrack ? clipAtPlayhead(project, audioTrack.id, playhead) : null;
  const textClips = textTracks.flatMap((track) =>
    project.clips.filter((clip) => {
      if (clip.trackId !== track.id) return false;
      const end = clip.startTime + clipDuration(clip);
      return playhead >= clip.startTime && playhead < end;
    }),
  );

  const videoMedia = videoClip ? mediaById.get(videoClip.assetId) : null;
  const videoUrl = videoMedia?.url;
  const videoIsImage = videoMedia?.kind === "image";
  const hasAudio = Boolean(audioClip && mediaById.get(audioClip.assetId)?.url);

  const videoOpacity = videoClip
    ? clipOpacityAtLocalTime(
        videoClip.effects,
        clipDuration(videoClip),
        playhead - videoClip.startTime,
      )
    : 1;

  useEditorPlayback({
    project,
    playhead,
    playing,
    mediaById,
    onPlayheadChange,
    onPlayingChange,
    videoRef,
    audioRef,
  });

  return (
    <div className="studio-editor-preview">
      <div className="studio-editor-preview-stage">
        {videoClip && videoUrl ? (
          videoIsImage ? (
            <img
              className="studio-editor-preview-video"
              src={videoUrl}
              alt=""
              style={{ opacity: videoOpacity }}
              onClick={() => onPlayingChange(!playing)}
            />
          ) : (
            <video
              ref={videoRef}
              className="studio-editor-preview-video"
              playsInline
              preload="metadata"
              style={{ opacity: videoOpacity }}
              onClick={() => onPlayingChange(!playing)}
            />
          )
        ) : (
          <div className="studio-editor-preview-empty" aria-hidden="true" />
        )}
        {textClips.map((clip) => {
          const local = playhead - clip.startTime;
          const duration = clipDuration(clip);
          const anim = textAnimationStyle(
            clip.text?.animation,
            clip.text?.animationDuration ?? 0.5,
            local,
            duration,
          );
          const textOpacity = clipOpacityAtLocalTime(
            clip.effects,
            duration,
            local,
          );
          return (
            <div
              key={clip.id}
              className={`studio-editor-text-overlay is-align-${clip.text?.align ?? "center"}`}
              style={{
                opacity: anim.opacity * textOpacity,
                transform: anim.transform,
                color: clip.text?.color ?? "#fff",
                fontSize: `${clip.text?.fontSize ?? 42}px`,
              }}
            >
              {clip.text?.text}
            </div>
          );
        })}
      </div>
      {hasAudio ? <audio ref={audioRef} preload="auto" className="sr-only" /> : null}
    </div>
  );
}

export function activeClipsAtPlayhead(project, playhead, mediaById) {
  const videoTrack = project.tracks.find((track) => track.kind === "video");
  const audioTrack = project.tracks.find((track) => track.kind === "audio");
  const videoClip = videoTrack ? clipAtPlayhead(project, videoTrack.id, playhead) : null;
  const audioClip = audioTrack ? clipAtPlayhead(project, audioTrack.id, playhead) : null;
  const videoMedia = videoClip ? mediaById.get(videoClip.assetId) : null;
  return {
    videoClip,
    audioClip,
    videoUrl: videoMedia?.url,
    videoIsImage: videoMedia?.kind === "image",
    audioUrl: audioClip ? mediaById.get(audioClip.assetId)?.url : undefined,
    audioMuted: Boolean(audioTrack?.muted),
  };
}
