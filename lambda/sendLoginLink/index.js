import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const ses = new SESClient({});
const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

const TOKENS_TABLE = process.env.TOKENS_TABLE;
const LOGIN_URL_BASE = process.env.LOGIN_URL_BASE;
const EMAIL_FROM = process.env.EMAIL_FROM;

export const handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers };
  }

  try {
    // Validate environment variables
    if (!TOKENS_TABLE || !LOGIN_URL_BASE || !EMAIL_FROM) {
      console.error("Missing one or more required environment variables.");
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ message: "Server misconfigured." }),
      };
    }

    const body = JSON.parse(event.body || "{}");
    const email = (body.email || "").trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: "Invalid or missing email." }),
      };
    }

    const token = randomUUID();
    const ttl = Math.floor(Date.now() / 1000) + 15 * 60; // 15 minutes from now
    const createdAt = new Date().toISOString();

    // Store token in DynamoDB
    await ddbDocClient.send(
      new PutCommand({
        TableName: TOKENS_TABLE,
        Item: {
          token,
          email,
          ttl,
          createdAt,
        },
      })
    );

    const loginLink = `${LOGIN_URL_BASE}?token=${token}`;

    // ✅ Always use EMAIL_FROM as sender, never use the recipient email
    const emailParams = {
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: "Your login link" },
        Body: {
          Text: {
            Data: `Click the following link to log in:\n\n${loginLink}\n\nThis link will expire in 15 minutes.`,
          },
        },
      },
      Source: EMAIL_FROM,
    };

    await ses.send(new SendEmailCommand(emailParams));

    console.log(`Login link sent to: ${email}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: "Login link sent" }),
    };
  } catch (error) {
    console.error("sendLoginLink error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
