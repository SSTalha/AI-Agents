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
function randomDelay(min = 3000, max = 8000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Creates a LinkedIn post with the given content and image
 */
async function createPost(page, post) {
    const { postContent, filePath } = post;
    console.log("Creating new post...");
    
    // Wait for and click the post creation button using text content
    const startPostSelector = 'button strong:has-text("Start a post")';
    await page.waitForSelector(startPostSelector, { timeout: 60000 });
    await randomDelay();
    await page.click(startPostSelector);
    
    console.log("Waiting for post modal to load...");
    await randomDelay(3000, 5000);
    
    // Wait for the editor to be ready
    await page.waitForSelector('div[role="textbox"][contenteditable="true"]', { timeout: 60000 });
    await randomDelay();
    
    // Type content with human-like delays
    console.log("Entering post content...");
    await page.type('div[role="textbox"]', postContent, { delay: 100 });
    await randomDelay();
    
    // If we have a file to upload (image or video)
    if (filePath) {
        console.log("Preparing to upload media...");
        
        // Determine file type
        const fileExtension = path.extname(filePath).toLowerCase();
        const isVideo = ['.mp4', '.mov', '.avi', '.webm'].includes(fileExtension);
        
        // Click the appropriate media upload button
        const mediaButtonSelector = isVideo 
            ? 'button[aria-label="Add a video"]' 
            : 'button[aria-label="Add a photo"]';
        
        await page.waitForSelector(mediaButtonSelector);
        await randomDelay();
        
        const absoluteMediaPath = path.resolve(filePath);
        
        try {
            console.log(`Uploading ${isVideo ? 'video' : 'image'}...`);
            
            // Handle file chooser event before clicking the button
            const [fileChooser] = await Promise.all([
                page.waitForEvent('filechooser'),
                page.click(mediaButtonSelector)
            ]);
            
            // Set the file in the chooser
            await fileChooser.setFiles(absoluteMediaPath);
            
            console.log("Media uploaded successfully");
            
            // Extra wait time for videos
            if (isVideo) {
                await randomDelay(10000, 15000); // Longer delay for video processing
            } else {
                await randomDelay(5000, 8000);
            }
            
            // Wait for and click the "Next" button
            const nextButtonSelector = 'button[aria-label="Next"]';
            await page.waitForSelector(nextButtonSelector);
            await randomDelay(2000, 3000);
            await page.click(nextButtonSelector);
            
            // Wait for the next screen to load
            await randomDelay(3000, 5000);
            
        } catch (error) {
            console.error(`Error uploading ${isVideo ? 'video' : 'image'}:`, error);
            throw error;
        }
        
        console.log("Successfully loaded LinkedIn feed!");
    }

    await randomDelay();

    // Click post button
    const postButtonSelector = 'button.share-actions__primary-action';
    await page.waitForSelector(postButtonSelector);
    await page.click(postButtonSelector);
    console.log("Post created successfully!");
    
    // Wait for post to complete
    await randomDelay(8000, 12000);
}

/**
 * Main function to run the LinkedIn bot
 */
async function runBot() {
    const { config, credentials, browser_profile_name } = JSON.parse(process.env.BOT_CONFIG || '{}');
    if (!credentials || !credentials.username || !credentials.password) {
        console.error("Missing LinkedIn credentials in configuration.");
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
        
        console.log("Navigating to LinkedIn login...");
        await page.goto('https://www.linkedin.com/login');
        await randomDelay();

        // Check if we're still on the login page
        const currentUrl = page.url();
        if (currentUrl.includes('/login')) {
            console.log("Login required. Attempting to login...");
            await page.waitForSelector('#username');
            await randomDelay();
            await page.type('#username', credentials.username, { delay: 100 });
            await randomDelay();
            await page.type('#password', credentials.password, { delay: 100 });
            await randomDelay();
            await page.click('button[type="submit"]');
            await page.waitForNavigation();
        }

        // Navigate to feed and verify we can post
        await randomDelay();

        // Check if we can see the post button using the new selector
        const canPost = await page.waitForSelector('button strong:has-text("Start a post")', {
            timeout: 5000
        }).then(() => true).catch(() => false);

        if (!canPost) {
            console.log("Retrying navigation to feed...");
            await page.goto('https://www.linkedin.com/feed/');
            await page.waitForSelector('button strong:has-text("Start a post")', {
                timeout: 60000
            });
        }

        console.log("Successfully loaded LinkedIn feed!");
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
            console.log("Refreshing LinkedIn feed for next post.");
            await page.goto('https://www.linkedin.com/feed/');
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
    console.error("Error running LinkedIn bot:", err);
    process.exit(1);
});
