const express = require("express");
const path = require("path");
const dotenv = require("dotenv");
const { randomUUID } = require("crypto");

// Import components from Adyen
const { Client, Config, CheckoutAPI } = require("@adyen/api-library");

dotenv.config({ path: "./.env" });

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "/public")));


// BACKEND STEP 1: SET UP CLIENT

// 1a: Create config
const config = new Config();
config.apiKey = process.env.API_KEY;
config.environment = "TEST";

// 1b: Instantiate client from config
const client = new Client(config);

// 1c: Instantiate checkout from client
const checkout = new CheckoutAPI(client);

// BACKEND STEP 2: CREATE A SESSION
// Step 2a: Define the API POST request
app.post("/api/sessions", async (req, res) => {
    try {
        // Use Idempotency Key to prevent duplication
        const requestOptions = { idempotencyKey: randomUUID() };
        const response = await checkout.PaymentsApi.sessions({

            // For this example, parameters are hard-coded. Use your own 
            // business logic to populate these for your implementation.
            amount: { currency: "USD", value: 1000 },
            countryCode: "US",
            merchantAccount: process.env.MERCHANT_ACCOUNT,
            reference: randomUUID(),
            returnUrl: "http://localhost:5173/result",
        }, requestOptions);

        // Pass the id and sessionData to your client
        // for use in instantiating the Drop-In
        const { id, sessionData } = response;
        res.json({ id, sessionData });
    } catch (error) {

        // BACKEND STEP 3: API ERROR HANDLING
        console.error("Adyen sessions error:", error);
        res.status(500).json({ error: error.message });
    }
});

// AUTHORISATION WEBHOOK ENDPOINT
// Create HMAC validator from Adyen library
const { hmacValidator } = require("@adyen/api-library");
const validator = new hmacValidator();

app.post("/api/webhooks/notifications", (req, res) => {
    const { notificationItems } = req.body;

    // Handle empty
    if (!notificationItems) {
        return res.status(400).json({ error: "Empty notification" });
    }

    for (const item of notificationItems) {
        const notification = item.NotificationRequestItem;

        // Validate HMAC Signature
        if (!validator.validateHMAC(notification, process.env.HMAC_KEY)) {
            console.error("Invalid HMAC signature — ignoring notification");
            return res.status(401).send("Invalid HMAC signature");
        }

        const { eventCode, success, pspReference, merchantReference } = notification;
        console.log(`Webhook received | event: ${eventCode} | success: ${success} | pspRef: ${pspReference} | ref: ${merchantReference}`);

        // Handle specific event types here as needed.

        // AUTHORISATION success
        if (eventCode === "AUTHORISATION" && success === "true") {
            console.log(`Payment authorised for reference: ${merchantReference}`);
            // After this, use the merchantReference to fulfill the order
        }
    }

    // Confirm response, otherwise Adyen will retry after 10 seconds
    res.status(200).send("[accepted]");
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
