// @ts-nocheck
"use client";

import { useEffect, useRef } from "react";
import { clipOpacityAtLocalTime, textAnimationStyle } from "./editorEffects";
import { clipAtPlayhead, clipDuration, projectEndTime } from "./editorState";

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
  const rafRef = useRef(null);
  const playheadRef = useRef(playhead);
  const playingRef = useRef(playing);
  const lastVideoKeyRef = useRef(null);
  const lastAudioKeyRef = useRef(null);

  const videoTrack = project.tracks.find((track) => track.kind === "video");
  const audioTrack = project.tracks.find((track) => track.kind === "audio");
  const textTrack = project.tracks.find((track) => track.kind === "text");
  const videoClip = videoTrack ? clipAtPlayhead(project, videoTrack.id, playhead) : null;
  const audioClip = audioTrack ? clipAtPlayhead(project, audioTrack.id, playhead) : null;
  const textClips =
    textTrack?.id
      ? project.clips.filter((clip) => {
          if (clip.trackId !== textTrack.id) return false;
          const end = clip.startTime + clipDuration(clip);
          return playhead >= clip.startTime && playhead < end;
        })
      : [];
  const videoMedia = videoClip ? mediaById.get(videoClip.assetId) : null;
  const audioMedia = audioClip ? mediaById.get(audioClip.assetId) : null;
  const videoUrl = videoMedia?.url;
  const audioUrl = audioMedia?.url;
  const videoIsImage = videoMedia?.kind === "image";
  const audioMuted = Boolean(audioTrack?.muted);

  const videoOpacity = videoClip
    ? clipOpacityAtLocalTime(
        videoClip.effects,
        clipDuration(videoClip),
        playhead - videoClip.startTime,
      )
    : 1;

  playheadRef.current = playhead;
  playingRef.current = playing;
  const projectRef = useRef(project);
  projectRef.current = project;

  useEffect(() => {
    if (!playing) return;

    let lastFrame = performance.now();
    const tick = (now) => {
      if (!playingRef.current) return;

      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      const end = projectEndTime(projectRef.current);
      const next = playheadRef.current + dt;

      if (next >= end) {
        onPlayheadChange(end);
        onPlayingChange(false);
        return;
      }

      onPlayheadChange(next);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, onPlayheadChange, onPlayingChange]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoClip || !videoUrl || videoIsImage) return;

    const local = playhead - videoClip.startTime + videoClip.trimIn;
    const key = `${videoClip.assetId}:${videoClip.id}`;
    if (lastVideoKeyRef.current !== key) {
      if (video.src !== videoUrl) video.src = videoUrl;
      lastVideoKeyRef.current = key;
    }

    const target = Math.max(videoClip.trimIn, Math.min(local, videoClip.trimOut - 0.02));
    if (Math.abs(video.currentTime - target) > 0.2) {
      video.currentTime = target;
    }

    if (playing) void video.play().catch(() => {});
    else video.pause();
  }, [playhead, videoClip?.id, videoClip?.assetId, videoClip?.startTime, videoClip?.trimIn, videoClip?.trimOut, videoUrl, videoIsImage, playing]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioClip || !audioUrl) return;

    const local = playhead - audioClip.startTime + audioClip.trimIn;
    const key = `${audioClip.assetId}:${audioClip.id}`;
    if (lastAudioKeyRef.current !== key) {
      if (audio.src !== audioUrl) audio.src = audioUrl;
      lastAudioKeyRef.current = key;
    }

    audio.muted = audioMuted;
    const volume = audioClip.effects?.volume ?? 1;
    audio.volume = Math.max(0, Math.min(1, volume));
    const target = Math.max(audioClip.trimIn, Math.min(local, audioClip.trimOut - 0.02));
    if (Math.abs(audio.currentTime - target) > 0.2) {
      audio.currentTime = target;
    }

    if (playing && !audioMuted) void audio.play().catch(() => {});
    else audio.pause();
  }, [playhead, audioClip?.id, audioClip?.assetId, audioClip?.startTime, audioClip?.trimIn, audioClip?.trimOut, audioUrl, audioMuted, playing, audioClip?.effects?.volume]);

  return (
    <div className="studio-editor-preview">
      <div className="studio-editor-preview-stage">
        {videoUrl ? (
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
              preload="auto"
              style={{ opacity: videoOpacity }}
              onClick={() => onPlayingChange(!playing)}
            />
          )
        ) : (
          <div className="studio-editor-preview-empty">
            <p>Drag clips from the file manager onto the timeline</p>
          </div>
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
          return (
            <div
              key={clip.id}
              className={`studio-editor-text-overlay is-align-${clip.text?.align ?? "center"}`}
              style={{
                opacity: anim.opacity,
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
      {audioUrl ? <audio ref={audioRef} preload="auto" className="sr-only" /> : null}
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
