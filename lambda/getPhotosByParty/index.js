import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});

const PHOTOS_TABLE_NAME = process.env.PHOTOS_TABLE_NAME;
const BUCKET_NAME = process.env.BUCKET_NAME;

export const handler = async (event) => {
  const headers = corsHeaders();

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS preflight success' }),
    };
  }

  try {
    const partyName = event.queryStringParameters?.partyName;
    const startAfterKey = event.queryStringParameters?.startAfterKey;
    const limitParam = parseInt(event.queryStringParameters?.limit || '20', 10);
    const limit = isNaN(limitParam) ? 20 : Math.min(limitParam, 100);

    if (!partyName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Missing partyName query parameter' }),
      };
    }

    const queryInput = {
      TableName: PHOTOS_TABLE_NAME,
      KeyConditionExpression: 'partyName = :partyName',
      ExpressionAttributeValues: {
        ':partyName': partyName,
      },
      Limit: limit,
      ScanIndexForward: false,
    };

    if (startAfterKey) {
      queryInput.ExclusiveStartKey = {
        partyName,
        photoKey: startAfterKey,
      };
    }

    const data = await docClient.send(new QueryCommand(queryInput));

    const photos = await Promise.all(
      (data.Items || [])
        .filter((item) => !item.deleted)
        .map(async (photo) => {
          const url = await getSignedUrl(
            s3Client,
            new GetObjectCommand({
              Bucket: BUCKET_NAME,
              Key: photo.photoKey,
            }),
            { expiresIn: 600 }
          );

          return {
            id: photo.photoKey,
            partyName: photo.partyName,
            uploadedAt: photo.uploadedAt,
            url,
          };
        })
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        photos,
        nextStartAfter: data.LastEvaluatedKey?.photoKey || null,
      }),
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

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
