/**
 * HardwarePro – Razorpay + AWS Integration Override
 * Load this file AFTER the main index.html <script> block.
 * Set useCloud = true in index.html AWS_CONFIG when deploying to AWS.
 */

// ── 1. Cloud Config ────────────────────────────────────────────────────────────
AWS_CONFIG.useCloud = true;
API_BASE = AWS_CONFIG.apiEndpoint;
AWS_CONFIG.apiBase = AWS_CONFIG.apiEndpoint;

// ── 2. Razorpay Payment Flow Override ─────────────────────────────────────────
window.startPaymentFlow = async function () {
    // Fix: strip commas for Indian locale numbers like 1,234.00
    const netAmountStr = document.getElementById('summNet').innerText.replace('₹', '').replace(/,/g, '').trim();
    const netAmount = parseFloat(netAmountStr);

    if (isNaN(netAmount)) {
        alert('❌ Could not read the payment amount. Please try again.');
        return;
    }

    if (netAmount <= 0) {
        finalizeTransaction('refund_or_zero', 'refund');
        return;
    }

    const btn = document.getElementById('btnCheckoutPay');
    if (!btn) return;
    const originalLabel = btn.innerText;
    btn.disabled = true;
    btn.innerText = '⏳ Creating Order…';

    try {
        const orderRes = await fetch(AWS_CONFIG.apiEndpoint + '/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: netAmount,
                receipt: activeBillId,
                userId: currentUser ? currentUser.username : 'guest',
                customerName: document.getElementById('custName').value || 'Walk-in Customer',
                customerPhone: document.getElementById('custPhone').value || 'N/A'
            })
        });

        if (!orderRes.ok) throw new Error('Server error: ' + orderRes.status);
        const orderData = await orderRes.json();
        if (orderData.error) throw new Error(orderData.error);

        if (!window.Razorpay) throw new Error('Razorpay library not loaded. Please refresh the page.');

        const options = {
            key: AWS_CONFIG.razorpayKeyId,
            amount: orderData.amount,
            currency: orderData.currency || 'INR',
            name: storeSettings.name || 'HardwarePro',
            description: 'Bill ID: ' + activeBillId,
            order_id: orderData.orderId || orderData.order_id || orderData.id,
            prefill: {
                name: document.getElementById('custName').value || '',
                contact: document.getElementById('custPhone').value || ''
            },
            theme: { color: '#f97316' },
            handler: async function (response) {
                btn.innerText = '⏳ Verifying…';
                try {
                    const confirmRes = await fetch(AWS_CONFIG.apiEndpoint + '/confirm-payment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            transactionId: activeBillId,
                            billId: activeBillId,
                            userId: currentUser ? currentUser.username : 'guest',
                            amount: netAmount,
                            status: 'PAID'
                        })
                    });
                    if (!confirmRes.ok) throw new Error('Confirm server error: ' + confirmRes.status);
                    const confirmData = await confirmRes.json();
                    if (confirmData.success) {
                        finalizeTransaction(response.razorpay_payment_id, 'online');
                    } else {
                        alert('⚠️ Payment received but server verification failed.\nPayment ID: ' + response.razorpay_payment_id + '\nPlease note this ID and contact support.');
                        btn.disabled = false;
                        btn.innerText = originalLabel;
                    }
                } catch (verifyErr) {
                    console.error('Payment verify error:', verifyErr);
                    alert('⚠️ Payment captured but could not be saved.\nPayment ID: ' + response.razorpay_payment_id + '\nPlease note this ID and contact support.');
                    btn.disabled = false;
                    btn.innerText = originalLabel;
                }
            },
            modal: {
                ondismiss: function () {
                    btn.disabled = false;
                    btn.innerText = originalLabel;
                }
            }
        };

        const rzp = new Razorpay(options);
        rzp.on('payment.failed', function (response) {
            console.error('Razorpay payment failed:', response.error);
            alert('❌ Payment Failed!\nReason: ' + (response.error.description || 'Unknown error'));
            btn.disabled = false;
            btn.innerText = originalLabel;
        });
        rzp.open();

    } catch (err) {
        console.error('Payment initiation error:', err);
        alert('❌ Could not start payment.\nError: ' + err.message);
        btn.disabled = false;
        btn.innerText = originalLabel;
    }
};

console.log('%c✅ HardwarePro Razorpay Integration Loaded', 'color:green;font-weight:bold;');