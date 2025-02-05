const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Returns a promise that resolves after a random delay.
 * Mimics human-like delays between actions.
 */
function randomDelay(min = 1000, max = 3000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}



async function postImageToInstagram(imagePath) {
    console.log("Starting to post image to Instagram:", imagePath);
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log("Navigating to Instagram login page...");
    await page.goto('https://www.instagram.com/accounts/login/');
    await page.waitForTimeout(3000 + await randomDelay());

    // --- LOGIN PROCESS ---
    const usernameSelector = "input[name='username']";
    const passwordSelector = "input[name='password']";
    const loginButtonSelector = 'button[type="submit"]';

    await page.fill(usernameSelector, process.env.INSTAGRAM_USERNAME || 'your_username');
    await randomDelay();
    await page.fill(passwordSelector, process.env.INSTAGRAM_PASSWORD || 'your_password');
    await randomDelay();

    await page.click(loginButtonSelector);
    console.log("Logging in...");

    // Wait for an element that confirms you have logged in.
    const homePageSelector = 'div[role="button"]:has-text("Not now")';
    try {
        await page.waitForSelector(homePageSelector, { timeout: 10000 });
        console.log("Login successful! 'Not now' popup detected.");
        await page.click(homePageSelector);
        await randomDelay();
    } catch (err) {
        console.log("Login may have failed or is taking too long.");
    }

    // --- POST CREATION PROCESS ---
    const newPostButtonSelector = 'span:has-text("Create")';
    await randomDelay();
    await page.click(newPostButtonSelector);
    console.log("Initiating new post...");

    // Wait for the file input to appear.
    const fileInputSelector = 'button:has-text("Select from computer")';
    await page.waitForSelector(fileInputSelector);
    await randomDelay();

    // Ensure the image path is absolute.
    const absoluteImagePath = path.resolve(imagePath);
    await page.setInputFiles(fileInputSelector, absoluteImagePath);
    console.log("Uploading image:", absoluteImagePath);
    await randomDelay();

    // Optional: Add further steps (such as image cropping or filter selection)
    // TODO: Replace with the actual query selector for the "Next" button (or similar action).
    const nextButtonSelector = 'YOUR_NEXT_BUTTON_SELECTOR';
    await page.click(nextButtonSelector);
    console.log("Proceeding with post creation...");
    await randomDelay();

    // TODO: Replace with the actual query selector for the "Share" or "Post" button.
    const shareButtonSelector = 'YOUR_SHARE_BUTTON_SELECTOR';
    await page.click(shareButtonSelector);
    console.log("Image posted to Instagram successfully!");

    // Final delay then close the browser.
    await randomDelay();
    await browser.close();
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
    const rl = readline.createInterface({
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
