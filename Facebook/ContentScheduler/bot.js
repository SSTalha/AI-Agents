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

let context = null;
let page = null;

const launchBrowser = async (config) => {
    try {
        // Get the profile name from config
        const browser_profile_name = config.browser_profile_name || 'Default';
        console.log(`Using Chrome profile: ${browser_profile_name}`);

        // Kill any existing Chrome processes using the specific profile
        if (process.platform === 'win32') {
            try {
                await require('child_process').execSync('taskkill /F /IM chrome.exe');
            } catch (e) {
                // It's okay if there are no Chrome processes to kill
                console.log("No existing Chrome processes found");
            }
        }

        // Wait a moment for processes to clean up
        await new Promise(resolve => setTimeout(resolve, 1000));

        const userDataDir = getChromeProfilePath(browser_profile_name);
        const executablePath = getChromeExecutablePath();
        console.log(`Using Chrome executable at: ${executablePath}`);
        console.log("Launching new browser context...");
        
        context = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            channel: 'chrome',
            executablePath,
            args: [
                `--profile-directory=${browser_profile_name}`,
                    '--disable-blink-features=AutomationControlled',
                    '--start-maximized'
            ]
        });

        // Create a new page in this context
        page = await context.newPage();
        console.log("Browser launched successfully!");
        
        // Add event listener for when the browser disconnects unexpectedly
        context.on('close', () => {
            console.log('Browser context was closed');
            context = null;
            page = null;
        });

        console.log("Navigating to Facebook...");
        await page.goto('https://www.facebook.com');
        await randomDelay(3000, 5000);

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
            console.log("Login successful!");
        } else {
            console.log("Already logged in!");
        }

    } catch (error) {
        console.error("Error launching browser:", error);
        if (context) {
            try {
                await context.close();
            } catch (closeError) {
                console.error("Error closing context:", closeError);
            }
        }
        throw error;
    }
};

// Add cleanup function for graceful shutdown
async function cleanup() {
    if (context) {
        try {
            await context.close();
        } catch (error) {
            console.error("Error during cleanup:", error);
        }
    }
}

