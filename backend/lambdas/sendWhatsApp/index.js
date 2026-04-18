// Lambda: HardwarePro-SendWhatsApp
const https = require('https');

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://d2ng4b4wuwlw95.cloudfront.net';
const MAX_BODY_BYTES = 4 * 1024; // 4 KB — messages should be small

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

    if (event.body && Buffer.byteLength(event.body, 'utf8') > MAX_BODY_BYTES)
        return err(413, 'Request too large');

    try {
        const { phone, message } = JSON.parse(event.body || '{}');

        if (!phone || !message) return err(400, 'phone and message are required');
        if (typeof phone !== 'string' || typeof message !== 'string') return err(400, 'Invalid input types');
        if (message.length > 1600) return err(400, 'Message too long');

        // Validate and normalize phone to E.164 (+91XXXXXXXXXX)
        let digits = phone.replace(/\D/g, '');
        if (digits.length === 10) digits = '91' + digits;
        if (digits.length !== 12 || !digits.startsWith('91')) return err(400, 'Invalid phone number');
        const e164 = '+' + digits;

        const SID   = process.env.TWILIO_SID;
        const TOKEN = process.env.TWILIO_TOKEN;
        const FROM  = process.env.TWILIO_FROM;

        if (!SID || !TOKEN || !FROM) return err(500, 'Messaging service not configured');

        const postData = new URLSearchParams({ To: 'whatsapp:' + e164, From: FROM, Body: message }).toString();
        const credentials = Buffer.from(`${SID}:${TOKEN}`).toString('base64');

        const result = await new Promise((resolve, reject) => {
            const req = https.request({
                hostname: 'api.twilio.com',
                path: `/2010-04-01/Accounts/${SID}/Messages.json`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + credentials,
                    'Content-Length': Buffer.byteLength(postData)
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ status: res.statusCode, body: data }));
            });
            req.on('error', reject);
            req.write(postData);
            req.end();
        });

        const parsed = JSON.parse(result.body);
        if (result.status === 201) return ok({ success: true, sid: parsed.sid });

        console.error('Twilio error status:', result.status);
        return err(502, 'Failed to send message');
    } catch (_) {
        return err(500, 'Internal server error');
    }
};
