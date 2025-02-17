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
 * Main function to run the Twitter bot.
 */
async function runBot() {
    const { credentials, config, browser_profile_name } = JSON.parse(process.env.BOT_CONFIG || '{}');
    if (!credentials || !credentials.username || !credentials.password) {
        console.error("Missing Twitter credentials in configuration.");
        return;
    }
    
    // Normalize config to an array even for a single post.
    const posts = Array.isArray(config) ? config.sort((a, b) => new Date(a.postTime) - new Date(b.postTime)) : [config];
    if (!posts[0].tweetContent && !posts[0].imagePath) {
        console.error("No tweet content or image provided in configuration.");
        return;
    }
    
    const chromeProfilePath = getChromeProfilePath(browser_profile_name);
    let context, page, lastScheduledTime;

    const launchBrowser = async () => {
        if (context) await context.close();
        context = await chromium.launchPersistentContext(chromeProfilePath, { headless: false, channel: 'chrome' });
        page = await context.newPage();
        console.log("Browser launched successfully!");
        console.log("Navigating to X...");
        await page.goto('https://x.com');
        await page.waitForTimeout(3000);
        
        // Perform login flow.
        try {
            console.log("Looking for sign in button...");
            await page.waitForSelector('a[href="/login"]', { timeout: 5000 });
            await page.click('a[href="/login"]');
            await randomDelay(2500, 3500);
            
            console.log("Looking for username field...");
            await page.waitForSelector('input[autocomplete="username"][name="text"]', { timeout: 5000 });
            await page.type('input[autocomplete="username"][name="text"]', credentials.username, { delay: 650 });
            console.log("Username entered successfully");
            await randomDelay(2000, 3500);
            
            console.log("Looking for next button...");
            await page.waitForSelector('button:has-text("Next")', { timeout: 5000 });
            await page.click('button:has-text("Next")');
            await randomDelay(2000, 3000);
            
            console.log("Looking for password field...");
            await page.waitForSelector('input[autocomplete="current-password"]', { timeout: 5000 });
            await page.type('input[autocomplete="current-password"]', credentials.password, { delay: 850 });
            console.log("Password entered successfully");
            await randomDelay(2000, 3000);
            
            console.log("Looking for login button...");
            await page.waitForSelector('button[data-testid="LoginForm_Login_Button"]', { timeout: 5000 });
            await page.click('button[data-testid="LoginForm_Login_Button"]');
            console.log("Login attempt completed");
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
            console.log("Short gap detected. Preparing for next tweet.");
        }

        const delay = scheduledTime - new Date();
        if (delay > 0) {
            console.log(`Waiting ${(delay / 1000).toFixed(2)} seconds until scheduled time ${scheduledTime}`);
            await new Promise(res => setTimeout(res, delay));
        } else {
            console.log(`Scheduled time ${scheduledTime} already passed. Posting immediately.`);
        }
        
        await composeAndPostTweet(page, post);
        
        if (idx < posts.length - 1) {
            console.log("Waiting 10 seconds before next tweet...");
            await new Promise(res => setTimeout(res, 10000));
            console.log("Refreshing X for next tweet.");
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
 * Contains the full UI flow to compose and post a tweet.
 * This function uses an already launched page (already logged-in, etc).
 * @param {import('playwright').Page} page - The Playwright page instance.
 * @param {Object} post - Post details containing tweetContent and imagePath.
 */
async function composeAndPostTweet(page, post) {
    const { tweetContent, imagePath } = post;
    
    console.log("Initiating new tweet...");
    await page.click('a[href="/compose/post"][aria-label="Post"]');
    await randomDelay(3000, 5000);

    // Handle text content
    if (tweetContent && tweetContent.trim()) {
        console.log("Entering tweet content...");
        const tweetInputSelector = 'div[aria-label="Post text"][role="textbox"]';
        await page.waitForSelector(tweetInputSelector, { timeout: 5000 });
        await page.type(tweetInputSelector, tweetContent, { delay: 100 });
        console.log("Tweet content entered successfully");
        await randomDelay(2000, 3000);
    }

    // Handle image upload if provided
    if (imagePath && imagePath.trim()) {
        console.log("Preparing to upload image...");
        const absoluteImagePath = path.resolve(imagePath);
        
        // Wait for media button and click
        await page.click('button[aria-label="Add photos or video"]');
        await randomDelay(1000, 2000);
        
        // Handle file upload
        const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            page.click('input[type="file"]')
        ]);
        await fileChooser.setFiles(absoluteImagePath);
        console.log("Image uploaded successfully");
        await randomDelay(3000, 5000);
    }

    // Post the tweet
    console.log("Looking for tweet button...");
    await page.click('button[data-testid="tweetButton"]:has-text("Post")');
    console.log("Tweet posted successfully!");
    await randomDelay(3000, 5000);
}

runBot().catch(err => {
    console.error("Error running Twitter bot:", err);
});
