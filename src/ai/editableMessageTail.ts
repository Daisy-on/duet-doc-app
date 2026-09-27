import type { ChatMessage } from '../store/aiWritingStore';

export function editableMessageTail(
  sessionMessages: ChatMessage[],
  userMessageId: string,
): ChatMessage[] | null {
  const targetIndex = sessionMessages.findIndex(
    (message) => message.id === userMessageId && message.role === 'user',
  );
  if (targetIndex < 0) return null;
  if (sessionMessages.slice(targetIndex + 1).some((message) => message.role === 'user')) {
    return null;
  }
  return sessionMessages.slice(targetIndex);
}

export async function persistEditedMessage(
  newMessage: ChatMessage,
  oldTail: ChatMessage[],
  actions: {
    addMessage: (message: ChatMessage) => Promise<void>;
    removeMessages: (ids: string[]) => Promise<void>;
    removeMessage: (id: string) => Promise<void>;
  },
): Promise<void> {
  await actions.addMessage(newMessage);
  try {
    await actions.removeMessages(oldTail.map((message) => message.id));
  } catch (error) {
    try {
      await actions.removeMessage(newMessage.id);
    } catch (rollbackError) {
      console.error('Failed to roll back edited message:', rollbackError);
    }
    throw error;
  }
}
