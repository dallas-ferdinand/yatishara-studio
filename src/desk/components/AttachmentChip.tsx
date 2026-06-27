// @ts-nocheck
"use client";

import { Icon } from "./Icons";
import {
  attachmentIconName,
  attachmentLabel,
  attachmentThumbUrl,
  attachmentIsImage,
  attachmentIsVideo,
} from "@/desk/lib/attachment-model.js";
import { mentionDisplayLabel } from "@/desk/lib/composer-mentions";

export function InlineImageCircle({
  attachment,
  workspaceId = "mercuryos",
  onOpen,
  size = 28,
}) {
  const label = attachmentLabel(attachment);
  const thumbUrl = attachmentThumbUrl(attachment, workspaceId);

  return (
    <button
      type="button"
      className="msg-inline-image"
      style={{ width: size, height: size }}
      title={label}
      aria-label={`Open ${label}`}
      onClick={() => onOpen?.(attachment)}
    >
      {thumbUrl ? (
        <img className="msg-inline-image-img" src={thumbUrl} alt="" loading="lazy" />
      ) : (
        <span className="msg-inline-image-fallback">
          <Icon name="image" size={14} />
        </span>
      )}
    </button>
  );
}

export function InlineUserAttachment({
  attachment,
  workspaceId = "mercuryos",
  onOpen,
}) {
  if (attachmentIsImage(attachment)) {
    return (
      <InlineImageCircle
        attachment={attachment}
        workspaceId={workspaceId}
        onOpen={onOpen}
        size={20}
      />
    );
  }
  const isContext = attachment.kind === "context";
  return (
    <button
      type="button"
      className={`msg-inline-mention msg-inline-mention--with-icon${isContext ? " msg-inline-mention--context" : ""}`}
      title={
        isContext
          ? "View pasted context"
          : (attachment.path ?? attachment.filename ?? "Attachment")
      }
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.(attachment);
      }}
    >
      <Icon name={attachmentIconName(attachment)} size={11} className="msg-inline-mention-icon" />
      <span className="msg-inline-mention-label">{mentionDisplayLabel(attachment)}</span>
    </button>
  );
}

export function AttachmentChip({
  attachment,
  workspaceId = "mercuryos",
  onOpen,
  onRemove,
  uploading = false,
  error = false,
  progress = 0,
  variant = "tile",
}) {
  const label = attachmentLabel(attachment);
  const thumbUrl = attachmentThumbUrl(attachment, workspaceId);
  const isVideo = attachmentIsVideo(attachment);
  const showSquare = Boolean(thumbUrl) || attachment.kind === "image";
  const showVideo = isVideo && Boolean(thumbUrl);
  const icon = attachmentIconName(attachment);

  return (
    <span
      className={`cursor-attach-tile${showVideo ? " is-video" : showSquare ? " is-square" : " is-tag"}${uploading ? " is-uploading" : ""}${error ? " is-error" : ""}`}
      data-attach-kind={attachment.kind ?? "file"}
    >
      <button
        type="button"
        className="cursor-attach-tile-open"
        title={label}
        aria-label={`Open ${label}`}
        onClick={() => onOpen?.(attachment)}
      >
        {showSquare ? (
          thumbUrl ? (
            <img className="cursor-attach-tile-img" src={thumbUrl} alt="" loading="lazy" />
          ) : (
            <span className="cursor-attach-tile-fallback">
              <Icon name="image" size={16} />
            </span>
          )
        ) : (
          <>
            <span className="cursor-attach-tile-icon">
              <Icon name={icon} size={13} />
            </span>
            <span className="cursor-attach-tile-label">{label}</span>
          </>
        )}
      </button>
      {uploading ? (
        <span className="cursor-attach-tile-progress" aria-hidden="true">
          <span style={{ width: `${progress ?? 0}%` }} />
        </span>
      ) : null}
      {onRemove && !uploading ? (
        <button
          type="button"
          className="cursor-attach-tile-remove"
          aria-label="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(attachment);
          }}
        >
          <Icon name="x" size={11} />
        </button>
      ) : null}
    </span>
  );
}

export function AttachmentChipRow({ items, workspaceId, onOpen, onRemove, getUploadState }) {
  if (!items?.length) return null;
  return (
    <div className="cursor-attach-tiles">
      {items.map((a) => {
        const upload = getUploadState?.(a) ?? {};
        return (
          <AttachmentChip
            key={a.id ?? `${a.kind}-${a.label}-${a.path}`}
            attachment={a}
            workspaceId={workspaceId}
            onOpen={onOpen}
            onRemove={onRemove}
            uploading={upload.uploading}
            error={upload.error}
            progress={upload.progress}
          />
        );
      })}
    </div>
  );
}
