import type { StartTurnRequest, TurnContextAttachment } from '../../shared/types.js';

const MAX_CONTEXT_ATTACHMENTS = 12;
const MAX_ATTACHMENT_CONTENT_CHARS = 24_000;

export function renderTurnText(request: StartTurnRequest): string {
  const baseText = request.agent?.name
    ? `Use the ${request.agent.name} custom agent for this task. ${request.text}`
    : request.text;
  const contextBlock = renderContextBlock(request.context);
  return contextBlock ? `${baseText}\n\n${contextBlock}` : baseText;
}

function renderContextBlock(context: TurnContextAttachment[] | undefined): string {
  const attachments = Array.isArray(context) ? context.filter(isRenderableAttachment).slice(0, MAX_CONTEXT_ATTACHMENTS) : [];
  if (attachments.length === 0) return '';

  const lines = [
    'Codex-Platform attached context:',
    'Use this context as explicit user-provided project state. If it conflicts with live files or command output, verify the live state before acting.'
  ];

  attachments.forEach((attachment, index) => {
    lines.push('');
    lines.push(`--- Context ${index + 1}: ${kindLabel(attachment.kind)} | ${attachment.title} ---`);
    if (attachment.subtitle) lines.push(`Summary: ${attachment.subtitle}`);
    if (attachment.path) lines.push(`Path: ${attachment.path}`);
    const metadata = renderMetadata(attachment.metadata);
    if (metadata) lines.push(metadata);
    if (attachment.content) {
      lines.push('Content:');
      lines.push(truncate(attachment.content, MAX_ATTACHMENT_CONTENT_CHARS));
      if (attachment.truncated || attachment.content.length > MAX_ATTACHMENT_CONTENT_CHARS) {
        lines.push('[Content truncated by Codex-Platform context limits.]');
      }
    }
    lines.push(`--- End Context ${index + 1} ---`);
  });

  return lines.join('\n');
}

function isRenderableAttachment(value: TurnContextAttachment | undefined): value is TurnContextAttachment {
  return Boolean(value?.id && value.kind && value.title);
}

function renderMetadata(metadata: TurnContextAttachment['metadata']): string {
  if (!metadata || Object.keys(metadata).length === 0) return '';
  return `Metadata: ${JSON.stringify(metadata)}`;
}

function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}\n...`;
}

function kindLabel(kind: TurnContextAttachment['kind']): string {
  switch (kind) {
    case 'gitStatus':
      return 'Git status';
    case 'gitDiff':
      return 'Git diff';
    case 'releaseEvidence':
      return 'Release evidence';
    default:
      return kind;
  }
}
