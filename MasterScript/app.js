// MasterScript/app.js
// This master script loads the configuration file (bot.json)
// and forks the respective bot scripts based on their enabled status.
// Any extra configuration per bot is passed via the environment variable BOT_CONFIG.

const { fork } = require('child_process');
const path = require('path');
const config = require('./bot.json');

const botQueue = [];

function runNextBot() {
    if (botQueue.length > 0) {
        const { botPath, botConfig, botName } = botQueue.shift();
        console.log(`Launching ${botName} bot from ${botPath}`);

        const child = fork(botPath, [], {
            env: {
                ...process.env,
                BOT_CONFIG: JSON.stringify(botConfig)
            }
        });

        child.on('exit', (code) => {
            console.log(`${botName} bot exited with code ${code}`);
            runNextBot();
        });
    } else {
        console.log('All bots have completed execution.');
    }
}

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

if (config.instagram && config.instagram.ContentScheduler && config.instagram.ContentScheduler.enabled) {
    botQueue.push({
        botPath: path.join(__dirname, '../Instagram/ContentScheduler/bot.js'),
        botConfig: {
            ...config.instagram.ContentScheduler,
            config: config.instagram.ContentScheduler.config,
            credentials: config.instagram.credentials
        },
        botName: 'Instagram ContentScheduler'
    });
}

if (botQueue.length > 0) {
    console.log('Starting bot queue execution...');
    runNextBot();
} else {
    console.log('No bots are enabled in the configuration.');
}
