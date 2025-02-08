const path = require('path');
const { chromium } = require('playwright');
const fs = require('fs');
const readline = require('readline');

const CHROME_PROFILE_PATH = 'C:\\Users\\Haroon\\AppData\\Local\\Google\\Chrome\\User Data\\Profile 2';



/**
 * Returns a promise that resolves after a random delay.
 * Mimics human-like delays between actions.
 */
function randomDelay(min = 3000, max = 8000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}


async function postImageToInstagram(imagePath) {
    console.log("Using Chrome profile:", CHROME_PROFILE_PATH);
    
    const context = await chromium.launchPersistentContext(
        CHROME_PROFILE_PATH,
        { 
            headless: false,
            channel: 'chrome'
        }
    );
    
    const page = await context.newPage();
    console.log("Browser launched successfully!");

    // Handle the "Restore tabs" popup if it appears
    try {
        await page.waitForSelector('button:has-text("Close")', { timeout: 5000 });
        await page.click('button:has-text("Close")');
        console.log("Closed restore tabs popup");
        await randomDelay(2000, 4000);
    } catch (error) {
        console.log("No restore tabs popup found, continuing...");
    }

    console.log("Navigating to Instagram...");
    await page.goto('https://www.instagram.com');
    await page.waitForTimeout(3000 + await randomDelay());

    // --- LOGIN PROCESS ---
    // If the profile already has a stored session, Instagram may not require login
    // Using the provided selectors for username and password fields.
    const usernameSelector = "input[name='username']";
    const passwordSelector = "input[name='password']";
    const loginButtonSelector = 'button[type="submit"]';

    // Check if login is required by determining if the username field is visible.
    const needLogin = await page.$(usernameSelector);
    if (needLogin) {
        console.log("No session detected, performing login...");
        
        // Human-like typing for username
        const username = process.env.INSTAGRAM_USERNAME;
        for (const char of username) {
            await page.type(usernameSelector, char, { delay: Math.random() * 100 + 150 }); // 150-250ms per keystroke
            await randomDelay(300, 550); // Additional micro pause between characters
        }
        await randomDelay(3000, 5500); // Natural pause after typing the username
        
        // Human-like typing for password
        const password = process.env.INSTAGRAM_PASSWORD;
        await page.click(passwordSelector); // Focus on the password field
        for (const char of password) {
            await page.type(passwordSelector, char, { delay: Math.random() * 100 + 150 });
            await randomDelay(300, 550);
        }
        await randomDelay(3000, 5500); // Pause before submitting
        
        await page.click(loginButtonSelector);
        console.log("Logging in...");

        // Wait for "Not now" popup on the home page to dismiss saving login info.
        const homePageSelector = 'div[role="button"]:has-text("Not now")';
        try {
            await page.waitForSelector(homePageSelector, { timeout: 15000 });
            console.log("Login successful! 'Not now' popup detected.");
            await randomDelay(2500, 5000); // Increased delay before clicking "Not now"
            await page.click(homePageSelector);
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

    // Click specifically on the "Post" option in the create menu
    try {
        // Wait for and click the Post option using multiple possible selectors
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

    // Now wait for the file input
    console.log("Waiting for file input...");
    await page.waitForSelector('button:has-text("Select from computer")', { 
        timeout: 60000,  // Increased timeout to 60 seconds
        state: 'visible'
    });

    // Ensure the image path is absolute.
    const absoluteImagePath = path.resolve(imagePath);
    
    // Try to find a direct file input element.
    const fileInputElement = await page.$('input[type="file"]');
    if (fileInputElement) {
        // If found, upload the file directly.
        await page.setInputFiles('input[type="file"]', absoluteImagePath);
        console.log("Uploading image using the file input element.");
    } else {
        // If not found, wait for the filechooser event triggered by clicking the button.
        const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            page.click('button:has-text("Select from computer")')
        ]);
        await randomDelay(3000, 5000);
        await fileChooser.setFiles(absoluteImagePath);
        console.log("Uploading image using the file chooser event.");
    }
    await randomDelay();

    // Click the Next buttons
    const nextButtonSelector = 'div[role="button"]:has-text("Next")';
    for (let i = 0; i < 2; i++) {
        await page.click(nextButtonSelector);
        console.log(`Clicked "Next" button (${i + 1}/2)`);
        await randomDelay();
    }

    // Wait for 3 seconds after last Next button
    await page.waitForTimeout(3000);

    // Click the caption field to focus it
    const captionSelector = 'div[aria-label="Write a caption..."][role="textbox"]';
    await page.click(captionSelector);
    console.log("Clicked on caption field");
    await randomDelay(2000, 3000);

 
    // Click the share button within the post modal
    console.log("Looking for share button in post modal...");
    await page.evaluate(() => {
        // First find the post modal heading
        const headings = Array.from(document.querySelectorAll('div[role="heading"]'));
        const postModalHeading = headings.find(heading => heading.textContent.includes('Create new post'));
        if (!postModalHeading) {
            throw new Error('Post modal heading not found');
        }

        // Find the closest parent that contains all the buttons
        const modalContainer = postModalHeading.closest('div[role="dialog"]');
        if (!modalContainer) {
            throw new Error('Modal container not found');
        }

        // Find all buttons within the container and click the share button
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

/**
 * Schedules a post based on the supplied imagePath and posting time.
 * If the scheduled time is in the past, the image is posted immediately.
 */
function schedulePost(imagePath, scheduledTimeStr) {
    const scheduledTime = new Date(scheduledTimeStr);
    const currentTime = new Date();
    const delay = scheduledTime.getTime() - currentTime.getTime();

    console.log(`Scheduled posting time: ${scheduledTime}`);
    if (delay <= 0) {
        console.log("Scheduled time is in the past or now. Posting immediately...");
        postImageToInstagram(imagePath);
    } else {
        console.log(`Post will be scheduled in ${(delay / 1000).toFixed(2)} seconds.`);
        setTimeout(() => {
            postImageToInstagram(imagePath);
        }, delay);
    }
}

/**
 * Prompts the user for input via the command line.
 */
function promptUser(query) {
    const rl = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => rl.question(query, answer => {
        rl.close();
        resolve(answer);
    }));
}

/**
 * Main function:
 * - Prompts the user for image file path.
 * - Verifies and saves the image in a specified folder.
 * - Prompts for scheduled posting time.
 * - Schedules the post accordingly.
 */
async function main() {
    try {
        // Prompt the user for the image file path.
        const imagePathInput = await promptUser("Enter the full file path to the image: ");
        if (!fs.existsSync(imagePathInput)) {
            console.error("The provided image file does not exist.");
            process.exit(1);
        }

        const saveDir = path.join(__dirname, 'scheduled_posts');
        if (!fs.existsSync(saveDir)) {
            fs.mkdirSync(saveDir);
        }
        const uniqueImageName = `${Date.now()}_${path.basename(imagePathInput)}`;
        const savedImagePath = path.join(saveDir, uniqueImageName);
        fs.copyFileSync(imagePathInput, savedImagePath);
        console.log(`Image saved to ${savedImagePath}`);


        console.log("Enter posting time in the following format: YYYY-MM-DD HH:MM (24-hour format)");
        const postTimeInput = await promptUser("Posting time: ");
        const scheduledTime = new Date(postTimeInput);
        if (isNaN(scheduledTime)) {
            console.error("Invalid date/time format.");
            process.exit(1);
        }

        schedulePost(savedImagePath, postTimeInput);
    } catch (error) {
        console.error("An error occurred:", error);
    }
}

main();
