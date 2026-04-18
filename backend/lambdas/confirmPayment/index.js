// Lambda: HardwarePro-ConfirmPayment
const crypto = require('crypto');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');

const db = new DynamoDBClient({});
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://d2ng4b4wuwlw95.cloudfront.net';

const headers = () => ({
    'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Content-Type':                 'application/json',
    'X-Content-Type-Options':       'nosniff',
    'X-Frame-Options':              'DENY'
});

const ok  = (data) => ({ statusCode: 200, headers: headers(), body: JSON.stringify(data) });
const err = (code, msg) => ({ statusCode: code, headers: headers(), body: JSON.stringify({ success: false, error: msg }) });

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers(), body: '' };

    try {
        const body = JSON.parse(event.body || '{}');
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, transactionId, userId, amount } = body;

        // Validate required fields
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
            return err(400, 'Missing payment verification fields');
        if (typeof razorpay_order_id !== 'string' || typeof razorpay_payment_id !== 'string')
            return err(400, 'Invalid payment fields');

        const KEY_SECRET = process.env.KEY_SECRET;
        if (!KEY_SECRET) return err(500, 'Payment service not configured');

        // Verify Razorpay HMAC-SHA256 signature
        const expectedSig = crypto
            .createHmac('sha256', KEY_SECRET)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');

        // Use constant-time comparison to prevent timing attacks
        if (!crypto.timingSafeEqual(Buffer.from(expectedSig, 'hex'), Buffer.from(razorpay_signature, 'hex')))
            return err(400, 'Payment verification failed');

        const txId = transactionId && typeof transactionId === 'string'
            ? transactionId.substring(0, 64)
            : 'tx_' + Date.now();

        await db.send(new PutItemCommand({
            TableName: process.env.TABLE_NAME,
            Item: {
                transactionId:    { S: txId },
                userId:           { S: (userId || 'guest').substring(0, 50) },
                amount:           { N: String(Math.abs(parseFloat(amount) || 0)) },
                status:           { S: 'captured' },
                timestamp:        { S: new Date().toISOString() },
                razorpayOrderId:  { S: razorpay_order_id },
                razorpayPaymentId:{ S: razorpay_payment_id }
            }
        }));

        return ok({ success: true, transactionId: txId, paymentId: razorpay_payment_id });
    } catch (_) {
        return err(500, 'Internal server error');
    }
};
