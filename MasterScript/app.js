// MasterScript/app.js
// This master script loads the configuration file (bot.json)
// and pushes all enabled bot tasks (across platforms) into a queue.
// The queue is then sorted by each post's scheduled time and processed sequentially.

const { fork } = require('child_process');
const path = require('path');
const config = require('./bot.json');

const botQueue = [];

// Facebook ContentScheduler task (assumes a single facebook post)
if (config.facebook && config.facebook.ContentScheduler && config.facebook.ContentScheduler.enabled) {
    botQueue.push({
        botPath: path.join(__dirname, '../Facebook/ContentScheduler/bot.js'),
        botConfig: {
            ...config.facebook.ContentScheduler,
            credentials: config.facebook.credentials
        },
        botName: 'Facebook ContentScheduler'
    });
}

// Instagram ContentScheduler may now contain multiple posts.
if (config.instagram && config.instagram.ContentScheduler && config.instagram.ContentScheduler.enabled) {
    let instaPosts = config.instagram.ContentScheduler.config;
    if (!Array.isArray(instaPosts)) {
        // Wrap non-array into an array for consistency.
        instaPosts = [instaPosts];
    }
    instaPosts.forEach((postConfig, index) => {
        botQueue.push({
            botPath: path.join(__dirname, '../Instagram/ContentScheduler/bot.js'),
            botConfig: {
                ...config.instagram.ContentScheduler,
                // Set the config for a single post
                config: postConfig,
                credentials: config.instagram.credentials
            },
            botName: `Instagram ContentScheduler Post ${index + 1}`
        });
    });
}

// --- SORT THE QUEUE BY SCHEDULED TIME ---
// Both Facebook and Instagram configuration are assumed to contain a "postTime" property
botQueue.sort((a, b) => {
    const atime = new Date(a.botConfig.config.postTime);
    const btime = new Date(b.botConfig.config.postTime);
    return atime - btime;
});

// --- PROCESS THE QUEUE SEQUENTIALLY ---
async function processQueue(queue) {
    while (queue.length > 0) {
        const task = queue.shift();
        console.log(`Launching ${task.botName} bot from ${task.botPath}`);
        await new Promise((resolve, reject) => {
            const child = fork(task.botPath, [], {
                env: {
                    ...process.env,
                    BOT_CONFIG: JSON.stringify(task.botConfig)
                }
            });
            child.on('exit', (code) => {
                console.log(`${task.botName} bot exited with code ${code}`);
                resolve();
            });
            child.on('error', (err) => {
                reject(err);
            });
        });
    }
    console.log("All scheduled tasks have been processed.");
}

if (botQueue.length > 0) {
    console.log("Processing bot queue sequentially...");
    processQueue(botQueue).catch(err => console.error("Error processing bot queue:", err));
} else {
    console.log("No bots are enabled in the configuration.");
}
