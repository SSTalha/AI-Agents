const path = require('path');
const { chromium } = require('playwright');
const os = require('os');

/**
 * Returns the Chrome user profile directory dynamically.
 * @param {string} profileName - The name of the Chrome profile.
 * @returns {string} The full path to the Chrome profile.
 */
function getChromeProfilePath(profileName) {
    const baseDir =
        process.platform === 'win32'
            ? path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data')
            : process.platform === 'darwin'
            ? path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome')
            : path.join(os.homedir(), '.config', 'google-chrome');
    return path.join(baseDir, profileName);
}

/**
 * Returns a promise that resolves after a random delay.
 * Helps simulate human-like behavior.
 */
function randomDelay(min = 3000, max = 8000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Main function to run the TikTok bot.
 */
async function runBot() {
    const { credentials, config, browser_profile_name } = JSON.parse(process.env.BOT_CONFIG || '{}');
    if (!credentials || !credentials.username || !credentials.password) {
        console.error("Missing TikTok credentials in configuration.");
        return;
    }

    // Normalize config to an array even for a single post.
    const posts = Array.isArray(config) ? config.sort((a, b) => new Date(a.postTime) - new Date(b.postTime)) : [config];
    if (!posts[0].filePath) {
        console.error("No video path provided in configuration.");
        return;
    }

    const chromeProfilePath = getChromeProfilePath(browser_profile_name);
    let context, page, lastScheduledTime;

    const launchBrowser = async () => {
        if (context) await context.close();
        context = await chromium.launchPersistentContext(chromeProfilePath, { headless: false, channel: 'chrome' });
        page = await context.newPage();
        console.log("Browser launched successfully!");
        console.log("Navigating to TikTok...");
        await page.goto('https://www.tiktok.com');
        await page.waitForTimeout(4000);

        // Perform login flow.
        try {
            console.log("Looking for login button...");
            await page.waitForSelector('button[id="header-login-button"]', { timeout: 5000 });
            await page.click('button[id="header-login-button"]');
            await randomDelay(2500, 3500);

            console.log("Looking for email/username login option...");
            await page.waitForSelector('a[href="/login/phone-or-email/email"]', { timeout: 5000 });
            await page.click('a[href="/login/phone-or-email/email"]');
            await randomDelay(2000, 3200);

            console.log("Looking for username/email field...");
            await page.waitForSelector('input[name="username"]', { timeout: 5000 });
            await page.type('input[name="username"]', credentials.username, { delay: 650 });
            console.log("Username/email entered successfully");
            await randomDelay(2000, 3000);

            console.log("Looking for password field...");
            await page.waitForSelector('input[type="password"]', { timeout: 5000 });
            await page.type('input[type="password"]', credentials.password, { delay: 850 });
            console.log("Password entered successfully");
            await randomDelay(2000, 3000);

            console.log("Clicking login button...");
            await page.waitForSelector('button[data-e2e="login-button"]', { timeout: 5000 });
            await page.click('button[data-e2e="login-button"]');
            console.log("Login attempt completed");
            await randomDelay(5000, 7000);
        } catch (error) {
            console.error("Error during login process:", error);
        }
    };

    for (const [idx, post] of posts.entries()) {
        const scheduledTime = new Date(post.postTime);

        // If there is no context or the gap from the last post is more than 5 minutes, relaunch the browser.
        if (!context || (lastScheduledTime && (scheduledTime - lastScheduledTime > 300000))) {
            if (context) console.log("Gap more than 5 minutes detected. Closing current window.");
            await launchBrowser();
        } else {
            console.log("Short gap detected. Preparing for next video.");
        }

        const delay = scheduledTime - new Date();
        if (delay > 0) {
            console.log(`Waiting ${(delay / 1000).toFixed(2)} seconds until scheduled time ${scheduledTime}`);
            await new Promise(res => setTimeout(res, delay));
        } else {
            console.log(`Scheduled time ${scheduledTime} already passed. Posting immediately.`);
        }

        await uploadAndPostVideo(page, post);

        if (idx < posts.length - 1) {
            console.log("Waiting 10 seconds before next video...");
            await new Promise(res => setTimeout(res, 10000));
            console.log("Refreshing TikTok for next video.");
            await page.reload();
            await page.waitForTimeout(3000);
        }
        lastScheduledTime = scheduledTime;
    }

    if (context) {
        console.log("Waiting 2 minutes before closing browser...");
        await new Promise(res => setTimeout(res, 120000));
        await context.close();
    }
}

/**
 * Contains the full UI flow to upload and post a video.
 * This function uses an already launched page (already logged-in, etc).
 * @param {import('playwright').Page} page - The Playwright page instance.
 * @param {Object} post - Post details containing filePath and caption.
 */
async function uploadAndPostVideo(page, post) {
    const { filePath, caption } = post;

    console.log("Initiating new video upload...");
    await page.goto('https://www.tiktok.com/upload');
    await randomDelay(3000, 5000);

    // Handle video upload
    if (filePath && filePath.trim()) {
        console.log("Preparing to upload video...");
        const absoluteVideoPath = path.resolve(filePath);

        // Wait for and click the upload button to ensure the file input is available
        await page.waitForSelector('input[type="file"]', { timeout: 5000 });
        await page.setInputFiles('input[type="file"]', absoluteVideoPath);
        console.log("Video uploaded successfully");
        await randomDelay(5000, 7000); // Wait for video to process
    }

    // Handle caption input
    if (caption && caption.trim()) {
        console.log("Entering caption...");
        await page.waitForSelector('textarea[placeholder="Describe your video"]', { timeout: 5000 });
        await page.type('textarea[placeholder="Describe your video"]', caption, { delay: 100 });
        console.log("Caption entered successfully");
        await randomDelay(2000, 3000);
    }

    // Post the video
    console.log("Looking for post button...");
    await page.waitForSelector('button[data-e2e="upload-post"]', { timeout: 5000 });
    await page.click('button[data-e2e="upload-post"]');
    console.log("Video posted successfully!");
    await randomDelay(5000, 7000); // Wait for post to complete
}

runBot().catch(err => {
    console.error("Error running TikTok bot:", err);
});
