const pendingActions = new Map();
const cleanupTimers = new Map();

export function saveContext(botMessageId, userId, channelId, previousInstruction) {
    if (cleanupTimers.has(botMessageId)) {
        clearTimeout(cleanupTimers.get(botMessageId));
    }

    pendingActions.set(botMessageId, {
        userId,
        channelId,
        instruction: previousInstruction,
        timestamp: Date.now()
    });

    const timer = setTimeout(() => {
        pendingActions.delete(botMessageId);
        cleanupTimers.delete(botMessageId);
    }, 60000);

    cleanupTimers.set(botMessageId, timer);
}

export function getContext(replyMessage) {
    const reference = replyMessage.reference;
    if (!reference) return null;

    const context = pendingActions.get(reference.messageId);

    if (context && context.userId === replyMessage.author.id) {
        pendingActions.delete(reference.messageId);
        if (cleanupTimers.has(reference.messageId)) {
            clearTimeout(cleanupTimers.get(reference.messageId));
            cleanupTimers.delete(reference.messageId);
        }
        return context.instruction;
    }

    return null;
}
