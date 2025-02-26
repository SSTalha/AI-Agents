const path = require('path');
const { chromium } = require('playwright');
const os = require('os');

/**
 * Returns the Chrome user profile directory dynamically.
 *
 * The function builds a dynamic path using the operating system's
 * default locations for Chrome's user data. You only need to set the
 * profile name (for example, "Profile 17") and the rest is handled automatically.
 *
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
    await randomDelay(3000, 5000);

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
             randomDelay(10000, 15000);
        } else {
             throw new Error('Share button not found in post modal');
        }
    });
    console.log("Clicked share button");

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
    const { config, credentials, browser_profile_name } = JSON.parse(process.env.BOT_CONFIG || '{}');
    if (!credentials || !credentials.username || !credentials.password) {
        console.error("Missing Instagram credentials in configuration.");
        return;
    }
    const chromeProfilePath = getChromeProfilePath(browser_profile_name);
    const posts = Array.isArray(config) ? config.sort((a, b) => new Date(a.postTime) - new Date(b.postTime)) : [config];
    if (!posts[0].filePath) {
        console.error("No image path provided in configuration.");
        return;
    }
    
    let context, page, lastScheduledTime;
    const launchBrowser = async () => {
        if (context) await context.close();
        context = await chromium.launchPersistentContext(chromeProfilePath, { headless: false, channel: 'chrome' });
        page = await context.newPage();
        console.log("Browser launched successfully!");
        console.log("Navigating to Instagram...");
        await page.goto('https://www.instagram.com');
        await page.waitForTimeout(5000);

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
        
        randomDelay(1500, 3000)
        await uploadAndSharePost(page, post);
        
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

runBot().catch(err => {
    console.error("Error running Instagram bot:", err);
});
