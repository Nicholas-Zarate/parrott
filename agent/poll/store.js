const activePolls = new Map();

function getPoll(messageId) {
    return activePolls.get(messageId);
}

function setPoll(messageId, pollData) {
    activePolls.set(messageId, pollData);
}

function deletePoll(messageId) {
    activePolls.delete(messageId);
}

module.exports = { getPoll, setPoll, deletePoll };
