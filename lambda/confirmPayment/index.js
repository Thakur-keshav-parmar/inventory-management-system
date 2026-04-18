// Lambda: HardwarePro-ConfirmPayment
// Verifies Razorpay payment signature and stores transaction in DynamoDB
const crypto = require('crypto');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');

const db = new DynamoDBClient({});

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            transactionId,
            userId,
            amount
        } = body;

        // Verify Razorpay signature (HMAC SHA256)
        const expectedSig = crypto
            .createHmac('sha256', process.env.KEY_SECRET)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');

        if (expectedSig !== razorpay_signature) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, error: 'Invalid payment signature' })
            };
        }

        // Store transaction in DynamoDB
        await db.send(new PutItemCommand({
            TableName: process.env.TABLE_NAME,
            Item: {
                transactionId: { S: transactionId || ('tx_' + Date.now()) },
                userId: { S: userId || 'guest' },
                amount: { N: String(amount || 0) },
                status: { S: 'captured' },
                timestamp: { S: new Date().toISOString() },
                razorpayOrderId: { S: razorpay_order_id },
                razorpayPaymentId: { S: razorpay_payment_id }
            }
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                transactionId,
                paymentId: razorpay_payment_id
            })
        };
    } catch (err) {
        console.error('ConfirmPayment error:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: err.message })
        };
    }
};
