const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const https = require('https');
const TelegramBot = require('node-telegram-bot-api');

puppeteer.use(StealthPlugin());

const token = '7126129647:AAHDe7dOFEEHTVv2DmSvpoePusZsr68zGYA';
const chatId = '1066322129';
const bot = new TelegramBot(token, { polling: true });
const logFilePath = 'logbot.txt';
const sendMessageToTelegram = (message) => {
  bot.sendMessage(chatId, message).catch(error => console.log(error));
};

let logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const startTime = new Date();
  const duration = 600000 * 60 * 1000;
  const reloadInterval =  120 * 1000;
  let loggedItems = {};

  setInterval(() => sendMessageToTelegram('The script is running...'), 60 * 60 * 1000);

  const log = (message, itemName, priceDifferencePercentage, priceDifference, apiPriceUSD) => {
    if (!loggedItems[itemName] && apiPriceUSD !== null) {
      console.log(message);
      logStream.write(`${message}\n`);
      loggedItems[itemName] = true;

      if (priceDifferencePercentage > -5) {
        sendMessageToTelegram(message);
      }
    }
  };

  const fetchItemPrices = () => {
    return new Promise((resolve, reject) => {
      https.get('https://market.dota2.net/api/v2/prices/orders/USD.json', (resp) => {
        let data = '';
        resp.on('data', (chunk) => {
          data += chunk;
        });
        resp.on('end', () => {
          try {
            const jsonResponse = JSON.parse(data);
            if (jsonResponse.success) {
              // Transform the items object into an array of items
              const itemsArray = Object.entries(jsonResponse.items).map(([key, value]) => {
                return {
                  ...value,
                  market_hash_name: value.market_hash_name, // Assuming 'market_hash_name' holds the name
                  price: value.price // Assuming 'price' is what you're interested in
                };
              });
              resolve({ items: itemsArray });
            } else {
              reject(new Error("API response was not successful."));
            }
          } catch (e) {
            reject(e);
          }
        });
      }).on("error", (err) => {
        reject(err);
      });
    });
  };

  const apiPrices = await fetchItemPrices();
  

  while (new Date() - startTime < duration) {
    await page.goto('https://www.bynogame.com/tr/oyunlar/dota2/skin-last?size=500', { waitUntil: 'networkidle0', timeout: 60000 });

    const itemCards = await page.$$('.h-100.itemCard.ping');

for (let itemCard of itemCards) {
  // Insert the "SOLD" check here
  const isSold = await itemCard.evaluate(el => el.querySelector('.ribbon .ribbon__content')?.textContent.trim() === 'SOLD');

  // If the item is sold, skip the rest of the loop iteration
  if (isSold) continue;

  // Existing item processing code follows
  const itemName = await itemCard.evaluate(el => el.querySelector('.itemCard__info h2')?.textContent.trim());
  const itemLink = await itemCard.evaluate(el => el.querySelector('a').href);
  const priceTL = await itemCard.evaluate(el => {
    const priceElement = el.querySelector('.font-weight-bolder.mb-0.text-black');
    return priceElement ? parseFloat(priceElement.textContent.trim().replace('.', '').replace(',', '.')) : null;
  });
  const usdExchangeRate = 32; // Ensure this value is updated or dynamically fetched as needed
  const priceUSD = priceTL / usdExchangeRate;

      const apiItem = apiPrices.items.find(item => item.market_hash_name === itemName);
      const apiPriceUSD = apiItem ? parseFloat(apiItem.price) : null;

      if (!loggedItems[itemName]) {
        const priceDifference = apiPriceUSD ? apiPriceUSD - priceUSD : null;
        const priceDifferencePercentage = priceDifference !== null ? ((priceDifference / priceUSD) * 100) : null;
        const message = `Item name: ${itemName}, scraped price (USD): ${priceUSD.toFixed(2)}, API price (USD): ${apiPriceUSD ? apiPriceUSD.toFixed(2) : 'not found'}, difference: ${priceDifference ? priceDifference.toFixed(2) : 'N/A'}, difference percentage: ${priceDifferencePercentage ? priceDifferencePercentage.toFixed(2) : 'N/A'}%. Link: ${itemLink}`;
        log(message, itemName, priceDifferencePercentage, priceDifference, apiPriceUSD);
      }
    }

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, reloadInterval));
  }

  await browser.close();
  logStream.end();
})();
