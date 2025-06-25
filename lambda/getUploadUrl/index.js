import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";

const s3Client = new S3Client({});
const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

const BUCKET_NAME = process.env.BUCKET_NAME;
const PHOTOS_TABLE_NAME = process.env.PHOTOS_TABLE_NAME;

export const handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: '',
      };
    }

    // Environment variable validation
    if (!BUCKET_NAME || !PHOTOS_TABLE_NAME) {
      throw new Error("Missing required environment variables.");
    }

    const body = JSON.parse(event.body || '{}');
    const { partyName, files } = body;

    if (!partyName || !Array.isArray(files) || files.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({
          message: "Missing required fields: partyName and files",
        }),
      };
    }

    const uploads = [];
    const errors = [];

    for (const file of files) {
      try {
        const { fileName, contentType } = file;
        if (!fileName || !contentType) {
          throw new Error("Missing fileName or contentType in one of the files");
        }

        const photoKey = `${Date.now()}_${uuidv4()}_${fileName}`;
        const uploadedAt = new Date().toISOString();

        const command = new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: photoKey,
          ContentType: contentType,
        });

        const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });

        await ddbDocClient.send(
          new PutCommand({
            TableName: PHOTOS_TABLE_NAME,
            Item: {
              partyName,
              photoKey,
              uploadedAt,
            },
          })
        );

        uploads.push({
          fileName,
          photoKey,
          uploadedAt,
          presignedUrl,
        });
      } catch (uploadError) {
        console.error("Error processing file:", file, uploadError);
        errors.push({
          fileName: file?.fileName || "unknown",
          error: uploadError.message,
        });
      }
    }

    console.log(`Uploaded ${uploads.length} file(s) for party "${partyName}"`);

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ uploads, errors }),
    };
  } catch (error) {
    console.error("Error in getUploadUrl:", error);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
