// Lambda: HardwarePro-CreateOrder
const https = require('https');

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://d2ng4b4wuwlw95.cloudfront.net';
const MAX_AMOUNT_INR = 500000; // ₹5,00,000 max order limit

const headers = () => ({
    'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Content-Type':                 'application/json',
    'X-Content-Type-Options':       'nosniff',
    'X-Frame-Options':              'DENY'
});

const ok  = (data) => ({ statusCode: 200, headers: headers(), body: JSON.stringify(data) });
const err = (code, msg) => ({ statusCode: code, headers: headers(), body: JSON.stringify({ error: msg }) });

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers(), body: '' };

    try {
        const body = JSON.parse(event.body || '{}');
        const amount = parseFloat(body.amount);

        if (isNaN(amount) || amount <= 0) return err(400, 'Invalid amount');
        if (amount > MAX_AMOUNT_INR) return err(400, 'Amount exceeds maximum allowed limit');

        const amountPaise = Math.round(amount * 100);
        const receipt = 'rcpt_' + Date.now();

        const KEY_ID     = process.env.KEY_ID;
        const KEY_SECRET = process.env.KEY_SECRET;
        if (!KEY_ID || !KEY_SECRET) return err(500, 'Payment service not configured');

        const credentials = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
        const postData = JSON.stringify({ amount: amountPaise, currency: 'INR', receipt });

        const order = await new Promise((resolve, reject) => {
            const req = https.request({
                hostname: 'api.razorpay.com',
                path: '/v1/orders',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Basic ' + credentials,
                    'Content-Length': Buffer.byteLength(postData)
                }
            }, (res) => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => resolve(JSON.parse(data)));
            });
            req.on('error', reject);
            req.write(postData);
            req.end();
        });

        if (!order.id) return err(502, 'Payment service error');
        return ok({ orderId: order.id, amount: order.amount, currency: order.currency });
    } catch (_) {
        return err(500, 'Internal server error');
    }
};
