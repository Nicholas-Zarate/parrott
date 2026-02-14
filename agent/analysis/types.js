/**
 * @typedef {Object} TimeRangeOptions
 * @property {number} days - Number of days to look back (1–90).
 * @property {number} [maxMessagesPerChannel=500] - Cap messages fetched per channel.
 */

/**
 * @typedef {Object} ChannelStats
 * @property {string} channelId
 * @property {string} channelName
 * @property {number} messageCount
 * @property {number} uniqueAuthors
 */

/**
 * @typedef {Object} UserMessageStats
 * @property {string} userId
 * @property {string} userTag
 * @property {number} messageCount
 * @property {number} [charCount]
 */

/**
 * @typedef {Object} UserActivityInfo
 * @property {string} name
 * @property {number} type
 * @property {string} [state]
 */

/**
 * @typedef {Object} PeakActivity
 * @property {number[]} byHour - Length 24; index = hour (0-23) UTC.
 * @property {number[]} byDay - Length 7; index 0 = Sunday, 1 = Monday, ... 6 = Saturday.
 */

/**
 * @typedef {Object} AnalysisReport
 * @property {TimeRangeOptions} timeRange
 * @property {string} guildId
 * @property {string} guildName
 * @property {number} totalMessages
 * @property {number} uniqueUsers
 * @property {number} [messagesPerDay]
 * @property {ChannelStats[]} channelStats
 * @property {UserMessageStats[]} userStats
 * @property {Object.<string, UserActivityInfo[]>} [userActivities]
 * @property {Object.<string, number>} [activityCounts]
 * @property {PeakActivity} [peakActivity]
 */

/**
 * @typedef {Object} AnalysisReportMinimal
 * @property {number} totalMessages
 * @property {number} uniqueUsers
 * @property {ChannelStats[]} topChannels
 * @property {UserMessageStats[]} topUsers
 * @property {string} [activitySummary]
 * @property {string} timeRangeSummary
 */

module.exports = {};
