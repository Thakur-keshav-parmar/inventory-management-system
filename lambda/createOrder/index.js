// Lambda: HardwarePro-CreateOrder
// Calls Razorpay API to create an order and returns order_id to frontend
const https = require('https');

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
    const amountPaise = Math.round((body.amount || 0) * 100); // Razorpay needs paise
    const receipt = body.receipt || 'rcpt_' + Date.now();

    const credentials = Buffer.from(
      process.env.KEY_ID + ':' + process.env.KEY_SECRET
    ).toString('base64');

    const postData = JSON.stringify({
      amount: amountPaise,
      currency: 'INR',
      receipt: receipt
    });

    const order = await new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'api.razorpay.com',
          path: '/v1/orders',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + credentials,
            'Content-Length': Buffer.byteLength(postData)
          }
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => { resolve(JSON.parse(data)); });
        }
      );
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency
      })
    };
  } catch (err) {
    console.error('CreateOrder error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
