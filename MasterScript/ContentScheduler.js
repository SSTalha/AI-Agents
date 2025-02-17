/**
 * runContentScheduler(botConfig)
 *
 * This module creates a bot queue of ContentScheduler tasks (for different platforms)
 * and processes them so that tasks for the same platform run sequentially while different
 * platforms (using separate profiles) run concurrently.
 */
const { fork } = require('child_process');
const path = require('path');

// Helper: create task for a given platform.
const createBotTask = (platform, schedulerType, botPath, botConfig) => {
  const platformConfig = botConfig[platform];
  // Check if platform exists and ContentScheduler is enabled.
  if (!platformConfig?.ContentScheduler?.enabled) return null;

  return {
    botPath: path.join(__dirname, botPath),
    botConfig: {
      ...platformConfig[schedulerType],
      credentials: platformConfig.credentials,
      browser_profile_name: platformConfig.browser_profile_name
    },
    botName: `${platform.charAt(0).toUpperCase() + platform.slice(1)} ${schedulerType}`
  };
};

// Group Instagram posts if multiple posts are scheduled within a 5-minute gap.
const groupInstagramPosts = (posts, botConfig) => {
  const sortedPosts = (Array.isArray(posts) ? posts : [posts])
    .sort((a, b) => new Date(a.postTime) - new Date(b.postTime));

  const groupedPosts = sortedPosts.reduce((groups, post) => {
    const lastGroup = groups[groups.length - 1];
    if (!lastGroup || (new Date(post.postTime) - new Date(lastGroup[0].postTime) > 300000)) {
      groups.push([post]);
    } else {
      lastGroup.push(post);
    }
    return groups;
  }, []);

  return groupedPosts.map((group, index) => ({
    botPath: path.join(__dirname, '../Instagram/ContentScheduler/bot.js'),
    botConfig: {
      ...botConfig.instagram.ContentScheduler,
      config: group.length === 1 ? group[0] : group,
      credentials: botConfig.instagram.credentials,
      browser_profile_name: botConfig.instagram.browser_profile_name,
      scheduledTime: group[0].postTime
    },
    botName: `Instagram ContentScheduler Post ${group.length > 1 ? `Group ${index + 1}` : index + 1}`
  }));
};

// Group X posts if multiple posts are scheduled within a 5-minute gap
const groupXPosts = (posts, botConfig) => {
  const sortedPosts = (Array.isArray(posts) ? posts : [posts])
    .sort((a, b) => new Date(a.postTime) - new Date(b.postTime));

  const groupedPosts = sortedPosts.reduce((groups, post) => {
    const lastGroup = groups[groups.length - 1];
    if (!lastGroup || (new Date(post.postTime) - new Date(lastGroup[0].postTime) > 300000)) {
      groups.push([post]);
    } else {
      lastGroup.push(post);
    }
    return groups;
  }, []);

  return groupedPosts.map((group, index) => ({
    botPath: path.join(__dirname, '../X/ContentScheduler/bot.js'),
    botConfig: {
      ...botConfig.x.ContentScheduler,
      config: group.length === 1 ? group[0] : group,
      credentials: botConfig.x.credentials,
      browser_profile_name: botConfig.x.browser_profile_name,
      scheduledTime: group[0].postTime
    },
    botName: `X ContentScheduler Post ${group.length > 1 ? `Group ${index + 1}` : index + 1}`
  }));
};

const buildBotQueuesByPlatform = (botConfig) => {
  // Create individual queues for each platform.
  const facebookTask = createBotTask('facebook', 'ContentScheduler', '../Facebook/ContentScheduler/bot.js', botConfig);
  const instagramTasks = botConfig.instagram?.ContentScheduler?.enabled
    ? groupInstagramPosts(botConfig.instagram.ContentScheduler.config, botConfig)
    : [];
  const xTasks = botConfig.x?.ContentScheduler?.enabled
    ? groupXPosts(botConfig.x.ContentScheduler.config, botConfig)
    : [];

  const queues = {};
  
  if (facebookTask) {
    queues.facebook = [facebookTask];
  }
  if (instagramTasks.length > 0) {
    queues.instagram = instagramTasks;
  }
  if (xTasks.length > 0) {
    queues.x = xTasks;
  }
  return queues;
};

// Process a given queue sequentially.
const processQueueSequentially = async (queue) => {
  for (const task of queue) {
    console.log(`Launching ${task.botName} bot from ${task.botPath}`);
    await new Promise((resolve, reject) => {
      const child = fork(task.botPath, [], {
        env: { ...process.env, BOT_CONFIG: JSON.stringify(task.botConfig) }
      });
      child.on('exit', (code) => {
        console.log(`${task.botName} bot exited with code ${code}`);
        resolve();
      });
      child.on('error', reject);
    });
  }
};

async function runContentScheduler(botConfig) {
  // Build separate queues for each platform.
  const queues = buildBotQueuesByPlatform(botConfig);

  // For each platform, if there are tasks, process them sequentially.
  // Then, run these platform-specific sequential processes concurrently.
  const platformProcessors = Object.entries(queues).map(async ([platform, queue]) => {
    console.log(`Processing ${platform} ContentScheduler tasks sequentially...`);
    await processQueueSequentially(queue);
  });

  await Promise.all(platformProcessors);
  console.log("All scheduled ContentScheduler tasks have been processed.");
}

module.exports = { runContentScheduler }; 