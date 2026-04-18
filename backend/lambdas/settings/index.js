const { DynamoDBClient, GetItemCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const db = new DynamoDBClient({});
const T              = process.env.TABLE_NAME;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://d2ng4b4wuwlw95.cloudfront.net';
const MAX_BODY_BYTES = 32 * 1024; // 32 KB

const headers = () => ({
    'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Content-Type':                 'application/json',
    'X-Content-Type-Options':       'nosniff',
    'X-Frame-Options':              'DENY',
    'Strict-Transport-Security':    'max-age=63072000; includeSubDomains'
});

const ok  = (data) => ({ statusCode: 200, headers: headers(), body: JSON.stringify(data) });
const err = (code, msg) => ({ statusCode: code, headers: headers(), body: JSON.stringify({ error: msg }) });

exports.handler = async (e) => {
    if (e.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers(), body: '' };

    if (e.body && Buffer.byteLength(e.body, 'utf8') > MAX_BODY_BYTES)
        return err(413, 'Request body too large');

    try {
        if (e.httpMethod === 'GET') {
            const r = await db.send(new GetItemCommand({ TableName: T, Key: { settingKey: { S: 'store' } } }));
            return ok(r.Item ? unmarshall(r.Item) : { settingKey: 'store' });
        }

        if (e.httpMethod === 'POST') {
            const body = JSON.parse(e.body);
            if (!body || typeof body !== 'object') return err(400, 'Invalid request body');
            if (body.phone && !/^\d{10}$/.test(body.phone)) return err(400, 'Invalid phone number');
            if (body.cgstRate !== undefined && (isNaN(body.cgstRate) || body.cgstRate < 0 || body.cgstRate > 50)) return err(400, 'Invalid CGST rate');
            if (body.sgstRate !== undefined && (isNaN(body.sgstRate) || body.sgstRate < 0 || body.sgstRate > 50)) return err(400, 'Invalid SGST rate');
            const item = { ...body, settingKey: 'store' };
            await db.send(new PutItemCommand({ TableName: T, Item: marshall(item, { removeUndefinedValues: true }) }));
            return ok({ success: true });
        }

        return err(405, 'Method not allowed');
    } catch (_) {
        return err(500, 'Internal server error');
    }
};
