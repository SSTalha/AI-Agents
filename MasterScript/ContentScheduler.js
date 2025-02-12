/**
 * runContentScheduler(botConfig)
 *
 * This module creates a bot queue of ContentScheduler tasks from different platforms
 * (currently Facebook and Instagram) and processes them sequentially. It builds the queue
 * based on the configuration passed from the master config. All query selectors are left unchanged.
 */
const { fork } = require('child_process');
const path = require('path');

async function runContentScheduler(botConfig) {
  // Create a bot task if enabled in the config
  const createBotTask = (platform, schedulerType, botPath) => {
    const platformConfig = botConfig[platform];
    if (!platformConfig?.[schedulerType]?.enabled) return null;

    return {
      botPath: path.join(__dirname, botPath),
      botConfig: {
        ...platformConfig[schedulerType],
        credentials: platformConfig.credentials,
        ...(platform === 'instagram' && { browser_profile_name: platformConfig.browser_profile_name })
      },
      botName: `${platform.charAt(0).toUpperCase() + platform.slice(1)} ${schedulerType}`
    };
  };

  // Group Instagram posts if multiple posts are scheduled within a 5-minute gap.
  const groupInstagramPosts = (posts) => {
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

  const buildBotQueue = () => {
    const facebookTask = createBotTask('facebook', 'ContentScheduler', '../Facebook/ContentScheduler/bot.js');
    const instagramTasks = botConfig.instagram?.ContentScheduler?.config
      ? groupInstagramPosts(botConfig.instagram.ContentScheduler.config)
      : [];
    const botQueue = [facebookTask, ...instagramTasks].filter(Boolean);

    return botQueue.sort((a, b) => {
      const getTime = task =>
        Array.isArray(task.botConfig.config)
          ? new Date(task.botConfig.scheduledTime)
          : new Date(task.botConfig.config.postTime);
      return getTime(a) - getTime(b);
    });
  };

  // Sequentially process the bot queue
  const processQueue = async (queue) => {
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
    console.log("All scheduled ContentScheduler tasks have been processed.");
  };

  const botQueue = buildBotQueue();
  if (botQueue.length > 0) {
    console.log("Processing ContentScheduler bot queue sequentially...");
    await processQueue(botQueue).catch(err =>
      console.error("Error processing ContentScheduler bot queue:", err)
    );
  } else {
    console.log("No ContentScheduler bots are enabled in the configuration.");
  }
}

module.exports = { runContentScheduler }; 