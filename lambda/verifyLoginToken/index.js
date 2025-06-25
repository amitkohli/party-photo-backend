import jwt from "jsonwebtoken";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const JWT_SECRET = process.env.JWT_SECRET;
const PARTIES_TABLE_NAME = process.env.PARTIES_TABLE_NAME;

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: "CORS preflight success" }),
    };
  }

  // Ensure required environment variables are set
  if (!JWT_SECRET || !PARTIES_TABLE_NAME) {
    console.error("Missing required environment variables");
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: "Server configuration error" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const token = body.token;

    if (!token) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: "Missing token" }),
      };
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      console.error("JWT verification failed:", err);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: "Invalid or expired token" }),
      };
    }

    const email = decoded.email;
    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: "Invalid token payload" }),
      };
    }

    const queryCmd = new QueryCommand({
      TableName: PARTIES_TABLE_NAME,
      IndexName: "emailIndex",
      KeyConditionExpression: "email = :email",
      ExpressionAttributeValues: {
        ":email": email,
      },
    });

    const { Items: parties = [] } = await ddbClient.send(queryCmd);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ email, parties }),
    };
  } catch (err) {
    console.error("Unexpected error in verifyLoginToken:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
