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

async function postImageToInstagram(imagePath, caption, postTime) {
    console.log("Using Chrome profile:", CHROME_PROFILE_PATH);
    
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
        
        await page.fill(usernameSelector, process.env.INSTAGRAM_USERNAME);
        await randomDelay(3000, 5500);
        
        await page.fill(passwordSelector, process.env.INSTAGRAM_PASSWORD);
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
        console.log("Entering caption...");
    
        // Ensure the field is focused
        await page.click(captionSelector);
        await randomDelay(1500, 2500);
    
        // Use `type()` instead of `keyboard.press()` for better reliability
        await page.type(captionSelector, caption, { delay: 100 });
    
        // Trigger input events to ensure Instagram registers the change
        await page.evaluate((args) => {
            const { selector, caption } = args;
            const captionBox = document.querySelector(selector);
            if (captionBox) {
                captionBox.innerText = caption; // Ensure text is set
                captionBox.dispatchEvent(new Event('input', { bubbles: true }));
                captionBox.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, { selector: captionSelector, caption });
        
    
        // Confirm that caption was entered correctly
        const enteredCaption = await page.evaluate((selector) => {
            return document.querySelector(selector)?.innerText.trim() || "";
        }, captionSelector);
    
        if (enteredCaption === caption.trim()) {
            console.log("Caption entered successfully and verified.");
        } else {
            console.warn(`Caption mismatch: Expected "${caption}", but got "${enteredCaption}"`);
        }
    
        await randomDelay(2000, 3000);
    } else {
        console.log("Skipping caption - none provided or empty");
    }
    

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
    const { imagePath, caption, postTime } = botConfig;

    // Validate required configuration
    if (!imagePath) {
        console.error("No image path provided in configuration.");
        return;
    }

    // Log the configuration for debugging
    console.log("Bot Configuration:", {
        imagePath,
        caption: caption && caption.trim() ? caption : 'Caption skipped',
        postTime
    });

    // Call the post function with extracted config
    await postImageToInstagram(imagePath, caption, postTime);
}

runBot().catch(err => {
    console.error("Error running Instagram bot:", err);
});
