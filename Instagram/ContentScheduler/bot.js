const path = require('path');
const { chromium } = require('playwright');
const os = require('os');
const fs = require('fs');

/**
 * Returns the Chrome user profile base directory.
 * Note: Do NOT append the profile name here.
 * The profile (for example: "Profile 17") will be selected via the launch args.
 */
function getChromeProfilePath() {
    // Return only the base directory
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

function randomDelay(min = 3000, max = 8000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Contains the full UI flow to upload an image and share it as a post.
 * This function uses an already launched page (already logged-in, etc).
 *
 * @param {import('playwright').Page} page - The Playwright page instance.
 * @param {Object} post - Post details containing filePath and caption.
 */
async function uploadAndSharePost(page, post) {
    const { filePath, caption } = post;
    
    console.log("Initiating new post...");
    await page.click('span:has-text("Create")');
    await randomDelay(3000, 6000);

    try {
        await Promise.race([
            page.click('span:has-text("Post"):visible'),
            page.click('a[role="link"]:has-text("Post")'),
            page.click('svg[aria-label="Post"]'),
            page.click('div[role="dialog"] span:has-text("Post")'),
            page.click('button:has-text("Select from computer")')
        ]);
        console.log("Clicked on Post option or Select from computer button");
        await randomDelay(3000, 6000);
    } catch (error) {
        console.log("Error clicking Post option or Select from computer:", error);
        try {
            await page.click('button:has-text("Select from computer")');
            console.log("Clicked 'Select from computer' as a fallback");
        } catch (fallbackError) {
            console.log("Fallback click also failed:", fallbackError);
            throw error;
        }
    }

    console.log("Waiting for file input...");
    await randomDelay(1000, 2000);
    await page.waitForSelector('button:has-text("Select from computer")', { 
        timeout: 60000,
        state: 'visible'
    });

    const absoluteImagePath = path.resolve(filePath);

    const fileInputElement = await page.$('input[type="file"]');
    if (fileInputElement) {
        await page.setInputFiles('input[type="file"]', absoluteImagePath);
        console.log("Uploading file using the file input element.");
    } else {
        const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            page.click('button:has-text("Select from computer")')
        ]);
        await randomDelay(3000, 5000);
        await fileChooser.setFiles(absoluteImagePath);
        console.log("Uploading file using the file chooser event.");
    }

    // Check for the OK button after uploading the video
    const okButtonSelector = 'button:has-text("OK")';
    try {
        await page.waitForSelector(okButtonSelector, { timeout: 5000 });
        await page.click(okButtonSelector);
        console.log("Clicked OK button after video upload.");
    } catch (error) {
        console.log("OK button not found, proceeding without clicking it.");
    }

    if (['.mp4', '.mov'].includes(path.extname(absoluteImagePath).toLowerCase())) {
        console.log("Detected video file, waiting extra time for processing...");
        await randomDelay(10000, 20000);
    }

    await randomDelay();

    const nextButtonSelector = 'div[role="button"]:has-text("Next")';
    for (let i = 0; i < 2; i++) {
        await page.click(nextButtonSelector);
        console.log(`Clicked "Next" button (${i + 1}/2)`);
        await randomDelay();
    }

    await page.waitForTimeout(3000);

    const captionSelector = 'div[aria-label="Write a caption..."][role="textbox"]';
    await page.click(captionSelector);
    console.log("Clicked on caption field");
    await randomDelay(2000, 3000);

    if (caption && caption.trim()) {
        await page.fill(captionSelector, caption);
        console.log("Entering caption...");
        await randomDelay(2000, 3000);
        await page.type(captionSelector, ' ', { delay: 100 });
        await randomDelay(1000, 2000);
        // Remove focus from caption input field.
        await page.evaluate(() => document.activeElement.blur());
        console.log("Caption entered successfully and input blurred.");
    } else {
        console.log("Skipping caption — none provided or empty");
    }

    await randomDelay(3000, 5000);

    console.log("Looking for share button in post modal...");

    await page.waitForSelector('div[role="dialog"]', { timeout: 45000 });

    await page.evaluate(() => {
        let postModalHeading = null;
        for (const heading of document.querySelectorAll('div[role="heading"]')) {
            if (
                heading.textContent.includes('Create new post') || 
                heading.textContent.includes('New reel')
            ) {
                postModalHeading = heading;
                break;
            }
        }
        if (!postModalHeading) {
            throw new Error('Post modal heading not found or does not match expected text');
        }
        
        const modalContainer = postModalHeading.closest('div[role="dialog"]');
        if (!modalContainer) throw new Error('Modal container not found');
        
        const buttons = Array.from(modalContainer.querySelectorAll('div[role="button"]'));
        const shareButton = buttons.find(button => button.textContent.includes('Share'));
        if (shareButton) {
            shareButton.click();
        } else {
             throw new Error('Share button not found in post modal');
        }
    });
    console.log("Clicked share button");
    await randomDelay(15000, 20000);

    console.log("Image/Video posted to Instagram successfully!");
}

/**
 * Main function to run the Instagram bot.
 *
 * It can process a single post or an array of posts. For multiple posts,
 * if the gap between scheduled post times is 5 minutes or less,
 * the bot will simply reload the Instagram DOM to post the next post.
 * For longer gaps, it will close the current browser window and launch a new one.
 */
