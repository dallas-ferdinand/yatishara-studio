/**
 * @file JSDoc types for SDK-aligned MercuryOS chat model.
 * Canonical reference — see docs/chat-sdk-alignment.md
 */

/**
 * @typedef {Object} UserPrompt
 * @property {string} text
 * @property {Array<{ mimeType: string, ref: string }>} [images]
 */

/**
 * @typedef {Object} RunResultSnapshot
 * @property {"finished"|"error"|"cancelled"} status
 * @property {string|null} [text]
 * @property {number|null} [durationMs]
 * @property {string|null} [model]
 * @property {object|null} [git]
 * @property {string|null} [requestId]
 * @property {string|null} [errorMessage]
 */

/**
 * @typedef {Object} RunViewCache
 * @property {1} version
 * @property {ViewBlock[]} blocks
 * @property {string} content
 * @property {string} sig
 * @property {number} builtAt
 * @property {"sdk_messages"|"conversation_turns"|"migrated_v4"} [source]
 */

/**
 * @typedef {Object} RunRecord
 * @property {string} runId
 * @property {string|null} requestId
 * @property {string} chatId
 * @property {string|null} agentId
 * @property {import("./constants.js").RunLifecycleStatus} status
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {number|null} endedAt
 * @property {UserPrompt} userPrompt
 * @property {string} workspaceId
 * @property {string|null} workspacePath
 * @property {string|null} model
 * @property {string|null} mode
 * @property {object[]} sdkMessages
 * @property {RunResultSnapshot|null} result
 * @property {object[]|null} turns
 * @property {RunViewCache|null} viewCache
 * @property {string|null} [parentRunId]
 * @property {object|null} [continuation]
 * @property {string} [source]
 * @property {boolean} [legacy]
 * @property {string|null} [migrationNote]
 */

/**
 * @typedef {Object} ChatThread
 * @property {string} id
 * @property {string} title
 * @property {boolean} pinned
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {string|null} agentId
 * @property {string} workspaceId
 * @property {string|null} model
 * @property {string|null} mode
 * @property {string} composerDraft
 * @property {object[]} pendingAttachments
 * @property {string[]} runIds
 * @property {string|null} lastRunId
 * @property {import("./constants.js").ChatThreadStatus} status
 */

/**
 * @typedef {Object} ChatStateV5
 * @property {5} schemaVersion
 * @property {string|null} activeId
 * @property {string} deskWorkspaceId
 * @property {number} uiUpdatedAt
 * @property {string[]} openAgentTabIds
 * @property {object[]} openSubagentTabs
 * @property {string|null} activeSubagentCallId
 * @property {ChatThread[]} threads
 * @property {Record<string, RunRecord>} runs
 */

/**
 * @typedef {Object} ViewBlockText
 * @property {"text"} type
 * @property {string} content
 * @property {boolean} [sealed]
 */

/**
 * @typedef {Object} ViewBlockThinking
 * @property {"thinking"} type
 * @property {string} content
 * @property {number|null} [durationMs]
 * @property {boolean} [collapsed]
 * @property {boolean} [sealed]
 */

/**
 * @typedef {Object} ViewBlockTool
 * @property {"tool"} type
 * @property {string} callId
 * @property {string} name
 * @property {string} [detail]
 * @property {string} status
 * @property {string} [output]
 * @property {string|null} [parentCallId]
 * @property {string} [kind]
 */

/**
 * @typedef {Object} ViewBlockStatus
 * @property {"status"} type
 * @property {string} message
 */

/**
 * @typedef {Object} ViewBlockSystem
 * @property {"system"} type
 * @property {string} [model]
 * @property {string[]} [tools]
 */

/**
 * @typedef {Object} ViewBlockTask
 * @property {"task"} type
 * @property {string} [status]
 * @property {string} [text]
 * @property {string} [callId]
 */

/**
 * @typedef {Object} ViewBlockRequest
 * @property {"request"} type
 * @property {string} requestId
 * @property {string} [status]
 */

/**
 * @typedef {ViewBlockText|ViewBlockThinking|ViewBlockTool|ViewBlockStatus|ViewBlockSystem|ViewBlockTask|ViewBlockRequest} ViewBlock
 */

export {};
