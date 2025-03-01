/**
 * runContentScheduler(botConfig)
 *
 * This module creates a bot queue of ContentScheduler tasks (for different platforms)
 * and processes them so that tasks for the same platform run sequentially while different
 * platforms (using separate profiles) run concurrently.
 */
const { fork } = require('child_process');
const path = require('path');

// Add new helper function to sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to capitalize platform names
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Build a unified task queue from all enabled platform bots
function buildUnifiedTaskQueue(botConfig) {
  const tasks = [];
  // Mapping of platform to relative bot path
  const botPaths = {
    facebook: '../Facebook/ContentScheduler/bot.js',
    instagram: '../Instagram/ContentScheduler/bot.js',
    x: '../X/ContentScheduler/bot.js',
    linkedin: '../Linkedin/ContentScheduler/bot.js',
    tiktok: '../Tiktok/ContentScheduler/bot.js'
  };

  const platforms = ['facebook', 'instagram', 'x', 'linkedin', 'tiktok'];
  platforms.forEach(platform => {
    const platformConfig = botConfig[platform];
    if (platformConfig && platformConfig.ContentScheduler && platformConfig.ContentScheduler.enabled) {
      const schedulerConfig = platformConfig.ContentScheduler;
      const posts = schedulerConfig.config;
      if (Array.isArray(posts)) {
        posts.forEach((post, index) => {
          tasks.push({
            botPath: require('path').join(__dirname, botPaths[platform]),
            botConfig: {
              ...schedulerConfig,
              config: post,
              credentials: platformConfig.credentials,
              browser_profile_name: platformConfig.browser_profile_name,
              scheduledTime: new Date(post.postTime.replace(" ", "T")).toISOString()
            },
            botName: `${capitalize(platform)} ContentScheduler Post ${index + 1}`
          });
        });
      } else if (posts) {
        tasks.push({
          botPath: require('path').join(__dirname, botPaths[platform]),
          botConfig: {
            ...schedulerConfig,
            config: posts,
            credentials: platformConfig.credentials,
            browser_profile_name: platformConfig.browser_profile_name,
            scheduledTime: new Date(posts.postTime.replace(" ", "T")).toISOString()
          },
          botName: `${capitalize(platform)} ContentScheduler Post`
        });
      }
    }
  });

  // Sort tasks by their scheduled time
  tasks.sort((a, b) => new Date(a.botConfig.scheduledTime) - new Date(b.botConfig.scheduledTime));

  // Adjust tasks that share the same scheduled time by adding 6 minute delays to later tasks
  let i = 0;
  while (i < tasks.length) {
    const baseTime = new Date(tasks[i].botConfig.scheduledTime).getTime();
    let j = i + 1;
    // Count tasks with the same original scheduled time
    while (j < tasks.length && new Date(tasks[j].botConfig.scheduledTime).getTime() === baseTime) {
      j++;
    }
    // For tasks in the group starting at index i, add incremental delay of 6 minutes for later tasks
    for (let k = i + 1; k < j; k++) {
      const originalTime = new Date(tasks[k].botConfig.scheduledTime);
      // Add 6 minutes * (order in group) to the original time
      const delayMinutes = 6 * (k - i);
      const newTime = new Date(originalTime.getTime() + delayMinutes * 60000);
      tasks[k].botConfig.scheduledTime = newTime.toISOString();
    }
    i = j;
  }

  return tasks;
}

// Process the unified task queue sequentially
async function processUnifiedQueue(tasks) {
  for (const task of tasks) {
    const scheduledTime = new Date(task.botConfig.scheduledTime);
    const now = new Date();
    const waitTime = scheduledTime - now;
    if (waitTime > 0) {
      console.log(`Waiting ${Math.round(waitTime/60000)} minutes for ${task.botName} (scheduled at ${scheduledTime.toLocaleString()})`);
      await sleep(waitTime);
    } else {
      console.log(`${task.botName} is scheduled in the past. Launching immediately.`);
    }
    console.log(`Launching ${task.botName} bot from ${task.botPath}`);
    await new Promise((resolve, reject) => {
      const child = require('child_process').fork(task.botPath, [], {
        env: { ...process.env, BOT_CONFIG: JSON.stringify(task.botConfig) }
      });
      child.on('exit', (code) => {
        console.log(`${task.botName} bot exited with code ${code}`);
        resolve();
      });
      child.on('error', reject);
    });
    // After each task, a new chrome instance is assumed to be created in the next bot run
  }
}

// Replace runContentScheduler to use the unified queue
async function runContentScheduler(botConfig) {
  const tasks = buildUnifiedTaskQueue(botConfig);
  if (tasks.length === 0) {
    console.log('No scheduled ContentScheduler tasks to process.');
    return;
  }
  console.log(`Processing ${tasks.length} ContentScheduler tasks sequentially...`);
  await processUnifiedQueue(tasks);
  console.log('All scheduled ContentScheduler tasks have been processed.');
}

module.exports = { runContentScheduler }; 