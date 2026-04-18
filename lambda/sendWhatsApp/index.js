// Lambda: HardwarePro-SendWhatsApp
// Sends WhatsApp e-bill to customer via Twilio WhatsApp API
const https = require('https');

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Content-Type': 'application/json'
};

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: CORS, body: '' };
    }

    try {
        const { phone, message } = JSON.parse(event.body || '{}');

        if (!phone || !message) {
            return {
                statusCode: 400,
                headers: CORS,
                body: JSON.stringify({ success: false, error: 'phone and message are required' })
            };
        }

        // Normalize phone to E.164 format (+91XXXXXXXXXX)
        let e164 = phone.replace(/\D/g, '');
        if (e164.length === 10) e164 = '91' + e164;
        if (!e164.startsWith('+')) e164 = '+' + e164;

        const SID   = process.env.TWILIO_SID;
        const TOKEN = process.env.TWILIO_TOKEN;
        const FROM  = process.env.TWILIO_FROM;   // e.g. whatsapp:+14155238886 (sandbox)

        const postData = new URLSearchParams({
            To:   'whatsapp:' + e164,
            From: FROM,
            Body: message
        }).toString();

        const credentials = Buffer.from(`${SID}:${TOKEN}`).toString('base64');

        const result = await new Promise((resolve, reject) => {
            const req = https.request(
                {
                    hostname: 'api.twilio.com',
                    path: `/2010-04-01/Accounts/${SID}/Messages.json`,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': 'Basic ' + credentials,
                        'Content-Length': Buffer.byteLength(postData)
                    }
                },
                (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve({ status: res.statusCode, body: data }));
                }
            );
            req.on('error', reject);
            req.write(postData);
            req.end();
        });

        const twilioResponse = JSON.parse(result.body);

        if (result.status === 201) {
            return {
                statusCode: 200,
                headers: CORS,
                body: JSON.stringify({ success: true, sid: twilioResponse.sid })
            };
        } else {
            console.error('Twilio error:', twilioResponse);
            return {
                statusCode: 502,
                headers: CORS,
                body: JSON.stringify({ success: false, error: twilioResponse.message || 'Twilio error' })
            };
        }

    } catch (err) {
        console.error('SendWhatsApp Lambda error:', err);
        return {
            statusCode: 500,
            headers: CORS,
            body: JSON.stringify({ success: false, error: err.message })
        };
    }
};