async function runBot() {
    // Parse the bot configuration from environment variable
    const botConfig = JSON.parse(process.env.BOT_CONFIG || '{}');
    const { config, credentials, browser_profile_name } = botConfig;

    if (!credentials || !credentials.username || !credentials.password) {
        console.error("Missing Instagram credentials in configuration.");
        return;
    }

    // Normalize config to always be an array
    const posts = Array.isArray(config) ? config : [config];
    
    if (!posts[0] || !posts[0].filePath) {
        console.error("No image path provided in configuration.");
        return;
    }

    posts.sort((a, b) => new Date(a.postTime) - new Date(b.postTime));
    const chromeProfilePath = getChromeProfilePath();
    let context, page, lastScheduledTime;
    /**
     * Launches the browser with persistent context using the base directory.
     * The specific profile is selected via the launch arguments.
     */
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
            headless: true,
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
        console.log("Navigating to Instagram...");
        await page.goto('https://www.instagram.com');
        await page.waitForTimeout(10000);

        // Check if login is required by detecting the presence of a login input field.
        // Instagram presents either the first or second variant of the username field during login.
        let loginInput = await page.$('input[aria-label="Phone number, username, or email"]');
        let loginVariant = 'first';
        if (!loginInput) {
            loginInput = await page.$('input[name="email"]');
            loginVariant = 'second';
        }

        if (loginInput) {
            console.log("Login required: username field found. Attempting login.");
            try {
                if (loginVariant === 'first') {
                    console.log("Found first variant of username field. Typing username...");
                    await page.type('input[aria-label="Phone number, username, or email"]', credentials.username, { delay: 650 });
                    console.log("Username entered successfully in first variant.");
                    await randomDelay(2000, 4000);

                    console.log("Typing password...");
                    await page.type('input[aria-label="Password"]', credentials.password, { delay: 850 });
                    console.log("Password entered successfully in first variant.");
                    await randomDelay(2000, 4000);

                    await page.click('button[type="submit"]:has-text("Log in")');
                    console.log("Clicked login button in first variant");
                } else {
                    console.log("Found second variant of username field. Typing username...");
                    await page.type('input[name="email"]', credentials.username, { delay: 650 });
                    console.log("Username entered successfully in second variant.");
                    await randomDelay(2000, 4000);

                    console.log("Typing password...");
                    await page.type('input[name="pass"]', credentials.password, { delay: 850 });
                    console.log("Password entered successfully in second variant.");
                    await randomDelay(2000, 4000);

                    await page.click('div[role="button"]:has-text("Log in")');
                    console.log("Clicked login button in second variant");
                }
                console.log("Waiting 5 seconds for potential 'Save login info' popup...");
                await page.waitForTimeout(5500);

                try {
                    console.log("Checking for the 'Save login info' popup...");
                    await page.waitForSelector('div[aria-label="Save your password"] div[role="button"]:has-text("Save")', { timeout: 5000 });
                    await page.click('div[aria-label="Save your password"] div[role="button"]:has-text("Save")');
                    console.log("Clicked the 'Save' button on the login popup.");
                } catch (saveErr) {
                    console.log("'Save' button not clickable or not found; checking for 'Not now' button...");
                    try {
                        await page.waitForSelector('div[aria-label="Save your password"] div[role="button"]:has-text("Not now")', { timeout: 3000 });
                        await page.click('div[aria-label="Save your password"] div[role="button"]:has-text("Not now")');
                        console.log("Clicked the 'Not now' button on the login popup.");
                    } catch (notNowErr) {
                        console.log("No login info popup was handled. Continuing with the post flow...");
                    }
                }
            } catch (error) {
                console.log("Login attempt error:", error);
            }
        } else {
            console.log("User already logged in. Skipping login process.");
        }
    };

    for (const [idx, post] of posts.entries()) {
        const scheduledTime = new Date(post.postTime);
        if (!context || (lastScheduledTime && (scheduledTime - lastScheduledTime > 300000))) {
            if (context) console.log("Gap more than 5 minutes detected. Closing current window.");
            await launchBrowser();
        } else {
            console.log("Short gap detected. Preparing for next post.");
        }

        const delay = scheduledTime - new Date();
        if (delay > 0) {
            console.log(`Waiting ${(delay / 1000).toFixed(2)} seconds until scheduled time ${scheduledTime}`);
            await new Promise(res => setTimeout(res, delay));
        } else {
            console.log(`Scheduled time ${scheduledTime} already passed. Posting immediately.`);
        }
        
        await randomDelay(1500, 3000);
        await uploadAndSharePost(page, post);
        
        if (posts.length > 1 && idx < posts.length - 1) {
            console.log("Waiting 8 - 13 seconds before next post...");
            await randomDelay(8000, 13000);
            console.log("Reloading page for the next post...");
            await page.reload();
            await page.waitForTimeout(10000);
            console.log("Page fully reloaded. Proceeding with next post...");
        }
        lastScheduledTime = scheduledTime;
    }
    
    if (context) {
        console.log("Closing Instagram broswer...");
        await new Promise(res => setTimeout(res, 120000));
        await context.close();
    }
}

runBot().catch(err => {
    console.error("Error running Instagram bot:", err);
});