// Handle process termination
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

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
    const { postContent, filePath } = post;
    console.log("Creating new post...");
    
    try {
        // Wait for and click the post creation button with updated selector
        const writeButtonSelector = 'div[role="button"] span:has-text("Write something...")';
        await page.waitForSelector(writeButtonSelector, { timeout: 30000 });
        await randomDelay();
        await page.click(writeButtonSelector);
        console.log("Post button clicked");
        
        console.log("Waiting for post modal to load...");
        await randomDelay(5000, 10000);

         // If we have an image to upload
    if (filePath) {
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
            const absoluteImagePath = path.resolve(filePath);
            
            // Look for file input
            const fileInputElement = await page.$('input[type="file"]');
            if (fileInputElement) {
                // If direct file input is not found, try file chooser event
                const [fileChooser] = await Promise.all([
                    page.waitForEvent('filechooser'),
                    page.click('div[aria-label="Photo/video"]')
                ]);
                console.log("image2");
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
        
        // Type content with human-like delays
        const textboxSelector = 'div[aria-label="Create a public post…"][contenteditable="true"][role="textbox"]';
        await page.waitForSelector(textboxSelector, { timeout: 30000 });
        console.log("Found post modal textbox");
        page.click(textboxSelector);


        // // Clear any existing content first
        // await page.evaluate((selector) => {
        //     const element = document.querySelector(selector);
        //     if (element) element.innerHTML = '';
        // }, textboxSelector);

        // Type content with human-like delays
        for (const char of postContent.split('')) {
            await page.type(textboxSelector, char);
            await new Promise(resolve => setTimeout(resolve, Math.random() * 300));
        }
        
      

    await randomDelay();

    // Click post button with simplified selector
    const postButtonSelector = 'div[aria-label="Post"][role="button"]';
    await page.waitForSelector(postButtonSelector, { timeout: 30000 });
    await page.click(postButtonSelector);
    console.log("Post created successfully!");
    
    // Wait for post to complete
    await randomDelay(8000, 12000);
    } catch (error) {
        console.error("Error in createPost:", error);
        throw error;
    }
}

/**
 * Fetches and stores joined Facebook groups
 */
async function fetchAndUpdateGroups(page) {
    console.log("Navigating to groups page...");
    await page.goto('https://www.facebook.com/groups/joins/');
    await randomDelay(5000, 8000);

    console.log("Waiting for groups to load...");
    await page.waitForSelector('a[aria-label="View group"]', { timeout: 30000 });
    await randomDelay();

    const groups = await page.evaluate(() => {
        const groupLinks = Array.from(document.querySelectorAll('a[aria-label="View group"]'));
        return groupLinks.map(link => ({
            url: link.href,
            lastPosted: null
        }));
    });

    console.log(`Found ${groups.length} groups`);
    if (groups.length === 0) {
        throw new Error("No groups found! Please ensure you have joined some groups.");
    }

    // Load existing groups data or create new
    let groupsData = {};
    const fs = require('fs');
    const groupsFilePath = path.join(__dirname, 'groups_history.json');

    try {
        if (fs.existsSync(groupsFilePath)) {
            groupsData = JSON.parse(fs.readFileSync(groupsFilePath, 'utf8'));
        }
    } catch (error) {
        console.log("Creating new groups history file.");
    }

    // Update groups data with new groups
    groups.forEach(group => {
        if (!groupsData[group.url]) {
            groupsData[group.url] = {
                lastPosted: null
            };
        }
    });

    // Save updated groups data
    fs.writeFileSync(groupsFilePath, JSON.stringify(groupsData, null, 2));
    console.log("Groups data updated successfully");
    
    return groupsData;
}

/**
 * Finds the next eligible group for posting
 */
function findNextEligibleGroup(groupsData) {
    const entries = Object.entries(groupsData);
    entries.sort((a, b) => {
        const aTime = a[1].lastPosted ? new Date(a[1].lastPosted) : new Date(0);
        const bTime = b[1].lastPosted ? new Date(b[1].lastPosted) : new Date(0);
        return aTime - bTime;
    });
    
    return entries[0]?.[0]; // Returns the URL of the group that hasn't been posted to in the longest time
}

/**
 * Creates a post in a specific Facebook group
 */
async function createGroupPost(page, post, groupUrl) {
    console.log(`Navigating to group: ${groupUrl}`);
    await page.goto(groupUrl);
    await randomDelay(5000, 8000);

    // Rest of the post creation logic
    await createPost(page, post);
}

/**
 * Main function to run the Facebook bot
 */
async function runBot() {
    const { credentials, config, browser_profile_name } = JSON.parse(process.env.BOT_CONFIG || '{}');
    if (!credentials || !credentials.username || !credentials.password) {
        console.error("Missing Facebook credentials in configuration.");
        return;
    }

    const posts = Array.isArray(config) ? config : [config];
    
    if (!posts.length) {
        console.error("No posts configured.");
        return;
    }

    posts.sort((a, b) => new Date(a.postTime) - new Date(b.postTime));
    
    let groupsData = {};
    
    try {
        // Pass the entire parsed config to launchBrowser
        await launchBrowser({ browser_profile_name });

        // Fetch groups data
        console.log("Fetching groups data...");
        groupsData = await fetchAndUpdateGroups(page);
        console.log(`Successfully loaded ${Object.keys(groupsData).length} groups`);

        // Verify we have groups
        if (Object.keys(groupsData).length === 0) {
            throw new Error("No groups found after fetching. Please ensure you have joined some groups.");
        }

        // Process posts
        for (const [idx, post] of posts.entries()) {
            const scheduledTime = new Date(post.postTime);
            
            // Handle scheduling
            const delay = scheduledTime - new Date();
            if (delay > 0) {
                console.log(`Waiting ${(delay / 1000).toFixed(2)} seconds until scheduled time ${scheduledTime}`);
                await new Promise(res => setTimeout(res, delay));
            }

            // Refresh groups data before each post
            console.log("Refreshing groups data...");
            groupsData = await fetchAndUpdateGroups(page);

            // Find next eligible group
            const nextGroupUrl = findNextEligibleGroup(groupsData);
            if (!nextGroupUrl) {
                console.log("All groups have been posted to. Resetting posting history...");
                Object.keys(groupsData).forEach(url => {
                    groupsData[url].lastPosted = null;
                });
                const newGroupUrl = findNextEligibleGroup(groupsData);
                if (!newGroupUrl) {
                    throw new Error("No groups available for posting!");
                }
                await createGroupPost(page, post, newGroupUrl);
                groupsData[newGroupUrl].lastPosted = new Date().toISOString();
            } else {
                console.log(`Creating post in group: ${nextGroupUrl}`);
                await createGroupPost(page, post, nextGroupUrl);
                groupsData[nextGroupUrl].lastPosted = new Date().toISOString();
            }

            // Save updated groups data
            require('fs').writeFileSync(
                path.join(__dirname, 'groups_history.json'), 
                JSON.stringify(groupsData, null, 2)
            );

            if (idx < posts.length - 1) {
                console.log("Waiting before next post...");
                await randomDelay(15000, 20000);
            }
        }
    } catch (error) {
        console.error("Error in bot execution:", error);
        throw error;
    } finally {
        await cleanup();
    }
}

runBot().catch(err => {
    console.error("Error running Facebook bot:", err);
    process.exit(1);
});
