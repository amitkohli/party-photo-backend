import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const PHOTOS_TABLE_NAME = process.env.PHOTOS_TABLE_NAME;

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS preflight success' }),
    };
  }

  const partyName = event.queryStringParameters?.partyName;
  const startAfterKey = event.queryStringParameters?.startAfterKey;
  const limit = parseInt(event.queryStringParameters?.limit || '20', 10);

  if (!partyName) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: 'Missing partyName query parameter' }),
    };
  }

  try {
    const input = {
      TableName: PHOTOS_TABLE_NAME,
      KeyConditionExpression: 'partyName = :partyName',
      ExpressionAttributeValues: {
        ':partyName': partyName,
      },
      Limit: limit,
      ScanIndexForward: false,
    };

    if (startAfterKey) {
      input.ExclusiveStartKey = {
        partyName,
        photoKey: startAfterKey,
      };
    }

    const data = await docClient.send(new QueryCommand(input));

    const photos = (data.Items || []).filter(photo => !photo.deleted);

    const response = {
      photos,
      nextStartAfter: data.LastEvaluatedKey?.photoKey || null,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error retrieving photos:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Failed to retrieve photos' }),
    };
  }
};
