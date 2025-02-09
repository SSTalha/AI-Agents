// MasterScript/app.js
// This master script loads the configuration file (bot.json)
// and forks the respective bot scripts based on their enabled status.
// Any extra configuration per bot is passed via the environment variable BOT_CONFIG.

const { fork } = require('child_process');
const path = require('path');
const config = require('./bot.json');

// Queue to hold bot tasks
const botQueue = [];

// Function to run bots sequentially
function runNextBot() {
    if (botQueue.length > 0) {
        const { botPath, botConfig, botName } = botQueue.shift();
        console.log(`Launching ${botName} bot from ${botPath}`);

        const child = fork(botPath, [], {
            env: {
                ...process.env,
                BOT_CONFIG: JSON.stringify(botConfig.config || {})
            }
        });

        // When the bot process exits, run the next bot in the queue
        child.on('exit', (code) => {
            console.log(`${botName} bot exited with code ${code}`);
            runNextBot();
        });
    } else {
        console.log('All bots have completed execution.');
    }
}

// Add bots to the queue based on configuration
if (config.facebook && config.facebook.ContentScheduler && config.facebook.ContentScheduler.enabled) {
    botQueue.push({
        botPath: path.join(__dirname, '../Facebook/ContentScheduler/bot.js'),
        botConfig: config.facebook.ContentScheduler,
        botName: 'Facebook ContentScheduler'
    });
}

if (config.instagram && config.instagram.ContentScheduler && config.instagram.ContentScheduler.enabled) {
    botQueue.push({
        botPath: path.join(__dirname, '../Instagram/ContentScheduler/bot.js'),
        botConfig: config.instagram.ContentScheduler,
        botName: 'Instagram ContentScheduler'
    });
}

// Start processing the queue
if (botQueue.length > 0) {
    console.log('Starting bot queue execution...');
    runNextBot();
} else {
    console.log('No bots are enabled in the configuration.');
}
