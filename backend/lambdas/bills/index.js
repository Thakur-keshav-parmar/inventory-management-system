const { DynamoDBClient, ScanCommand, PutItemCommand, BatchWriteItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const db = new DynamoDBClient({});
const T              = process.env.TABLE_NAME;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://d2ng4b4wuwlw95.cloudfront.net';
const MAX_BODY_BYTES = 64 * 1024; // 64 KB

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
            const days = e.queryStringParameters?.days ? parseInt(e.queryStringParameters.days) : null;
            if (days !== null && (isNaN(days) || days < 1 || days > 3650)) return err(400, 'Invalid days parameter');

            const scanParams = { TableName: T };
            if (days) {
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - days);
                scanParams.FilterExpression = '#ts >= :cutoff';
                scanParams.ExpressionAttributeNames = { '#ts': 'timestamp' };
                scanParams.ExpressionAttributeValues = { ':cutoff': { S: cutoff.toISOString() } };
            }

            let items = [], lastKey;
            do {
                if (lastKey) scanParams.ExclusiveStartKey = lastKey;
                const r = await db.send(new ScanCommand(scanParams));
                items = items.concat(r.Items.map(i => unmarshall(i)));
                lastKey = r.LastEvaluatedKey;
            } while (lastKey);

            return ok(items);
        }

        if (e.httpMethod === 'POST') {
            const item = JSON.parse(e.body);
            if (!item || typeof item !== 'object') return err(400, 'Invalid request body');

            if (item.action === 'deleteCustomer') {
                if (!item.customerKey || typeof item.customerKey !== 'string' || item.customerKey.length > 100)
                    return err(400, 'Invalid customerKey');
                const scan = await db.send(new ScanCommand({ TableName: T }));
                const bills = scan.Items.map(i => unmarshall(i));
                const toDelete = bills.filter(b => {
                    const key = b.customerPhone && b.customerPhone !== 'N/A' ? b.customerPhone : b.customerName;
                    return key === item.customerKey;
                });
                for (let i = 0; i < toDelete.length; i += 25) {
                    const batch = toDelete.slice(i, i + 25);
                    await db.send(new BatchWriteItemCommand({
                        RequestItems: { [T]: batch.map(b => ({ DeleteRequest: { Key: { id: { S: b.id } } } })) }
                    }));
                }
                return ok({ success: true, deleted: toDelete.length });
            }

            if (!item.id || typeof item.id !== 'string') return err(400, 'Missing bill id');
            if (!item.timestamp) item.timestamp = new Date().toISOString();
            await db.send(new PutItemCommand({ TableName: T, Item: marshall(item, { removeUndefinedValues: true }) }));
            return ok({ success: true });
        }

        return err(405, 'Method not allowed');
    } catch (_) {
        return err(500, 'Internal server error');
    }
};
