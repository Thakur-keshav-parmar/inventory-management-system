const { DynamoDBClient, ScanCommand, PutItemCommand, DeleteItemCommand, BatchWriteItemCommand } = require('@aws-sdk/client-dynamodb');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const db = new DynamoDBClient({});
const s3 = new S3Client({});
const T             = process.env.TABLE_NAME;
const IMAGE_BUCKET  = process.env.IMAGE_BUCKET;
const CDN_URL       = process.env.CDN_URL;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://d2ng4b4wuwlw95.cloudfront.net';

const MAX_BODY_BYTES = 512 * 1024; // 512 KB

const headers = (origin) => ({
    'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Content-Type':                 'application/json',
    'X-Content-Type-Options':       'nosniff',
    'X-Frame-Options':              'DENY',
    'Strict-Transport-Security':    'max-age=63072000; includeSubDomains'
});

const ok  = (data) => ({ statusCode: 200, headers: headers(), body: JSON.stringify(data) });
const err = (code, msg) => ({ statusCode: code, headers: headers(), body: JSON.stringify({ error: msg }) });

function validateProduct(p) {
    if (!p || typeof p !== 'object') return 'Invalid product object';
    if (!p.productId && !p.id) return 'Missing productId';
    if (p.name && typeof p.name !== 'string') return 'Invalid name';
    if (p.price !== undefined && (isNaN(p.price) || p.price < 0)) return 'Invalid price';
    if (p.stock !== undefined && (isNaN(p.stock) || p.stock < 0)) return 'Invalid stock';
    return null;
}

async function uploadImageToS3(productId, base64Data) {
    const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) return base64Data;
    const contentType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    if (buffer.length > 200 * 1024) throw new Error('Image too large (max 200KB)');
    const ext = contentType.split('/')[1] || 'jpg';
    const key = `product-images/${productId}.${ext}`;
    await s3.send(new PutObjectCommand({
        Bucket: IMAGE_BUCKET, Key: key, Body: buffer,
        ContentType: contentType, CacheControl: 'public, max-age=31536000'
    }));
    return CDN_URL ? `${CDN_URL}/${key}` : `https://${IMAGE_BUCKET}.s3.amazonaws.com/${key}`;
}

exports.handler = async (e) => {
    if (e.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers(), body: '' };

    // Body size guard
    if (e.body && Buffer.byteLength(e.body, 'utf8') > MAX_BODY_BYTES)
        return err(413, 'Request body too large');

    try {
        if (e.httpMethod === 'GET') {
            const r = await db.send(new ScanCommand({ TableName: T }));
            return ok(r.Items.map(i => unmarshall(i)));
        }

        if (e.httpMethod === 'POST') {
            const body = JSON.parse(e.body);

            if (Array.isArray(body)) {
                if (body.length > 200) return err(400, 'Batch size exceeds limit of 200');
                for (const p of body) {
                    const e2 = validateProduct(p);
                    if (e2) return err(400, e2);
                }
                for (let i = 0; i < body.length; i += 25) {
                    const batch = body.slice(i, i + 25);
                    const processed = await Promise.all(batch.map(async item => {
                        if (IMAGE_BUCKET && item.image && item.image.startsWith('data:'))
                            item.image = await uploadImageToS3(item.productId || item.id, item.image);
                        return item;
                    }));
                    await db.send(new BatchWriteItemCommand({
                        RequestItems: { [T]: processed.map(item => ({ PutRequest: { Item: marshall(item, { removeUndefinedValues: true }) } })) }
                    }));
                }
                return ok({ success: true, count: body.length });
            }

            const validErr = validateProduct(body);
            if (validErr) return err(400, validErr);
            const item = body;
            if (IMAGE_BUCKET && item.image && item.image.startsWith('data:'))
                item.image = await uploadImageToS3(item.productId || item.id, item.image);
            await db.send(new PutItemCommand({ TableName: T, Item: marshall(item, { removeUndefinedValues: true }) }));
            return ok({ success: true });
        }

        if (e.httpMethod === 'DELETE') {
            const b = JSON.parse(e.body);
            if (!b.productId || typeof b.productId !== 'string') return err(400, 'Invalid productId');
            await db.send(new DeleteItemCommand({ TableName: T, Key: { productId: { S: b.productId } } }));
            return ok({ success: true });
        }

        return err(405, 'Method not allowed');
    } catch (_) {
        return err(500, 'Internal server error');
    }
};
