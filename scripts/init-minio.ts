import { S3Client, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";

const client = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "ezbillz_minio",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "ezbillz_minio_password",
  },
});

const bucketName = process.env.S3_BUCKET || "ezbillz-bucket";

async function main() {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucketName }));
    console.log(`Bucket "${bucketName}" already exists.`);
  } catch {
    console.log(`Creating bucket "${bucketName}"...`);
    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    console.log(`Bucket "${bucketName}" created successfully.`);
  }
}

main().catch((err) => {
  console.error("Failed to initialize MinIO bucket:", err);
  process.exit(1);
});
