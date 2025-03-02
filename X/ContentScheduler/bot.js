const path = require('path');
const { chromium } = require('playwright');
const os = require('os');
const fs = require('fs');

/**
 * Returns the Chrome user profile base directory.
 * Note: Do NOT append the profile name here.
 * The profile (for example: "Profile 23") will be selected via the launch args.
 */
function getChromeProfilePath() {
    return process.platform === 'win32'
        ? path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data')
        : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome')
        : path.join(os.homedir(), '.config', 'google-chrome');
}

/**
 * Returns the Chrome executable path based on the operating system.
 * Incorporates logic from the Facebook bot.
 *
 * @returns {string} The path to Chrome executable.
 */
function getChromeExecutablePath() {
    switch (process.platform) {
        case 'win32':
            // Windows: Check both Program Files paths
            const programFiles = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
            const programFilesX86 = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
            if (fs.existsSync(programFiles)) return programFiles;
            if (fs.existsSync(programFilesX86)) return programFilesX86;
            break;
        case 'darwin':
            // macOS
            return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        case 'linux':
            // Linux
            return '/usr/bin/google-chrome';
        default:
            throw new Error(`Unsupported platform: ${process.platform}`);
    }
    throw new Error('Chrome executable not found');
}

/**
 * Returns a promise that resolves after a random delay.
 * Helps simulate human-like behavior.
 */
