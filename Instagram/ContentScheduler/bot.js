const path = require('path');
const { chromium } = require('playwright');

const CHROME_PROFILE_PATH = 'C:\\Users\\Haroon\\AppData\\Local\\Google\\Chrome\\User Data\\Profile 2';
// const CHROME_PROFILE_PATH = 'C:\\Users\\Talha\\AppData\\Local\\Google\\Chrome\\User Data\\Profile 17';


/**
 * Returns a promise that resolves after a random delay.
 * Mimics human-like delays between actions.
 */
function randomDelay(min = 3000, max = 8000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}

async function postImageToInstagram(imagePath, caption, postTime, username, password) {
    console.log("Using Chrome profile:", CHROME_PROFILE_PATH);
    console.log("username", username);
    console.log("password", password);
    
    // Parse the post time
    const postDateTime = new Date(postTime);
    const now = new Date();

    // Calculate the delay until the post time
    const delayUntilPost = postDateTime - now;

    if (delayUntilPost > 0) {
        console.log(`Post scheduled for ${postDateTime}. Waiting ${delayUntilPost / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delayUntilPost));
    } else {
        console.log(`Post time ${postDateTime} has already passed. Posting immediately.`);
    }
    
    const context = await chromium.launchPersistentContext(
        CHROME_PROFILE_PATH,
        { 
            headless: false,
            channel: 'chrome'
        }
    );
    
    const page = await context.newPage();
    console.log("Browser launched successfully!");

    console.log("Navigating to Instagram...");
    await page.goto('https://www.instagram.com');
    await page.waitForTimeout(3000 + await randomDelay());

    // Check if login is required
    const usernameSelector = "input[name='username']";
    const passwordSelector = "input[name='password']";
    const loginButtonSelector = 'button[type="submit"]';

    if (await page.$(usernameSelector)) {
        console.log("No session detected, performing login...");
        
        await page.fill(usernameSelector, username);
        await randomDelay(3000, 5500);
        
        await page.fill(passwordSelector, password);
        await randomDelay(3000, 5500);
        
        await page.click(loginButtonSelector);
        console.log("Logging in...");

        try {
            await page.waitForSelector('div[role="button"]:has-text("Not now")', { timeout: 15000 });
            console.log("Login successful! Dismissing 'Not now' popup.");
            await randomDelay(2500, 5000);
            await page.click('div[role="button"]:has-text("Not now")');
            await randomDelay(2000, 4500);
        } catch (err) {
            console.log("Login may have failed or is taking too long.");
        }
    } else {
        console.log("Session loaded. Skipping login.");
    }

    console.log("Initiating new post...");
    await page.click('span:has-text("Create")');
    await randomDelay(3000, 5000);

    try {
        await Promise.race([
            page.click('span:has-text("Post"):visible'),
            page.click('a[role="link"]:has-text("Post")'),
            page.click('svg[aria-label="Post"]'),
            page.click('div[role="dialog"] span:has-text("Post")')
        ]);
        console.log("Clicked on Post option");
        await randomDelay(3000, 5000);
    } catch (error) {
        console.log("Error clicking Post option:", error);
        throw error;
    }

    console.log("Waiting for file input...");
    await page.waitForSelector('button:has-text("Select from computer")', { 
        timeout: 60000,
        state: 'visible'
    });

    const absoluteImagePath = path.resolve(imagePath);
    const fileInputElement = await page.$('input[type="file"]');

    if (fileInputElement) {
        await page.setInputFiles('input[type="file"]', absoluteImagePath);
        console.log("Uploading image using the file input element.");
    } else {
        const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            page.click('button:has-text("Select from computer")')
        ]);
        await randomDelay(3000, 5000);
        await fileChooser.setFiles(absoluteImagePath);
        console.log("Uploading image using the file chooser event.");
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

   
// Add caption text if provided and not empty
if (caption && caption.trim()) {
    await page.fill(captionSelector, caption);
    console.log("Entering caption...");
    await randomDelay(2000, 3000);

    // Simulate typing by sending keypresses
    await page.type(captionSelector, ' ', { delay: 100 });
    await randomDelay(1000, 2000);

    // Remove focus from the caption input field
    await page.evaluate(() => document.activeElement.blur());
    console.log("Caption entered successfully and input blurred.");
} else {
    console.log("Skipping caption - none provided or empty");
}

await randomDelay(3000, 5000);

    

    console.log("Looking for share button in post modal...");
    await page.evaluate(() => {
        const headings = Array.from(document.querySelectorAll('div[role="heading"]'));
        const postModalHeading = headings.find(heading => heading.textContent.includes('Create new post'));
        if (!postModalHeading) {
            throw new Error('Post modal heading not found');
        }

        const modalContainer = postModalHeading.closest('div[role="dialog"]');
        if (!modalContainer) {
            throw new Error('Modal container not found');
        }

        const buttons = Array.from(modalContainer.querySelectorAll('div[role="button"]'));
        const shareButton = buttons.find(button => button.textContent.includes('Share'));
        if (shareButton) {
            shareButton.click();
        } else {
            throw new Error('Share button not found in post modal');
        }
    });

    console.log("Clicked share button");
    console.log("Image posted to Instagram successfully!");

    
    // Wait at least 2 minutes before closing the browser
    console.log("Waiting 2 minutes before closing browser...");
    await new Promise(resolve => setTimeout(resolve, 120000)); // 2 minutes
    await context.close();
}

// Main function to run the bot
async function runBot() {
    const botConfig = JSON.parse(process.env.BOT_CONFIG || '{}');
    const { config, credentials } = botConfig;
    
    if (!credentials || !credentials.username || !credentials.password) {
        console.error("Missing Instagram credentials in configuration.");
        return;
    }

    // Destructure the nested config object
    const { imagePath, caption, postTime } = config || {};

    // Validate required configuration
    if (!imagePath) {
        console.error("No image path provided in configuration.");
        console.log("Received botConfig:", JSON.stringify(botConfig, null, 2)); // Debug log
        return;
    }

    // Log the configuration for debugging
    console.log("Bot Configuration:", {
        imagePath,
        caption: caption && caption.trim() ? caption : 'Caption skipped',
        postTime
    });

    // Call the post function with extracted config
    await postImageToInstagram(imagePath, caption, postTime, credentials.username, credentials.password);
}

runBot().catch(err => {
    console.error("Error running Instagram bot:", err);
});
