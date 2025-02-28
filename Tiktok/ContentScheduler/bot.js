const path = require('path');
const { chromium } = require('playwright');
const os = require('os');

/**
 * Returns the Chrome user profile directory dynamically.
 * @param {string} profileName - The name of the Chrome profile.
 * @returns {string} The full path to the Chrome profile.
 */
function getChromeProfilePath(profileName) {
    const userDataDir = process.platform === 'win32'
        ? path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data')
        : process.platform === 'darwin'
            ? path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome')
            : path.join(os.homedir(), '.config', 'google-chrome');
    
    return userDataDir;
}

/**
 * Returns the Chrome executable path based on the operating system.
 * @returns {string} The path to Chrome executable
 */
function getChromeExecutablePath() {
    switch (process.platform) {
        case 'win32':
            // Windows: Check both Program Files paths
            const programFiles = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
            const programFilesX86 = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
            if (require('fs').existsSync(programFiles)) return programFiles;
            if (require('fs').existsSync(programFilesX86)) return programFilesX86;
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

    let context, page, lastScheduledTime;

    const launchBrowser = async () => {
        try {
            if (context) {
                console.log("Closing existing context...");
                await context.close();
            }

            const userDataDir = getChromeProfilePath(browser_profile_name);
            const executablePath = getChromeExecutablePath();
            console.log(`Using Chrome executable at: ${executablePath}`);
            console.log("Launching new browser context...");
            
            context = await chromium.launchPersistentContext(userDataDir, {
                headless: false,
                channel: 'chrome',
                executablePath,  // Dynamic executable path
                args: [
                    `--profile-directory=${browser_profile_name}`,
                    '--disable-blink-features=AutomationControlled',
                    '--start-maximized'
                ]
            });

            page = await context.newPage();
            console.log("Browser launched successfully!");
            console.log("Navigating to TikTok...");
            await page.goto('https://www.tiktok.com/tiktokstudio/upload?from=webapp');
            await page.waitForTimeout(6000);

            try {
                // First check if login modal appears automatically
                console.log("Checking login status...");
                const loginModalVisible = await page.waitForSelector('#loginContainer', {
                    timeout: 10000,
                    state: 'visible'
                }).then(() => true).catch(() => false);

                if (loginModalVisible) {
                    console.log("Login modal detected, need to login first...");
                    console.log("Looking for 'Use phone / email / username' option...");
                    const phoneEmailButton = await page.waitForSelector('div:text("Use phone / email / username")', {
                        timeout: 10000
                    });
                    
                    if (!phoneEmailButton) {
                        throw new Error("Could not find 'Use phone / email / username' option");
                    }
                    await phoneEmailButton.click();
                    await randomDelay(2000, 3200);

                    console.log("Looking for email login option...");
                    await page.waitForSelector('a[href="/login/phone-or-email/email"]', { timeout: 10000 });
                    await page.click('a[href="/login/phone-or-email/email"]');
                    await randomDelay(2000, 3200);

                    console.log("Looking for username/email field...");
                    await page.waitForSelector('input[name="username"]', { timeout: 10000 });
                    await page.type('input[name="username"]', credentials.username, { delay: 150 });
                    console.log("Username/email entered successfully");
                    await randomDelay(2000, 3000);

                    console.log("Looking for password field...");
                    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
                    await page.type('input[type="password"]', credentials.password, { delay: 150 });
                    console.log("Password entered successfully");
                    await randomDelay(2000, 3000);

                    console.log("Clicking login button...");
                    await page.waitForSelector('button[data-e2e="login-button"]', { timeout: 10000 });
                    await page.click('button[data-e2e="login-button"]');
                    console.log("Login attempt completed");
                    await randomDelay(5000, 7000);

                    // Verify login was successful by checking for upload button or other authenticated elements
                    const isLoggedIn = await page.waitForSelector('div[data-e2e="upload-icon"]', {
                        timeout: 10000
                    }).then(() => true).catch(() => false);

                    if (!isLoggedIn) {
                        throw new Error("Login seems to have failed - couldn't find upload button");
                    }
                    
                    console.log("Successfully logged in!");
                } else {
                    console.log("No login modal detected - we are already logged in!");
                    console.log("Navigating to TikTok Studio upload page...");
                    
                    // Navigate to the upload studio page
                    await page.goto('https://www.tiktok.com/tiktokstudio/upload?from=webapp');
                    await randomDelay(5000, 7000);

                    // Verify we're on the upload page
                    const uploadContainer = await page.waitForSelector('[data-e2e="select_video_container"]', {
                        timeout: 10000,
                        state: 'visible'
                    });

                    if (!uploadContainer) {
                        throw new Error("Could not access upload page - please check login status");
                    }

                    console.log("Successfully accessed TikTok Studio upload page!");
                }

            } catch (error) {
                console.error("Error during process:", error);
                if (page) {
                    console.log("error came in tiktok");
                }
                throw error;
            }

        } catch (error) {
            console.error("Error launching browser:", error);
            if (context) await context.close();
            throw error;
        }

        return { page, context };
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
            console.log("Waiting 10 seconds before next post...");
            await new Promise(res => setTimeout(res, 10000));
            console.log("Reloading page for the next post...");
            await page.reload();
            await page.waitForLoadState('networkidle');

            console.log("Page fully reloaded. Proceeding with next post...");
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
    
    // Handle video upload
    if (filePath && filePath.trim()) {
        console.log("Preparing to upload video...");
        const absoluteVideoPath = path.resolve(filePath);

        try {
            // Find the hidden file input and set its file directly
            const fileInput = await page.$('input[type="file"][accept="video/*"]');
            if (!fileInput) {
                throw new Error("Could not find file input element");
            }

            // Set the file directly without waiting for visibility
            await fileInput.setInputFiles(absoluteVideoPath);
            console.log("Video upload initiated");
            
            // Wait for upload completion by checking for success status
            console.log("Waiting for upload to complete...");
            
            // Double check that the success message contains "Uploaded"
            const uploadSuccess = await page.waitForSelector('.info-status.success:has-text("Uploaded")');

            if (!uploadSuccess) {
                throw new Error("Upload completion status not confirmed");
            }

            console.log("Video upload confirmed successful");
            await randomDelay(2000, 3000);

        } catch (error) {
            console.error("Error during video upload:", error);
            throw error;
        }
    }

    // Handle caption input
    if (caption && caption.trim()) {
        console.log("Looking for caption input field...");
        
        // Wait for and click the "video" text span
        await page.$('span[data-text="true"]', { timeout: 10000 });
        await page.click('span[data-text="true"]');
        await randomDelay(1000, 2000);

        // Clear existing text using keyboard shortcuts
        // Use Command/Control + A to select all text
        await page.keyboard.down(process.platform === 'darwin' ? 'Meta' : 'Control');
        await page.keyboard.press('a');
        await page.keyboard.up(process.platform === 'darwin' ? 'Meta' : 'Control');
        await page.keyboard.press('Backspace');
        await randomDelay(1000, 2000);

        // Now type the caption
        console.log("Entering caption...");
        await page.keyboard.type(caption, { delay: 100 });
        console.log("Caption entered successfully");
        await randomDelay(2000, 3000);
    }

    // Post the video
    console.log("Looking for post button...");
    await randomDelay(5000, 7000);

    await page.click('button[role="button"]:has-text("Post")');

    // '[data-e2e="post_video_button"]',
    // 'button[role="button"]:has-text("Post")',
    // 'button:has-text("Post")',
    // '.Button__root:has-text("Post")'


    console.log("Video posted successfully!");
    await randomDelay(5000, 7000); // Wait for post to complete
}

runBot().catch(err => {
    console.error("Error running TikTok bot:", err);
});
