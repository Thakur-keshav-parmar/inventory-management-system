const { DynamoDBClient, ScanCommand, PutItemCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const db = new DynamoDBClient({});
const T              = process.env.TABLE_NAME;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://d2ng4b4wuwlw95.cloudfront.net';
const MAX_BODY_BYTES = 16 * 1024; // 16 KB

const headers = () => ({
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

const VALID_ROLES = ['admin', 'manager', 'staff', 'delivery', 'customer'];

exports.handler = async (e) => {
    if (e.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers(), body: '' };

    if (e.body && Buffer.byteLength(e.body, 'utf8') > MAX_BODY_BYTES)
        return err(413, 'Request body too large');

    try {
        if (e.httpMethod === 'GET') {
            const r = await db.send(new ScanCommand({ TableName: T }));
            // Strip password field before returning (never expose passwords over API)
            const users = r.Items.map(i => {
                const u = unmarshall(i);
                delete u.password;
                return u;
            });
            return ok(users);
        }

        if (e.httpMethod === 'POST') {
            const item = JSON.parse(e.body);
            if (!item || typeof item !== 'object') return err(400, 'Invalid request body');
            if (!item.username || typeof item.username !== 'string' || item.username.length > 50) return err(400, 'Invalid username');
            if (item.role && !VALID_ROLES.includes(item.role)) return err(400, 'Invalid role');
            if (item.phone && !/^\d{10}$/.test(item.phone)) return err(400, 'Invalid phone number');
            // Never store plaintext password — only passwordHash allowed
            delete item.password;
            await db.send(new PutItemCommand({ TableName: T, Item: marshall(item, { removeUndefinedValues: true }) }));
            return ok({ success: true });
        }

        if (e.httpMethod === 'DELETE') {
            const b = JSON.parse(e.body);
            if (!b.username || typeof b.username !== 'string') return err(400, 'Invalid username');
            if (b.username === 'admin') return err(403, 'Cannot delete admin account');
            await db.send(new DeleteItemCommand({ TableName: T, Key: { username: { S: b.username } } }));
            return ok({ success: true });
        }

        return err(405, 'Method not allowed');
    } catch (_) {
        return err(500, 'Internal server error');
    }
};
