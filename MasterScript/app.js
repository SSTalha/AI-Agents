/**
 * MasterScript/app.js
 *
 * This is the entry point that loads the configuration (config.json) and based on which bots are enabled
 * (e.g., ContentScheduler and EngagementBot), it calls the corresponding modules with their configuration.
 */
const config = require('./config.json');
const { runContentScheduler } = require('./ContentScheduler');
const { runEngagementBot } = require('./Engagement');

(async function main() {
  const tasks = [];

  // Check if any ContentScheduler is enabled in either Facebook or Instagram
  if (
    (config.facebook?.ContentScheduler && config.facebook.ContentScheduler.enabled) ||
    (config.instagram?.ContentScheduler && config.instagram.ContentScheduler.enabled)
  ) {
    tasks.push(runContentScheduler(config));
  }

  // Check if any EngagementBot is enabled (this supports multiple platforms)
  if (
    (config.facebook?.EngagementBot && config.facebook.EngagementBot.enabled) ||
    (config.instagram?.EngagementBot && config.instagram.EngagementBot.enabled)
  ) {
    tasks.push(runEngagementBot(config));
  }

  if (tasks.length) {
    await Promise.all(tasks);
    console.log("All bot tasks executed.");
  } else {
    console.log("No bots are enabled in the configuration.");
  }
})();
