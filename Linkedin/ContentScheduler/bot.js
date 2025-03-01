const path = require('path');
const { chromium } = require('playwright');
const os = require('os');
const fs = require('fs');

/**
 * Returns the Chrome user profile base directory.
 * Note: Do NOT append the profile name here.
 * The profile (e.g. "Profile 2") will be selected via the launch args.
 */
function getChromeProfilePath() {
    // Note: This function now returns only the base directory.
    return process.platform === 'win32'
        ? path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data')
        : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome')
        : path.join(os.homedir(), '.config', 'google-chrome');
}

/**
 * Returns a promise that resolves after a random delay.
 */
function randomDelay(min = 3000, max = 8000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
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
 * Creates a LinkedIn post with the given content and image
 */
async function createPost(page, post) {
    const { caption, filePath } = post;
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
    await page.type('div[role="textbox"]', caption, { delay: 100 });
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
    // Parse the bot configuration from environment variable
    const botConfig = JSON.parse(process.env.BOT_CONFIG || '{}');
    const { config, credentials, browser_profile_name } = botConfig;

    if (!credentials || !credentials.username || !credentials.password) {
        console.error("Missing LinkedIn credentials in configuration.");
        return;
    }

    // Normalize config to always be an array
    const posts = Array.isArray(config) ? config : [config];
    
    if (!posts[0]) {
        console.error("No post configuration provided.");
        return;
    }

    // Use the precomputed scheduledTime if available
    posts.sort((a, b) => new Date(a.scheduledTime || a.postTime) - new Date(b.scheduledTime || b.postTime));
    chromeProfilePath = getChromeProfilePath();
    let context, page, lastScheduledTime;

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
        
        // Navigate to LinkedIn
        await page.goto('https://www.linkedin.com');
        await page.waitForTimeout(5000);

        // Login logic (existing implementation)
        try {
            // Check if login is required
            const loginButton = await page.$('a[data-tracking-control-name="guest_homepage-basic_nav-header-join"]');
            if (loginButton) {
                console.log("Login required. Proceeding with login...");
                
                // Navigate to login page
                await page.click('a[data-tracking-control-name="guest_homepage-basic_nav-header-join"]');
                await page.waitForTimeout(3000);
                
                // Enter username
                await page.fill('input[name="session_key"]', credentials.username);
                await page.fill('input[name="session_password"]', credentials.password);
                
                // Click login button
                await page.click('button[type="submit"]');
                
                // Wait for login to complete
                await page.waitForTimeout(5000);
            } else {
                console.log("Already logged in or on homepage.");
            }
        } catch (error) {
            console.error("Login process error:", error);
        }
    };

    // Existing post processing logic remains the same
    for (const [idx, post] of posts.entries()) {
        const scheduledTime = new Date(post.postTime);

        // Launch browser if needed
        if (!context || (lastScheduledTime && (scheduledTime - lastScheduledTime > 300000))) {
            if (context) console.log("Gap more than 5 minutes detected. Closing current window.");
            await launchBrowser();
        } else {
            console.log("Short gap detected. Preparing for next post.");
        }

        // Wait until scheduled time
        const delay = scheduledTime - new Date();
        if (delay > 0) {
            console.log(`Waiting ${(delay / 1000).toFixed(2)} seconds until scheduled time ${scheduledTime}`);
            await new Promise(res => setTimeout(res, delay));
        } else {
            console.log(`Scheduled time ${scheduledTime} already passed. Posting immediately.`);
        }
        
        // Create post
        await createPost(page, post);
        
        // Wait between posts if multiple posts
        if (posts.length > 1 && idx < posts.length - 1) {
            console.log("Waiting 8 - 13 seconds before next post...");
            await randomDelay(8000, 13000);
            
            // Reload page to reset context
            await page.reload();
            await page.waitForTimeout(10000);
        }
        
        lastScheduledTime = scheduledTime;
    }

    // Close browser context
    if (context) {
        console.log("Waiting 2 minutes before closing browser...");
        await new Promise(res => setTimeout(res, 120000));
        await context.close();
    }
}

module.exports = { runBot };
