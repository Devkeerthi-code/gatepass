import "dotenv/config";

// Tests run against an isolated schema so they never touch app data.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error("Set TEST_DATABASE_URL to run tests (see .env.example).");
process.env.DATABASE_URL = testUrl;
process.env.TICKET_SIGNING_SECRET ??= "test-ticket-signing-secret-0123456789abcdef";
process.env.MOCK_PAYMENT_SECRET ??= "test-mock-payment-secret-0123";