function randomDelay(min = 3000, max = 8000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    console.log(`Waiting for ${delay/1000} seconds...`);
    return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Main function to run the X (Twitter) bot.
 */
async function runBot() {
    // Parse the bot configuration from environment variable
    const botConfig = JSON.parse(process.env.BOT_CONFIG || '{}');
    const { config, credentials, browser_profile_name } = botConfig;

    if (!credentials || !credentials.username || !credentials.password) {
        console.error("Missing Twitter credentials in configuration.");
        return;
    }

    // Normalize config to always be an array
    const posts = Array.isArray(config) ? config : [config];
    
    if (!posts[0] || (!posts[0].tweetContent && !posts[0].filePath)) {
        console.error("No tweet content or image provided in configuration.");
        return;
    }

    posts.sort((a, b) => new Date(a.postTime) - new Date(b.postTime));
    
    let context, page, lastScheduledTime;
    const chromeProfilePath = getChromeProfilePath();
    
    const launchBrowser = async () => {
        if (context) await context.close();
        
        if (process.platform === 'win32') {
            try {
                await require('child_process').execSync('taskkill /F /IM chrome.exe');
                console.log("Killed existing Chrome processes");
            } catch (e) {
                console.log("No existing Chrome processes found");
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        const executablePath = getChromeExecutablePath();
        context = await chromium.launchPersistentContext(chromeProfilePath, { 
            headless: false, 
            channel: 'chrome',
            executablePath,
            args: [
                `--profile-directory=${browser_profile_name}`,
                '--disable-blink-features=AutomationControlled',
                '--start-maximized'
            ]
        });
        page = await context.newPage();
        console.log("Browser launched successfully!");
        console.log("Navigating to X...");
        await page.goto('https://x.com');
        await page.waitForTimeout(6000);
        
        // Check if we're already logged in by looking for compose button
        try {
            console.log("Checking if already logged in...");
            await page.waitForSelector('a[href="/compose/post"][aria-label="Post"]', { timeout: 5000 });
            console.log("User already logged in, proceeding to post");
            return;
        } catch (error) {
            console.log("Not logged in, proceeding with login flow");
        }
        
        // Perform login flow only if not already logged in
        try {
            console.log("Looking for sign in button...");
            await page.waitForSelector('a[href="/login"]', { timeout: 7000 });
            await page.click('a[href="/login"]');
            await randomDelay(2500, 3500);
            
            console.log("Looking for username field...");
            await page.waitForSelector('input[autocomplete="username"][name="text"]', { timeout: 6000 });
            await page.type('input[autocomplete="username"][name="text"]', credentials.username, { delay: 650 });
            console.log("Username entered successfully");
            await randomDelay(2200, 3100);
            
            console.log("Looking for next button...");
            await page.waitForSelector('button:has-text("Next")', { timeout: 5000 });
            await page.click('button:has-text("Next")');
            await randomDelay(1800, 3200);
            
            // Check if extra email verification is required (first email prompt)
            let emailVerificationRequired = false;
            try {
                console.log("Checking for email field to determine verification flow...");
                await page.waitForSelector('input[data-testid="ocfEnterTextTextInput"]', { timeout: 5000 });
                emailVerificationRequired = true;
            } catch (err) {
                emailVerificationRequired = false;
            }
            
            if (emailVerificationRequired) {
                console.log("Email field detected, entering email for verification...");
                await page.type('input[data-testid="ocfEnterTextTextInput"]', credentials.email, { delay: 650 });
                console.log("Email entered successfully");
                await randomDelay(2200, 3200);
                
                console.log("Looking for next button...");
                await page.waitForSelector('button:has-text("Next")', { timeout: 5000 });
                await page.click('button:has-text("Next")');
                await randomDelay(2500, 3300);
            }
            
            console.log("Looking for password field...");
            await page.waitForSelector('input[autocomplete="current-password"]', { timeout: 5000 });
            await page.type('input[autocomplete="current-password"]', credentials.password, { delay: 850 });
            console.log("Password entered successfully");
            await randomDelay(2000, 3000);
            
            console.log("Clicking login button...");
            await page.waitForSelector('button[data-testid="LoginForm_Login_Button"]', { timeout: 5000 });
            await page.click('button[data-testid="LoginForm_Login_Button"]');
            console.log("Login attempt completed");
            
            // Handle the case where Twitter asks for email again (final email verification step)
            try {
                console.log("Checking for final email verification prompt...");
                await page.waitForSelector('input[data-testid="ocfEnterTextTextInput"]', { timeout: 5000 });
                console.log("Final email verification prompt detected, entering email...");
                await page.type('input[data-testid="ocfEnterTextTextInput"]', credentials.email, { delay: 650 });
                console.log("Email entered successfully again");
                await randomDelay(2000, 3000);
                
                console.log("Clicking next button after entering final email...");
                await page.waitForSelector('button[data-testid="ocfEnterTextNextButton"]', { timeout: 5000 });
                await page.click('button[data-testid="ocfEnterTextNextButton"]');
                await randomDelay(2200, 3500);
            } catch (err) {
                console.log("Final email verification not required.");
            }
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
        await randomDelay(5000, 12000);
        // Attempt to close the popup if it appears
        try {
            console.log("Checking for popup close button...");
            await page.waitForSelector('button[data-testid="app-bar-close"]', { timeout: 5000 });
            console.log("Popup detected, clicking close button...");
            await page.click('button[data-testid="app-bar-close"]');
            console.log("Popup closed successfully.");
        } catch (error) {
            console.log("No popup detected, refreshing the page...");
            await page.reload();
            try {
                console.log("Waiting for page to load...");
                await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
                console.log("DOM content loaded, waiting for network to stabilize...");
                await page.waitForLoadState('networkidle', { timeout: 60000 });
            } catch (loadError) {
                console.log("Page load timed out, but continuing anyway...");
                await page.waitForTimeout(15000);
            }
        }

        if (idx < posts.length - 1) {
            console.log("Waiting 8 - 13 seconds before next tweet...");
            await randomDelay(8000, 13000);
            console.log("Refreshing X for next tweet.");
            await page.reload();
            await page.waitForTimeout(10000);
            console.log("Page fully reloaded. Proceeding with next post...");
        }
        lastScheduledTime = scheduledTime;
    }

    if (context) {
        console.log("closing browser...");
        await new Promise(res => setTimeout(res, 10000));
        await context.close();
    }
}

/**
 * Contains the full UI flow to compose and post a tweet.
 * This function uses an already launched page (already logged-in, etc).
 * @param {import('playwright').Page} page - The Playwright page instance.
 * @param {Object} post - Post details containing tweetContent and filePath.
 */
async function composeAndPostTweet(page, post) {
    const { tweetContent, filePath } = post;
    
    console.log("Initiating new tweet...");
    await randomDelay(4000, 7000);
    await page.click('a[href="/compose/post"][aria-label="Post"]');
    await randomDelay(5000, 8000);

    if (tweetContent && tweetContent.trim()) {
        console.log("Entering tweet content...");
        await page.waitForSelector('div[aria-label="Post text"][role="textbox"]', { timeout: 5000 });
        await page.type(tweetInputSelector, tweetContent, { delay: 150 });
        console.log("Tweet content entered successfully");
        await randomDelay(3000, 5000);
    }

    if (filePath && filePath.trim()) {
        console.log("Preparing to upload image...");
        const absoluteImagePath = path.resolve(filePath);
        
        await randomDelay(2000, 4000);
        await page.waitForSelector('button[aria-label="Add photos or video"]', { timeout: 10000 });
        await page.click('button[aria-label="Add photos or video"]');
        await randomDelay(3000, 5000);
        
        await page.waitForSelector('input[data-testid="fileInput"]', { timeout: 10000 });
        await page.setInputFiles('input[data-testid="fileInput"]', absoluteImagePath);
        console.log("Image uploaded successfully");
        
        await randomDelay(4000, 6000);

        if (['.mp4', '.mov'].includes(path.extname(absoluteImagePath).toLowerCase())) {
            console.log("Video detected, waiting for processing...");
            await randomDelay(10000, 20000);
        }
    }

    await randomDelay(4000, 7000);
    console.log("Looking for tweet button...");
    await page.click('button[data-testid="tweetButton"]:has-text("Post")');
    console.log("Tweet posted successfully!");
    await randomDelay(6200, 12000);
}

runBot().catch(err => {
    console.error("Error running Twitter bot:", err);
});
