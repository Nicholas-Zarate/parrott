/**
 * Scheduler: runs periodic agent jobs using node-cron.
 * Call startScheduler() once (e.g. from discord-voting-bot.js on 'ready').
 */

const cron = require('node-cron');
const { generateAndSaveAnnouncement } = require('./announcement-job');

const LOG = '[Scheduler]';
const DEFAULT_CRON = process.env.ANNOUNCEMENT_CRON || '0 */6 * * *';
const RUN_ON_START = process.env.ANNOUNCEMENT_RUN_ON_START === '1';

let _started = false;

/**
 * Start all scheduled jobs.
 * Safe to call more than once (only starts once).
 */
function startScheduler() {
    if (_started) return;
    _started = true;

    const cronExpr = DEFAULT_CRON;

    if (!cron.validate(cronExpr)) {
        console.error(`${LOG} Invalid cron expression: "${cronExpr}". Announcements disabled.`);
        return;
    }

    console.log(`${LOG} Announcement job scheduled: "${cronExpr}"`);

    cron.schedule(cronExpr, async () => {
        console.log(`${LOG} Running announcement job...`);
        try {
            const result = await generateAndSaveAnnouncement();
            if (result.ok) {
                console.log(`${LOG} Announcement job completed.`);
            } else {
                console.error(`${LOG} Announcement job failed:`, result.error);
            }
        } catch (err) {
            console.error(`${LOG} Announcement job threw:`, err.message || err);
        }
    });

    if (RUN_ON_START) {
        console.log(`${LOG} ANNOUNCEMENT_RUN_ON_START=1 — running immediately.`);
        generateAndSaveAnnouncement().catch((err) => {
            console.error(`${LOG} Immediate run failed:`, err.message || err);
        });
    }
}

module.exports = { startScheduler };
