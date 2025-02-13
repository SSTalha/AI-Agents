const path = require('path');
const { chromium } = require('playwright');
const os = require('os');


/**
 * Returns the Chrome user profile directory dynamically.
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
 */
function randomDelay(min = 5000, max = 9000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Creates a Facebook post with the given content and image
 */
async function createPost(page, post) {
    const { postContent, imagePath } = post;
    console.log("Creating new post...");
    
    // Wait for and click the post creation button
    await page.waitForSelector('div[role="button"] span:has-text("What\'s on your mind")', { timeout: 60000 });
    await randomDelay();
    await page.click('div[role="button"] span:has-text("What\'s on your mind")');
    
    console.log("Waiting for post modal to load...");
    await randomDelay(5000, 10000);
    
    // Enter post content
    await page.waitForSelector('[contenteditable="true"][role="textbox"]', { timeout: 60000 });
    await randomDelay();
    
    // Type content with human-like delays
    for (const char of postContent.split('')) {
        await page.type('[contenteditable="true"][role="textbox"]', char);
        await new Promise(resolve => setTimeout(resolve, Math.random() * 300));
    }
    
    // If we have an image to upload
    if (imagePath) {
        console.log("Preparing to upload image...");
        
        // Click "Add to your post"
        await page.waitForSelector('div[aria-label="Add to your post"]');
        await randomDelay();
        // await page.click('div[aria-label="Add to your post"]');
        
        // Click Photo/video button
        await page.waitForSelector('div[aria-label="Photo/video"]');
        await randomDelay();
        await page.click('div[aria-label="Photo/video"]');
        
        // Wait for file input and upload image
        try {
            console.log("Uploading image...");
            const absoluteImagePath = path.resolve(imagePath);
            
            // Look for file input
            const fileInputElement = await page.$('input[type="file"]');
            if (fileInputElement) {
                await page.setInputFiles('input[type="file"]', absoluteImagePath);
            } else {
                // If direct file input is not found, try file chooser event
                const [fileChooser] = await Promise.all([
                    page.waitForEvent('filechooser'),
                    page.click('div[aria-label="Photo/video"]')
                ]);
                await randomDelay();
                await fileChooser.setFiles(absoluteImagePath);
            }
            
            console.log("Image uploaded successfully");
            await randomDelay(5000, 10000); // Wait for image to upload
        } catch (error) {
            console.error("Error uploading image:", error);
            throw error;
        }
    }

    await randomDelay();

    // Click post button
    await page.click('div[aria-label="Post"][role="button"]');
    console.log("Post created successfully!");
    
    // Wait for post to complete
    await randomDelay(8000, 12000);
}

/**
 * Main function to run the Facebook bot
 */
async function runBot() {
    const { config, credentials, browser_profile_name } = JSON.parse(process.env.BOT_CONFIG || '{}');
    if (!credentials || !credentials.username || !credentials.password) {
        console.error("Missing Facebook credentials in configuration.");
        return;
    }

    const chromeProfilePath = getChromeProfilePath(browser_profile_name);
    // Normalize config to array even for single posts
    const posts = Array.isArray(config) ? config : [config];
    
    if (!posts.length) {
        console.error("No posts configured.");
        return;
    }

    // Sort posts by scheduled time
    posts.sort((a, b) => new Date(a.postTime) - new Date(b.postTime));
    
    let context, page, lastScheduledTime;
    
    const launchBrowser = async () => {
        if (context) await context.close();
        context = await chromium.launchPersistentContext(chromeProfilePath, { 
            headless: false, 
            channel: 'chrome' 
        });
        page = await context.newPage();
        console.log("Browser launched successfully!");
        
        console.log("Navigating to Facebook...");
        await page.goto('https://www.facebook.com');
        await randomDelay();

        // Check if login is needed
        const isLoggedIn = await page.waitForSelector('div[role="button"] span:has-text("What\'s on your mind")', { 
            timeout: 5000 
        }).then(() => true).catch(() => false);

        if (!isLoggedIn) {
            console.log("Login required. Attempting to login...");
            await page.waitForSelector('input[data-testid="royal-email"]');
            await randomDelay();
            await page.type('input[data-testid="royal-email"]', credentials.username, { delay: 300 });
            await randomDelay();
            await page.type('input[data-testid="royal-pass"]', credentials.password, { delay: 300 });
            await randomDelay();
            await page.click('button[data-testid="royal-login-button"]');
            await page.waitForLoadState('networkidle', { timeout: 60000 });
            await page.waitForSelector('div[role="button"] span:has-text("What\'s on your mind")', { 
                timeout: 60000 
            });
        } else {
            console.log("Already logged in!");
        }
    };

    for (const [idx, post] of posts.entries()) {
        const scheduledTime = new Date(post.postTime);
        
        // If this is the first post or if more than 5 minutes have passed since last post
        if (!context || (lastScheduledTime && (scheduledTime - lastScheduledTime > 300000))) {
            if (context) {
                console.log("Gap more than 5 minutes detected. Closing current window.");
            }
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
        
        await createPost(page, post);
        
        if (idx < posts.length - 1) {
            console.log("Waiting 15 seconds before next post...");
            await new Promise(res => setTimeout(res, 15000));
            console.log("Refreshing Facebook for next post.");
            await page.reload();
            await randomDelay();
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
    console.error("Error running Facebook bot:", err);
    process.exit(1);
});
