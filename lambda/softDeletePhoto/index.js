import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const PHOTOS_TABLE_NAME = process.env.PHOTOS_TABLE_NAME;
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

  // Validate required environment variable
  if (!PHOTOS_TABLE_NAME) {
    console.error("Missing PHOTOS_TABLE_NAME environment variable");
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: "Server configuration error" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (err) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: "Invalid JSON in request body" }),
    };
  }

  const { partyName, photoKey } = body;

  if (!partyName || !photoKey) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: "Missing partyName or photoKey in request body" }),
    };
  }

  try {
    const updateCmd = new UpdateCommand({
      TableName: PHOTOS_TABLE_NAME,
      Key: { partyName, photoKey },
      UpdateExpression: "SET deleted = :deleted",
      ExpressionAttributeValues: {
        ":deleted": true,
      },
    });

    await ddbClient.send(updateCmd);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: "Photo soft-deleted successfully" }),
    };
  } catch (err) {
    console.error("Error soft-deleting photo:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: "Failed to soft-delete photo" }),
    };
  }
};
