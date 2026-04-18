// ─── AWS CONFIGURATION ────────────────────────────────────────────────
        const AWS_CONFIG = {
            useCloud: false,
            apiEndpoint: 'https://wzu3uazct6.execute-api.us-east-1.amazonaws.com/prod',
            apiBase: '',
            razorpayKeyId: 'rzp_test_SLrxDpCa8ctwrN'
        };

        // ─── API INTEGRATION ──────────────────────────────────────────────────
        var API_BASE = AWS_CONFIG.apiEndpoint;

        async function apiGet(path) {
            try {
                const res = await fetch(`${API_BASE}${path}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.json();
            } catch (err) {
                console.error(`API GET ${path} Error:`, err);
                return null;
            }
        }

        async function apiPost(path, body) {
            try {
                const res = await fetch(`${API_BASE}${path}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                return await res.json();
            } catch (err) {
                console.error(`API POST ${path} Error:`, err);
                return { success: false };
            }
        }

        async function apiDelete(path, body) {
            try {
                const res = await fetch(`${API_BASE}${path}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                return await res.json();
            } catch (err) {
                console.error(`API DELETE ${path} Error:`, err);
                return { success: false };
            }
        }

        // Image compression helper for DynamoDB (400KB limit)
        function compressImage(base64Str, maxWidth = 200) {
            return new Promise((resolve) => {
                if (!base64Str) return resolve('');
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const scale = Math.min(maxWidth / img.width, 1);
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
                img.src = base64Str;
            });
        }

        let users = [];
        let products = [];
        let cart = [];
        let transactions = [];
        let currentMode = 'retailer';
        let currentCat = 'All';
        let activeBillId = '';
        let currentUser = null;
        let compareChartInstance = null;
        let salesChartInstance = null;
        let profitChartInstance = null;
        let storeSettings = {};
        let heldBillData = null;
        let editingProductId = null;
        let targetResetUser = null;   // FIX: was undeclared
        let simulatedOTP = '';        // FIX: was undeclared

        // --- DELIVERY VARIABLES ---
        const vehicles = {
            bike: { name: "Bike", icon: "🛵", price: 8, maxKm: 25 },
            car:  { name: "Car",  icon: "🚗", price: 15, maxKm: null },
            van:  { name: "Van",  icon: "🚚", price: 25, maxKm: null }
        };
        let deliveryMap, storeMarker, customerMarker, routeLine;
        let selectedVehicle = 'bike', tripDist = 0, tripTime = 0, deliveryFee = 0;
        let deliveryRequired = false;
        let deliveryAddress = "";

        // --- AUTH ---
        function showAuthMsg(msg, isError = true) {
            const el = document.getElementById('authMessage');
            el.style.display = msg ? 'block' : 'none';
            el.style.color = isError ? 'red' : 'green';
            el.innerText = msg;
        }

        function toggleAuthView(view) {
            document.getElementById('viewLogin').style.display = 'none';
            document.getElementById('viewForgot').style.display = 'none';
            document.getElementById('viewOTP').style.display = 'none';
            document.getElementById('viewReset').style.display = 'none';
            document.getElementById('authMessage').style.display = 'none';
            if (view === 'login') document.getElementById('viewLogin').style.display = 'flex';
            if (view === 'forgot') document.getElementById('viewForgot').style.display = 'flex';
            if (view === 'otp') document.getElementById('viewOTP').style.display = 'flex';
            if (view === 'reset') document.getElementById('viewReset').style.display = 'flex';
        }

        async function handleLogin() {
            const u = document.getElementById('loginUser').value.trim();
            const p = document.getElementById('loginPass').value;  // FIX: don't trim password
            if (!u || !p) { showAuthMsg("Please enter username and password."); return; }
            currentUser = users.find(x => x.username === u && x.password === p);
            if (currentUser) {
                document.getElementById('loginScreen').style.display = 'none';
                document.getElementById('loggedUserName').innerText = currentUser.username;
                showAuthMsg("", false);
                setupUIForRole();
                updateNotifications();
            } else {
                showAuthMsg("Invalid credentials. Please try again.");
            }
        }

        function handleLogout() { location.reload(); }

        function requestOTP() {
            const u = document.getElementById('forgotUsername').value.trim();
            const ph = document.getElementById('forgotPhone').value.trim();
            if (!u || !ph) return showAuthMsg("Please enter both username and phone number.");
            if (!/^\d{10}$/.test(ph)) return showAuthMsg("Phone number must be exactly 10 digits.");
            targetResetUser = users.find(x => x.username === u && x.phone === ph);
            if (!targetResetUser) return showAuthMsg("No account found with that username and phone number.");
            simulatedOTP = Math.floor(1000 + Math.random() * 9000).toString();
            alert(`[SIMULATED SMS to ${targetResetUser.phone}]\nOTP: ${simulatedOTP}`);
            document.getElementById('otpPhoneDisplay').innerText = "******" + targetResetUser.phone.slice(-4);
            showAuthMsg("", false); toggleAuthView('otp');
        }

        function verifyOTP() {
            const entered = document.getElementById('otpInput').value.trim();
            if (entered === simulatedOTP) { showAuthMsg("", false); toggleAuthView('reset'); }
            else { showAuthMsg("Invalid OTP."); }
        }

        async function saveNewPassword() {
            const p1 = document.getElementById('newPass1').value;
            const p2 = document.getElementById('newPass2').value;
            if (!p1 || p1 !== p2) return showAuthMsg("Passwords do not match or empty.");
            if (p1.length < 4) return showAuthMsg("Password must be at least 4 characters long.");
            targetResetUser.password = p1;
            await apiPost('/users', targetResetUser);   // FIX: persist to DB
            alert("Password updated successfully!");
            toggleAuthView('login');
        }

        function setupUIForRole() {
            const bShop = document.getElementById('btnRetailer');
            const bRet  = document.getElementById('btnReturn');
            const bAdm  = document.getElementById('btnAdmin');
            const nBell = document.getElementById('notificationTrigger');
            bShop.style.display = 'block';
            bRet.style.display  = (['admin', 'staff', 'manager'].includes(currentUser.role)) ? 'block' : 'none';
            document.getElementById('btnDelivery').style.display = (['admin', 'manager', 'delivery'].includes(currentUser.role)) ? 'block' : 'none';
            bAdm.style.display  = (['admin', 'manager'].includes(currentUser.role)) ? 'block' : 'none';
            nBell.style.display = (['admin', 'manager', 'staff', 'delivery'].includes(currentUser.role)) ? 'block' : 'none';
            if (currentUser.role === 'customer') {
                document.getElementById('customerBanner').style.display = 'flex';
                document.getElementById('customerStoreName').innerText = storeSettings.name;
                document.getElementById('customerCall').href = `tel:${storeSettings.phone}`;
            } else { document.getElementById('customerBanner').style.display = 'none'; }
            if (['admin', 'manager'].includes(currentUser.role)) {
                const isAdmin = currentUser.role === 'admin';
                document.getElementById('tab-btn-staff').style.display    = isAdmin ? 'block' : 'none';
                document.getElementById('tab-btn-analytics').style.display = isAdmin ? 'block' : 'none';
                document.getElementById('tab-btn-settings').style.display  = isAdmin ? 'block' : 'none';
                document.getElementById('npCost').style.display            = isAdmin ? 'block' : 'none';
                document.getElementById('bulkMarginPanel').style.display   = isAdmin ? 'block' : 'none';
                document.getElementById('tab-btn-logs').style.display = 'block';
            }
            switchMode('retailer');
        }

        // --- NOTIFICATIONS ---
        function updateNotifications() {
            if (!currentUser || !['admin', 'manager', 'staff'].includes(currentUser.role)) return;
            const lowStockItems = products.filter(p => p.stock < 21);
            document.getElementById('notifCount').innerText = lowStockItems.length;
            const list = document.getElementById('notifList');
            list.innerHTML = lowStockItems.length > 0
                ? lowStockItems.map(p => `<div class="notif-item"><span><b>${p.name}</b></span><span style="color:red; font-weight:bold;">${p.stock} left</span></div>`).join('')
                : `<div style="padding:15px; text-align:center; color:#999; font-size:1.1rem;">All stock levels are optimal.</div>`;
        }
        function toggleNotifications() {
            const dp = document.getElementById('notifDropdown');
            dp.style.display = dp.style.display === 'none' ? 'block' : 'none';
        }

        // --- CORE UI ---
        function renderCategories() {
            const list = document.getElementById('categoryList');
            const dl   = document.getElementById('catOptions');
            const uniqueCats = ['All', ...new Set(products.map(p => p.category))].sort();
            list.innerHTML = uniqueCats.map(c => `<button class="category-btn ${c === currentCat ? 'active' : ''}" onclick="setCat('${c}')">${c}</button>`).join('');
            dl.innerHTML   = uniqueCats.filter(c => c !== 'All').map(c => `<option value="${c}">`).join('');
        }
        function setCat(c) { currentCat = c; renderCategories(); renderGrid(); closeAll(); }

        function renderGrid() {
            if (currentMode === 'admin') return;
            const grid = document.getElementById('productGrid');
            grid.innerHTML = '';
            const visibleProducts = products.filter(p => p.stock > 0);
            const filtered = currentCat === 'All' ? visibleProducts : visibleProducts.filter(p => p.category === currentCat);
            if (filtered.length === 0) { grid.innerHTML = '<div style="padding:20px; color:#999; font-size:1.1rem;">No products found. Add items in Admin panel.</div>'; return; }
            filtered.forEach(p => {
                const pid = p.productId || p.id;
                const modeType = currentMode === 'retailer' ? 'buy' : 'return';
                const cartItem = cart.find(x => (x.productId == pid || x.id == pid) && x.type === modeType);
                const qty = cartItem ? cartItem.qty : 0;
                let btnHtml = '';
                if (qty === 0) {
                    const label   = currentMode === 'retailer' ? 'Add to Cart' : 'Return Item';
                    const bgClass = currentMode === 'retailer' ? 'btn-buy' : 'btn-return-item';
                    const disabled = (currentMode === 'retailer' && p.stock === 0) ? 'disabled style="background:#ccc"' : '';
                    btnHtml = `<button class="action-btn ${bgClass}" onclick="updateCart('${pid}', 1)" ${disabled}>${currentMode === 'retailer' && p.stock === 0 ? 'Sold Out' : label}</button>`;
                } else {
                    btnHtml = `<div class="qty-wrapper"><button class="qty-btn" onclick="updateCart('${pid}', -1)">-</button><input type="number" class="manual-input" value="${qty}" onchange="manualInput('${pid}', this.value)"><button class="qty-btn" onclick="updateCart('${pid}', 1)">+</button></div>`;
                }
                grid.innerHTML += `<div class="card" style="border-color:${currentMode === 'return' ? 'var(--return-color)' : '#e2e8f0'}"><img src="${p.image}" class="card-img"><div class="card-body"><div class="card-cat">${p.category}</div><div class="card-title">${p.name}</div><div class="card-price">₹${p.price}</div><div style="font-size:0.9rem; color:${p.stock < 21 ? 'red' : 'green'}">Stock: ${p.stock}</div>${btnHtml}</div></div>`;
            });
        }

        // --- CART LOGIC ---
        function updateCart(id, change) {
            const type = currentMode === 'retailer' ? 'buy' : 'return';
            const p = products.find(x => x.productId == id || x.id === id);
            if (!p) return;
            // FIX: operator precedence — added parentheses around OR condition
            let item = cart.find(x => (x.productId == id || x.id == id) && x.type === type);
            let newQty = (item ? item.qty : 0) + change;
            if (type === 'buy' && newQty > p.stock) return alert("Stock Limit Reached");
            setCartItem(id, newQty, type);
        }

        function manualInput(id, val) {
            const type = currentMode === 'retailer' ? 'buy' : 'return';
            const p = products.find(x => x.productId == id || x.id === id);
            if (!p) return;
            let qty = parseInt(val, 10);
            if (isNaN(qty) || qty < 0) qty = 0;
            if (type === 'buy' && qty > p.stock) { alert("Cannot exceed available stock of " + p.stock); qty = p.stock; }
            setCartItem(id, qty, type);
        }

        function setCartItem(id, qty, type) {
            if (qty <= 0) cart = cart.filter(x => !((x.productId == id || x.id == id) && x.type === type));
            else {
                let item = cart.find(x => (x.productId == id || x.id == id) && x.type === type);
                if (item) item.qty = qty; else cart.push({ productId: id, id: id, qty, type });
            }
            renderGrid(); renderCartSide();
        }

        function renderCartSide() {
            const container = document.getElementById('cartItems');
            let buyTotal = 0, returnTotal = 0;
            container.innerHTML = cart.length ? '' : '<p style="text-align:center;color:#ccc;margin-top:20px;font-size:1.1rem;">Cart Empty</p>';
            cart.forEach(item => {
                const pid = item.productId || item.id;
                const p = products.find(x => x.productId == pid || x.id == pid);
                if (!p) return; // FIX: null guard for deleted products
                const line = p.price * item.qty;
                if (item.type === 'buy') buyTotal += line; else returnTotal += line;
                const sign = item.type === 'return' ? '-' : '';
                container.innerHTML += `<div class="cart-item-row ${item.type === 'buy' ? 'type-buy' : 'type-return'}"><div style="flex:1"><div style="font-weight:600; font-size:1rem;">${item.type === 'return' ? '(RET) ' : ''} ${p.name}</div><div style="font-size:0.9rem; opacity:0.8">${item.qty} x ₹${p.price}</div></div><div style="text-align:right; font-size:1rem;"><div>${sign}₹${line.toFixed(2)}</div><button onclick="setCartItem('${pid}', 0, '${item.type}')" style="color:red;border:none;background:none;cursor:pointer;font-size:1.4rem;">×</button></div></div>`;
            });
            const fee = returnTotal * 0.02;
            let subtotal = buyTotal - (returnTotal - fee);
            let cgstAmount = subtotal > 0 ? subtotal * (storeSettings.cgstRate / 100) : 0;
            let sgstAmount = subtotal > 0 ? subtotal * (storeSettings.sgstRate / 100) : 0;
            let totalGST = cgstAmount + sgstAmount;
            const net = subtotal + totalGST + deliveryFee;
            document.getElementById('summBuy').innerText      = `₹${buyTotal.toFixed(2)}`;
            document.getElementById('summReturn').innerText   = `-₹${returnTotal.toFixed(2)}`;
            document.getElementById('summFee').innerText      = `+₹${fee.toFixed(2)}`;
            document.getElementById('cgstLabelRate').innerText = storeSettings.cgstRate;
            document.getElementById('summCGST').innerText     = `+₹${cgstAmount.toFixed(2)}`;
            document.getElementById('sgstLabelRate').innerText = storeSettings.sgstRate;
            document.getElementById('summSGST').innerText     = `+₹${sgstAmount.toFixed(2)}`;
            document.getElementById('summTotalGST').innerText = `+₹${totalGST.toFixed(2)}`;
            document.getElementById('summDelivery').innerText = `+₹${deliveryFee.toFixed(2)}`;
            document.getElementById('summNet').innerText      = `₹${Math.abs(net).toFixed(2)}`;
            document.getElementById('navTotal').innerText     = `₹${net.toFixed(2)}`;
            const btn = document.getElementById('checkoutBtn');
            const label = document.getElementById('netLabel');
            if (net > 0)       { label.innerText = "Net Payable:";    btn.style.background = "var(--dark)"; }
            else if (net < 0)  { label.innerText = "Refund Customer:"; btn.style.background = "var(--return-color)"; }
            else               { label.innerText = "Net Payable:";    btn.style.background = "#64748b"; }
            document.getElementById('cartCount').innerText = cart.reduce((a, b) => a + b.qty, 0);
        }

        // --- CHECKOUT & HOLD BILL ---
        function holdBill() {
            if (cart.length === 0) return alert("Cart is empty");
            if (heldBillData) return alert("A bill is already on hold. Please restore it first.");
            heldBillData = { cart: JSON.parse(JSON.stringify(cart)), custName: document.getElementById('custName').value, custPhone: document.getElementById('custPhone').value };
            cart = []; document.getElementById('custName').value = ''; document.getElementById('custPhone').value = '';
            renderCartSide(); renderGrid();
            document.getElementById('holdBtn').style.display = 'none'; document.getElementById('restoreBtn').style.display = 'block';
        }

        function restoreBill() {
            if (!heldBillData) return;
            cart = heldBillData.cart; document.getElementById('custName').value = heldBillData.custName; document.getElementById('custPhone').value = heldBillData.custPhone;
            heldBillData = null; renderCartSide(); renderGrid();
            document.getElementById('holdBtn').style.display = 'block'; document.getElementById('restoreBtn').style.display = 'none';
        }

        function openReceiptModal(pastTx = null) {
            let isPast = pastTx !== null;
            let targetCart = isPast ? pastTx.items : cart;
            if (!isPast && targetCart.length === 0) return alert("Cart is empty");
            let bId = isPast ? pastTx.id : 'BILL-' + Math.floor(100000 + Math.random() * 900000);
            if (!isPast) activeBillId = bId;
            document.getElementById('recStoreName').innerText = storeSettings.name;
            document.getElementById('recStoreAddressPhone').innerText = `📍 ${storeSettings.address} | 📞 ${storeSettings.phone}`;
            let cName = isPast ? pastTx.customerName : (document.getElementById('custName').value || 'Walk-in Customer');
            let cPhone = isPast ? pastTx.customerPhone : document.getElementById('custPhone').value;
            let timestamp = isPast ? new Date(pastTx.date).toLocaleString() : new Date().toLocaleString();
            let html = `<div class="bill-id">ID: ${bId}</div><div style="font-size:0.75rem; margin-bottom:11px; border-bottom:1px solid #eee; padding-bottom:6px;"><b>Date:</b> ${timestamp}<br><b>Customer:</b> ${cName} ${cPhone ? '| <b>Ph:</b> ' + cPhone : ''}</div>`;
            let buyT = 0, retT = 0;
            targetCart.forEach(item => {
                const p = products.find(x => x.productId == item.id || x.id === item.id) || { name: "Unknown Item", price: 0 };
                const t = p.price * item.qty;
                if (item.type === 'buy') buyT += t; else retT += t;
                html += `<div class="receipt-line" style="color:${item.type === 'return' ? 'red' : 'black'}"><span>${item.type === 'return' ? '(RET) ' : ''}${p.name} (x${item.qty})</span><span>${item.type === 'return' ? '-' : ''}₹${t.toFixed(2)}</span></div>`;
            });
            let subtotal = buyT - retT;
            let cgstAmount = subtotal > 0 ? subtotal * (storeSettings.cgstRate / 100) : 0;
            let sgstAmount = subtotal > 0 ? subtotal * (storeSettings.sgstRate / 100) : 0;
            let pastDeliveryFee = 0;
            if (isPast && pastTx.deliveryFee) pastDeliveryFee = pastTx.deliveryFee;
            if (!isPast && deliveryFee) pastDeliveryFee = deliveryFee;
            const net = subtotal + cgstAmount + sgstAmount + pastDeliveryFee;
            html += `<div style="border-top:2px solid #000; margin-top:11px; padding-top:9px; font-weight:bold;"><div class="receipt-line"><span>Items Total:</span><span>₹${subtotal.toFixed(2)}</span></div><div class="receipt-line"><span>CGST (${storeSettings.cgstRate}%):</span><span>₹${cgstAmount.toFixed(2)}</span></div><div class="receipt-line"><span>SGST (${storeSettings.sgstRate}%):</span><span>₹${sgstAmount.toFixed(2)}</span></div><div class="receipt-line" style="border-bottom:1px dashed #ccc; padding-bottom:6px;"><span>Total GST:</span><span>₹${(cgstAmount + sgstAmount).toFixed(2)}</span></div>${pastDeliveryFee > 0 ? `<div class="receipt-line" style="border-bottom:1px dashed #ccc; padding-bottom:6px; color:var(--delivery);"><span>Delivery Fee:</span><span>₹${pastDeliveryFee.toFixed(2)}</span></div>` : ''}<div class="receipt-line" style="font-size:1.15rem; border:none; margin-top:9px;"><span>TOTAL:</span><span>₹${net.toFixed(2)}</span></div></div>`;
            document.getElementById('receiptContent').innerHTML = html;
            document.getElementById('btnCheckoutPay').style.display = isPast ? 'none' : 'flex';
            document.getElementById('btnCashPay').style.display = isPast ? 'none' : 'flex';
            document.getElementById('btnPrintOnly').style.display = isPast ? 'flex' : 'none';
            document.getElementById('custDetailsSection').style.display = isPast ? 'none' : 'block';
            document.getElementById('receiptModal').style.display = 'flex';
            document.getElementById('overlay').style.zIndex = '500';
            document.getElementById('overlay').classList.add('active');
        }

        async function startPaymentFlow() {
            // FIX: strip commas for Indian locale numbers e.g. 1,234.00
            const netText = document.getElementById('summNet').innerText.replace('₹', '').replace(/,/g, '').trim();
            let netAmount = parseFloat(netText);
            if (isNaN(netAmount)) return alert("Could not read payment amount. Please try again.");
            if (netAmount <= 0) { finalizeTransaction("refund_or_zero", "refund"); return; }
            if (!AWS_CONFIG.useCloud || !AWS_CONFIG.apiBase) {
                if (confirm(`[SIMULATION MODE]\n\nSimulate successful payment of ₹${netAmount}?`)) {
                    finalizeTransaction("sim_pay_" + Math.floor(Math.random() * 1000000), "simulated");
                }
                return;
            }
            try {
                const amountInPaise = Math.round(netAmount * 100);
                const userId = currentUser ? currentUser.username : "guest";
                const customerName = document.getElementById('custName').value || 'Walk-in Customer';
                const customerPhone = document.getElementById('custPhone').value || 'N/A';
                const orderData = await createOrderInBackend({ userId, amount: amountInPaise, customerName, customerPhone, billId: activeBillId });
                await openRazorpayCheckout({ order: orderData.order, userId, amountInPaise, customerName, customerPhone });
            } catch (err) {
                console.error("Payment flow error:", err);
                alert("Unable to start payment. Please try again.");
            }
        }

        async function createOrderInBackend(payload) {
            const res = await fetch(`${AWS_CONFIG.apiBase}/create-order`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            if (!res.ok) { const txt = await res.text(); throw new Error(`create-order failed: ${res.status} ${txt}`); }
            return res.json();
        }

        async function confirmPaymentInBackend(payload) {
            const res = await fetch(`${AWS_CONFIG.apiBase}/confirm-payment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            if (!res.ok) { const txt = await res.text(); throw new Error(`confirm-payment failed: ${res.status} ${txt}`); }
            return res.json();
        }

        async function openRazorpayCheckout({ order, userId, amountInPaise, customerName, customerPhone }) {
            if (!window.Razorpay) { alert("Payment library not loaded. Please refresh the page."); return; }
            return new Promise((resolve, reject) => {
                const options = {
                    key: AWS_CONFIG.razorpayKeyId, amount: order.amount, currency: order.currency,
                    name: storeSettings.name || "HardwarePro POS", description: "Bill Payment", order_id: order.id,
                    prefill: { name: customerName, email: "customer@hardwarepro.in", contact: customerPhone !== "N/A" ? customerPhone : "9999999999" },
                    theme: { color: "#f97316" },
                    handler: async function (response) {
                        try {
                            const confirmResult = await confirmPaymentInBackend({ userId, amount: amountInPaise, status: "PAID", razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature, customerName, customerPhone, billId: activeBillId });
                            if (confirmResult.success) { finalizeTransaction(response.razorpay_payment_id, 'online'); alert("Payment successful and recorded."); resolve(); }
                            else { alert("Payment could not be verified. Please contact support."); reject(new Error("Signature verification failed")); }
                        } catch (err) { console.error("Error confirming payment:", err); alert("Payment verification failed. Please try again."); reject(err); }
                    },
                    modal: { ondismiss: function () { alert("Payment popup was closed. No amount was charged."); reject(new Error("Payment cancelled by user")); } }
                };
                const rzp = new window.Razorpay(options);
                rzp.on("payment.failed", function (response) { alert("Payment failed: " + (response.error.description || "Unknown error")); reject(new Error("Razorpay payment failed")); });
                rzp.open();
            });
        }

        function sendWhatsAppReceipt(tx) {
            try {
                const store = storeSettings.name || "HardwarePro";
                const items = tx.items.map(i => {
                    const p = products.find(x => x.productId == i.id || x.id == i.id) || { name: "Item", price: 0 };
                    return `${i.type === "return" ? "(RET) " : ""}${p.name} x${i.qty} = Rs.${(p.price * i.qty).toFixed(2)}`;
                }).join("%0A");
                const msg = `*${store} - Receipt*%0A%0ABill ID: ${tx.id}%0ADate: ${new Date(tx.date).toLocaleString()}%0A%0A${items}%0A%0A*Total: Rs.${tx.total}*%0APayment: ${tx.paymentMethod === "online" ? "Online (Razorpay)" : "Cash"}%0A%0AThank you for shopping!`;
                // FIX: prevent double 91 prefix
                let phone = tx.customerPhone.replace(/\D/g, "");
                if (!phone.startsWith("91") || phone.length === 10) phone = "91" + phone.replace(/^91/, '');
                window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
            } catch(e) { console.warn("WhatsApp receipt error", e); }
        }

        async function payByCash() {
            window.print();
            await finalizeTransaction("cash", "cash");
        }

        async function finalizeTransaction(paymentRefId, paymentMethod) {
            let newTransaction = {
                billId: activeBillId, id: activeBillId, date: new Date().toISOString(),
                items: JSON.parse(JSON.stringify(cart)),
                // FIX: strip commas before parseFloat
                total: parseFloat(document.getElementById('summNet').innerText.replace('₹', '').replace(/,/g, '')),
                customerName: document.getElementById('custName').value || 'Walk-in Customer',
                customerPhone: document.getElementById('custPhone').value || 'N/A',
                billedBy: currentUser ? currentUser.username : "guest",
                paymentRefId: paymentRefId || "cash",
                paymentMethod: paymentMethod || "cash",
                deliveryRequired, deliveryFee, deliveryDistance: tripDist, deliveryAddress,
                deliveryStatus: deliveryRequired ? 'processing' : 'none'
            };
            transactions.push(newTransaction);
            let productUpdates = [];
            cart.forEach(item => {
                const p = products.find(x => x.productId == item.id || x.id === item.id);
                // FIX: proper if/else block instead of ambiguous one-liner
                if (p) {
                    if (item.type === 'buy') p.stock -= item.qty; else p.stock += item.qty;
                    p.productId = p.productId || p.id;
                    productUpdates.push(p);
                }
            });
            cart = [];
            document.getElementById('custName').value = ''; document.getElementById('custPhone').value = '';
            removeDelivery();
            if (paymentMethod === 'online') window.print();
            closeModal(); closeAll(); renderGrid(); renderCartSide(); updateNotifications();
            if (currentMode === 'admin') { renderLogsAndCustomers(); renderChart('day'); }
            if (newTransaction.customerPhone && newTransaction.customerPhone !== 'N/A') sendWhatsAppReceipt(newTransaction);
            if (AWS_CONFIG.useCloud) {
                await apiPost('/bills', newTransaction);
                for (let p of productUpdates) await apiPost('/products', p);
            }
        }

        // --- CAMERA SCANNER ---
        let html5QrcodeScanner = null, scanTarget = '';
        function openCameraModal(target) {
            scanTarget = target;
            document.getElementById('cameraModal').style.display = 'flex';
            document.getElementById('overlay').style.zIndex = '500';
            document.getElementById('overlay').classList.add('active');
            html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 150 } }, false);
            html5QrcodeScanner.render(onScanSuccess, onScanFailure);
        }
        function closeCameraModal() {
            if (html5QrcodeScanner) { html5QrcodeScanner.clear(); }
            document.getElementById('cameraModal').style.display = 'none';
            document.getElementById('overlay').style.zIndex = '200';
            document.getElementById('overlay').classList.remove('active');
        }
        function onScanSuccess(decodedText) {
            closeCameraModal();
            if (scanTarget === 'cart') {
                const product = products.find(p => p.barcode === decodedText || p.id.toString() === decodedText);
                if (product) { updateCart(product.productId || product.id, 1); alert(`Added ${product.name} to cart.`); }
                else { alert(`Product barcode not found: ${decodedText}`); }
            } else if (scanTarget === 'admin') {
                if (document.getElementById('npBarcode')) document.getElementById('npBarcode').value = decodedText;
            }
        }
        function onScanFailure() {}

        // --- ADMIN PORTAL ---
        function switchAdminTab(tabName) {
            document.querySelectorAll('.admin-section').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.admin-tabs .chart-tab').forEach(el => el.classList.remove('active'));
            const section = document.getElementById('tab-' + tabName); if (section) section.classList.add('active');
            const tabBtn = document.getElementById('tab-btn-' + tabName); if (tabBtn) tabBtn.classList.add('active');
            if (tabName === 'staff') renderStaff();
            if (tabName === 'analytics') renderChart('day');
            if (tabName === 'logs') renderLogsAndCustomers();
        }

        function toggleAccordion(panelId, iconId) {
            const panel = document.getElementById(panelId), icon = document.getElementById(iconId);
            if (panel.style.display === 'none') { panel.style.display = 'block'; icon.innerText = '▼ (Click to Close)'; }
            else { panel.style.display = 'none'; icon.innerText = '▼ (Click to Open)'; }
        }

        function filterLogs() {
            let filter = document.getElementById('searchLogs').value.toLowerCase();
            document.querySelectorAll('#logsTableBody tr').forEach(row => { row.style.display = row.innerText.toLowerCase().includes(filter) ? '' : 'none'; });
        }
        function filterCustomers() {
            let filter = document.getElementById('searchCustomers').value.toLowerCase();
            document.querySelectorAll('#customersTableBody tr').forEach(row => { row.style.display = row.innerText.toLowerCase().includes(filter) ? '' : 'none'; });
        }

        function viewCustomerHistory(key) {
            const custTxs = transactions.filter(t => (t.customerPhone !== 'N/A' ? t.customerPhone : t.customerName) === key);
            if (custTxs.length === 0) return;
            let html = `<div style="margin-bottom:11px; font-size:0.9rem; border-bottom:2px solid #eee; padding-bottom:8px;"><b>Customer:</b> ${custTxs[0].customerName}<br><b>Phone:</b> ${custTxs[0].customerPhone}</div>`;
            custTxs.sort((a, b) => new Date(b.date) - new Date(a.date));
            custTxs.forEach(t => {
                const d = new Date(t.date).toLocaleString();
                let itemsHtml = t.items.map(item => { const p = products.find(x => x.productId == item.id || x.id === item.id) || { name: "Unknown Item" }; return `<li>${item.type === 'return' ? '<span style="color:red; font-weight:bold;">(RET)</span> ' : ''}${p.name} <span style="color:#666;">(x${item.qty})</span></li>`; }).join('');
                html += `<div style="border:1px solid #cbd5e1; border-radius:6px; padding:15px; margin-bottom:15px; background:#f8fafc;"><div style="display:flex; justify-content:space-between; border-bottom:1px dashed #cbd5e1; padding-bottom:9px; margin-bottom:9px;"><span style="font-weight:bold; font-size:0.9rem;">${d}</span><span style="font-family:monospace; color:#64748b; font-size:0.85rem;">${t.id}</span></div><ul style="margin:0; padding-left:20px; font-size:0.85rem; color:#333;">${itemsHtml}</ul><div style="text-align:right; font-weight:bold; margin-top:11px; font-size:1.05rem; color:var(--primary-dark);">Total: ₹${t.total}</div></div>`;
            });
            document.getElementById('customerHistoryContent').innerHTML = html;
            document.getElementById('customerHistoryModal').style.display = 'flex';
            document.getElementById('overlay').style.zIndex = '700';
            document.getElementById('overlay').classList.add('active');
        }

        function closeCustomerHistoryModal() {
            document.getElementById('customerHistoryModal').style.display = 'none';
            if (document.getElementById('receiptModal').style.display === 'none') document.getElementById('overlay').classList.remove('active');
            document.getElementById('overlay').style.zIndex = '200';
        }

        function renderLogsAndCustomers() {
            // FIX: clear stale search on re-render
            const sl = document.getElementById('searchLogs'), sc = document.getElementById('searchCustomers');
            if (sl) sl.value = ''; if (sc) sc.value = '';
            const logsTbody = document.getElementById('logsTableBody');
            if (transactions.length === 0) {
                logsTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#999; padding:20px;">No transactions logged yet.</td></tr>`;
            } else {
                const sortedTx = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
                logsTbody.innerHTML = sortedTx.map(t => {
                    const d = new Date(t.date).toLocaleString();
                    return `<tr><td style="font-family:monospace;">${t.id}</td><td>${d}</td><td><span style="background:#eee; padding:4px 8px; border-radius:4px;">${t.billedBy}</span></td><td>${t.customerName}</td><td>${t.customerPhone}</td><td style="font-weight:bold;">₹${t.total}</td><td><span style="background:${t.paymentMethod==='online'?'#3b82f6':'#22c55e'};color:white;padding:3px 8px;border-radius:12px;font-size:0.85rem;font-weight:bold;">${t.paymentMethod==='online'?'Online':'Cash'}</span></td><td><button onclick="viewPastBill('${t.id}')" class="action-btn" style="background:var(--dark); padding:6px 12px; width:auto; font-size:0.9rem;">🧾 Details</button></td></tr>`;
                }).join('');
            }
            let customerMap = {};
            transactions.forEach(t => {
                if (t.customerName === 'Walk-in Customer' && (t.customerPhone === 'N/A' || !t.customerPhone)) return;
                let key = t.customerPhone !== 'N/A' ? t.customerPhone : t.customerName;
                if (!customerMap[key]) customerMap[key] = { name: t.customerName, phone: t.customerPhone, visits: 0, key };
                customerMap[key].visits += 1;
            });
            const custTbody = document.getElementById('customersTableBody');
            const uniqueCusts = Object.values(customerMap);
            custTbody.innerHTML = uniqueCusts.length === 0
                ? `<tr><td colspan="4" style="text-align:center; color:#999; padding:20px;">No customer data available yet.</td></tr>`
                : uniqueCusts.map(c => `<tr><td><b>${c.name}</b></td><td>${c.phone}</td><td><span style="background:var(--success); color:white; padding:4px 10px; border-radius:12px; font-weight:bold;">${c.visits}</span></td><td><button onclick="viewCustomerHistory('${c.key}')" class="action-btn" style="background:var(--primary); padding:6px 12px; width:auto; font-size:0.9rem;">🔍 View History</button></td></tr>`).join('');
            filterLogs(); filterCustomers();
        }

        // --- EXPORT ---
        function handleExport(reportType) {
            const startStr = document.getElementById('exportStartDate').value;
            const endStr   = document.getElementById('exportEndDate').value;
            const format   = document.getElementById('exportFormat').value;
            let data = null, filename = "";
            if (reportType === 'sales')      { data = getSalesData(startStr, endStr);      filename = "Sales_Report"; }
            else if (reportType === 'stock_left')  { data = getStockLeftData();                   filename = "Stock_Left_Report"; }
            else if (reportType === 'stock_sold')  { data = getStockSoldData(startStr, endStr);    filename = "Stock_Sold_Report"; }
            else if (reportType === 'net_profit')  { data = getNetProfitData(startStr, endStr);    filename = "Detailed_Net_Profit_Report"; }
            if (!data || data.rows.length === 0) return alert("No data available for this report.");
            if (format === 'csv') {
                let csv = "data:text/csv;charset=utf-8," + data.headers.join(",") + "\n";
                data.rows.forEach(row => { csv += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",") + "\n"; });
                const link = document.createElement("a"); link.setAttribute("href", encodeURI(csv)); link.setAttribute("download", filename + ".csv");
                document.body.appendChild(link); link.click(); document.body.removeChild(link);
            } else if (format === 'pdf') {
                if (!window.jspdf) return alert("PDF library not loaded. Please use CSV instead.");
                const { jsPDF } = window.jspdf; const doc = new jsPDF('landscape');
                doc.text(filename.replace(/_/g, ' '), 14, 15);
                doc.autoTable({ startY: 20, head: [data.headers], body: data.rows, theme: 'grid', styles: { fontSize: 9 } });
                doc.save(filename + ".pdf");
            }
        }

        function getSalesData(startStr, endStr) {
            let rows = [], totalSale = 0, totalProfit = 0;
            transactions.forEach(t => {
                if ((!startStr || !endStr) || (new Date(t.date) >= new Date(startStr) && new Date(t.date) <= new Date(endStr))) {
                    let productsStr = t.items.map(i => { const p = products.find(x => x.productId == i.id || x.id === i.id) || { name: "Unknown" }; return `${p.name} (x${i.qty})`; }).join(" | ");
                    let saleAmount = 0, costAmount = 0;
                    t.items.forEach(i => { const p = products.find(x => x.productId == i.id || x.id === i.id) || { cost: 0, price: 0 }; let m = i.type === 'buy' ? 1 : -1; saleAmount += p.price * i.qty * m; costAmount += p.cost * i.qty * m; });
                    let netProfit = saleAmount - costAmount; totalSale += saleAmount; totalProfit += netProfit;
                    rows.push([t.id, new Date(t.date).toLocaleString(), productsStr, saleAmount.toFixed(2), netProfit.toFixed(2)]);
                }
            });
            rows.push(["TOTALS", "", "", totalSale.toFixed(2), totalProfit.toFixed(2)]);
            return { headers: ["Bill No", "Date", "Products Sold", "Sale Amount", "Net Profit"], rows };
        }
        function getStockLeftData() {
            let rows = [], grandTotal = 0;
            products.forEach(p => { const tc = p.stock * p.cost; grandTotal += tc; rows.push([p.name, p.stock, p.cost.toFixed(2), tc.toFixed(2)]); });
            rows.push(["GRAND TOTAL", "", "", grandTotal.toFixed(2)]);
            return { headers: ["Stock Item", "Current Quantity", "Purchase Price (Cost)", "Total Capital Tied"], rows };
        }
        function getStockSoldData(startStr, endStr) {
            let soldMap = {};
            transactions.forEach(t => {
                if ((!startStr || !endStr) || (new Date(t.date) >= new Date(startStr) && new Date(t.date) <= new Date(endStr))) {
                    t.items.forEach(i => { const p = products.find(x => x.productId == i.id || x.id === i.id) || { name: "Unknown", cost: 0, price: 0 }; let m = i.type === 'buy' ? 1 : -1; if (!soldMap[p.name]) soldMap[p.name] = { qty: 0, revenue: 0, cost: 0 }; soldMap[p.name].qty += i.qty * m; soldMap[p.name].revenue += p.price * i.qty * m; soldMap[p.name].cost += p.cost * i.qty * m; });
                }
            });
            let rows = [], tQ = 0, tR = 0, tC = 0, tP = 0;
            for (let name in soldMap) { let s = soldMap[name]; tQ += s.qty; tR += s.revenue; tC += s.cost; tP += (s.revenue - s.cost); rows.push([name, s.qty, s.revenue.toFixed(2), s.cost.toFixed(2), (s.revenue - s.cost).toFixed(2)]); }
            rows.push(["TOTALS", tQ, tR.toFixed(2), tC.toFixed(2), tP.toFixed(2)]);
            return { headers: ["Stock Item", "Total Qty Sold", "Total Revenue", "Total Cost", "Net Profit"], rows };
        }
        function getNetProfitData(startStr, endStr) {
            let rows = [], tR = 0, tC = 0, tP = 0;
            transactions.forEach(t => {
                if ((!startStr || !endStr) || (new Date(t.date) >= new Date(startStr) && new Date(t.date) <= new Date(endStr))) {
                    let sA = 0, cA = 0;
                    t.items.forEach(i => { const p = products.find(x => x.productId == i.id || x.id === i.id) || { cost: 0, price: 0 }; let m = i.type === 'buy' ? 1 : -1; sA += p.price * i.qty * m; cA += p.cost * i.qty * m; });
                    tR += sA; tC += cA; tP += (sA - cA);
                    rows.push([t.id, new Date(t.date).toLocaleString(), t.customerName, sA.toFixed(2), cA.toFixed(2), (sA - cA).toFixed(2)]);
                }
            });
            rows.push(["TOTALS", "", "", tR.toFixed(2), tC.toFixed(2), tP.toFixed(2)]);
            return { headers: ["Bill No", "Date", "Customer", "Total Bill Amount", "Total Cost", "Net Profit"], rows };
        }
        function exportLogsCSV() {
            if (transactions.length === 0) return alert("No logs available to export.");
            let csv = "data:text/csv;charset=utf-8,Bill ID,Date,Billed By,Customer Name,Customer Phone,Products Bought,Net Total\n";
            transactions.forEach(t => {
                const safeDate = new Date(t.date).toLocaleString().replace(/,/g, '');
                let itemsString = t.items.map(i => { const p = products.find(x => x.productId == i.id || x.id === i.id) || { name: "Item Deleted" }; return `${p.name} (x${i.qty})`; }).join(" | ");
                csv += `"${t.id}","${safeDate}","${t.billedBy}","${t.customerName}","${t.customerPhone}","${itemsString}","${t.total}"\n`;
            });
            const link = document.createElement("a"); link.setAttribute("href", encodeURI(csv)); link.setAttribute("download", "transaction_logs.csv");
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
        }

        // --- INVENTORY MANAGEMENT ---
        function renderAdmin(filter = 'all') {
            const isAdmin = currentUser.role === 'admin';
            document.getElementById('adminTableHead').innerHTML = `<tr><th style="width:50px;"><input type="checkbox" id="selectAllItems" style="transform:scale(1.4); cursor:pointer;" onchange="document.querySelectorAll('.item-select-cb').forEach(cb => cb.checked = this.checked)"></th><th>Img</th><th>Item</th><th>Cat</th>${isAdmin ? '<th>Cost</th>' : ''}<th>Price</th><th>Stock</th><th>Restock</th><th>Act</th></tr>`;
            let displayProducts = filter === 'instock' ? products.filter(p => p.stock > 0) : filter === 'outstock' ? products.filter(p => p.stock <= 0) : products;
            const mapRow = p => {
                const pid = p.productId || p.id;
                return `<tr><td><input type="checkbox" class="item-select-cb" value="${pid}" style="transform:scale(1.4); cursor:pointer;"></td><td><img src="${p.image}" style="width:50px;height:50px; object-fit:cover; border-radius:4px;"></td><td style="font-weight:bold;">${p.name}<br><small style="color:#999">${p.barcode ? 'BC: ' + p.barcode : ''}</small></td><td><span style="font-size:1rem;background:#eee;padding:4px 8px; border-radius:4px;">${p.category}</span></td>${isAdmin ? `<td>₹${p.cost}</td>` : ''}<td><input type="number" value="${p.price}" style="width:90px; padding:8px; font-size:1.1rem; border:1px solid #ccc; border-radius:4px;" onchange="updateProductPrice('${pid}', this.value, this)"></td><td style="font-weight:bold; font-size:1.1rem; color:${p.stock < 21 ? 'red' : 'green'}">${p.stock}</td><td><div class="restock-group"><input type="number" id="rs-${pid}" class="restock-input" placeholder="+"><button class="restock-btn" onclick="quickRestock('${pid}')">Add</button></div></td><td><button style="color:#f59e0b;background:none;border:1px solid #f59e0b;border-radius:4px;padding:6px 12px;cursor:pointer;font-weight:bold;margin-right:8px;" onclick="editProduct('${pid}')">Edit</button><button style="color:red;background:none;border:1px solid red;border-radius:4px;padding:6px 12px;cursor:pointer;font-weight:bold;" onclick="delItem('${pid}')">Del</button></td></tr>`;
            };
            document.getElementById('adminTableBody').innerHTML = displayProducts.length > 0 ? displayProducts.map(mapRow).join('') : `<tr><td colspan="9" style="text-align:center; padding:15px; color:#999;">No items found</td></tr>`;
        }

        async function applyStockOutSale() {
            const checkedBoxes = document.querySelectorAll('.item-select-cb:checked');
            if (checkedBoxes.length === 0) { alert("Please select at least one product."); return; }
            const msg = currentUser.role === 'admin' ? "Drop Selling Price to Cost Price for selected items?" : "Reduce price for selected items?";
            if (confirm(msg)) {
                let updates = [];
                checkedBoxes.forEach(cb => { const p = products.find(x => (x.productId || x.id) == cb.value); if (p) { p.price = p.cost; p.productId = p.productId || p.id; updates.push(p); } });
                renderAdmin(); document.getElementById('selectAllItems').checked = false; alert("Prices updated.");
                await Promise.all(updates.map(p => apiPost('/products', p)));
            }
        }

        async function applyBulkMarkup() {
            const margin = parseFloat(document.getElementById('bulkMargin').value);
            if (isNaN(margin) || margin < 0) return alert("Enter a valid percentage");
            // FIX: skip zero-cost products
            const zeroCost = products.filter(p => !p.cost || p.cost <= 0);
            if (zeroCost.length > 0) {
                if (!confirm(`Warning: ${zeroCost.length} product(s) have no cost price and will be skipped:\n${zeroCost.map(p => p.name).join(', ')}\n\nContinue with the rest?`)) return;
            }
            products.forEach(p => { if (!p.cost || p.cost <= 0) return; p.price = Math.round(p.cost * (1 + (margin / 100))); p.productId = p.productId || p.id; });
            renderAdmin(); alert(`Prices updated with ${margin}% margin.`);
            await Promise.all(products.filter(p => p.cost > 0).map(p => apiPost('/products', p)));
        }

        async function updateProductPrice(id, val, el) {
            const p = products.find(x => x.productId == id || x.id === id);
            const newPrice = Number(val);
            if (!val || isNaN(newPrice) || newPrice <= 0) { alert("Please enter a valid price."); el.value = p.price; return; }
            if (newPrice < p.cost) { alert(currentUser.role === 'admin' ? `Error: Selling Price (₹${newPrice}) < Cost Price (₹${p.cost}).` : "Error: Price too low."); el.value = p.price; return; }
            p.price = newPrice; p.productId = p.productId || p.id;
            await apiPost('/products', p);
        }

        function editProduct(id) {
            const p = products.find(x => x.productId == id || x.id === id);
            if (!p) return;
            editingProductId = id;
            if (document.getElementById('npBarcode')) document.getElementById('npBarcode').value = p.barcode || '';
            document.getElementById('npName').value = p.name;
            document.getElementById('npCat').value = p.category;
            if (currentUser.role === 'admin' && document.getElementById('npCost')) document.getElementById('npCost').value = p.cost;
            document.getElementById('npPrice').value = p.price;
            document.getElementById('npStock').value = p.stock;
            document.getElementById('btnSubmitProduct').innerText = "Update Product";
            let titleEl = document.querySelector('#tab-inventory .admin-form-panel div');
            if (titleEl) titleEl.innerText = "Edit Product";
            document.getElementById('tab-inventory').scrollIntoView({ behavior: 'smooth' });
        }

        async function addItem() {
            const n = document.getElementById('npName').value.trim(), c = document.getElementById('npCat').value.trim();
            const p = Number(document.getElementById('npPrice').value), s = document.getElementById('npStock').value;
            const img = document.getElementById('npImg'), bEl = document.getElementById('npBarcode');
            let barcodeVal = bEl ? bEl.value.trim() : '';
            // FIX: proper individual validations
            if (!n) return alert("Please enter a Product Name.");
            if (!p || p <= 0) return alert("Please enter a valid Selling Price greater than 0.");
            if (s === '' || isNaN(parseInt(s, 10)) || parseInt(s, 10) < 0) return alert("Please enter a valid Stock quantity (0 or more).");
            let actualCost = 0;
            if (editingProductId) {
                let prod = products.find(x => x.productId == editingProductId || x.id === editingProductId);
                actualCost = prod.cost;
                if (currentUser.role === 'admin') { const ci = document.getElementById('npCost'); if (ci && ci.value) actualCost = Number(ci.value); }
            } else {
                if (currentUser.role === 'admin') { const ci = document.getElementById('npCost'); if (!ci.value) return alert("Please enter Cost Price."); actualCost = Number(ci.value); }
            }
            if (p < actualCost) return alert(currentUser.role === 'admin' ? `Error: Selling Price (₹${p}) cannot be less than Cost Price (₹${actualCost}).` : "Error: Price cannot be set this low.");
            const btnSubmit = document.getElementById('btnSubmitProduct');
            btnSubmit.innerText = "Saving..."; btnSubmit.disabled = true;
            const save = async (src) => {
                let productObj;
                if (editingProductId) {
                    let prod = products.find(x => x.productId == editingProductId || x.id === editingProductId);
                    prod.barcode = barcodeVal; prod.name = n; prod.category = c || "Misc";
                    if (currentUser.role === 'admin') prod.cost = actualCost;
                    prod.price = p; prod.stock = parseInt(s, 10);
                    if (src) prod.image = await compressImage(src);
                    prod.productId = prod.productId || prod.id; productObj = prod;
                    editingProductId = null; document.getElementById('btnSubmitProduct').innerText = "Add Product";
                    let titleEl = document.querySelector('#tab-inventory .admin-form-panel div'); if (titleEl) titleEl.innerText = "Add New Product";
                } else {
                    const newId = 'P' + Date.now();
                    let newProd = { productId: newId, id: newId, barcode: barcodeVal, name: n, category: c || "Misc", cost: actualCost, price: p, stock: parseInt(s, 10), image: src ? await compressImage(src) : "" };
                    products.push(newProd); productObj = newProd;
                }
                document.getElementById('npName').value = ''; document.getElementById('npCat').value = ''; document.getElementById('npPrice').value = ''; document.getElementById('npStock').value = '';
                if (img) img.value = ''; if (bEl) bEl.value = '';
                if (currentUser.role === 'admin' && document.getElementById('npCost')) document.getElementById('npCost').value = '';
                renderAdmin(); renderCategories(); updateNotifications();
                await apiPost('/products', productObj);
                btnSubmit.innerText = "Add Product"; btnSubmit.disabled = false;
            };
            if (img && img.files && img.files[0]) { const r = new FileReader(); r.onload = e => save(e.target.result); r.readAsDataURL(img.files[0]); } else save(null);
        }

        async function delItem(id) {
            if (confirm("Delete this product?")) {
                products = products.filter(x => !(x.productId == id || x.id == id));
                renderAdmin(); updateNotifications();
                await apiDelete('/products', { productId: String(id) });
            }
        }

        async function quickRestock(id) {
            const i = document.getElementById(`rs-${id}`);
            const val = parseInt(i.value, 10);
            // FIX: proper validation
            if (isNaN(val) || val <= 0) return alert("Enter a valid positive restock quantity.");
            let p = products.find(x => x.productId == id || x.id === id);
            if (!p) return;
            p.stock += val; p.productId = p.productId || p.id; i.value = '';
            renderAdmin(); updateNotifications();
            await apiPost('/products', p);
        }

        function renderStaff() {
            document.getElementById('staffTableBody').innerHTML = users.map(u =>
                `<tr><td style="font-size:1.1rem; font-weight:bold;">${u.username}</td><td>${u.phone}</td><td style="font-family:monospace;">${u.password}</td><td style="text-transform:capitalize;">${u.role}</td><td><button style="color:red;background:none;border:1px solid red;border-radius:4px;padding:6px 12px;cursor:pointer;font-weight:bold;" onclick="delUser('${u.username}')" ${u.username === 'admin' ? 'disabled' : ''}>Remove</button></td></tr>`
            ).join('');
        }

        async function addUser() {
            const u = document.getElementById('nuName').value.trim();
            const ph = document.getElementById('nuPhone').value.trim();
            const p = document.getElementById('nuPass').value;
            const r = document.getElementById('nuRole').value;
            if (!u || !p || !ph) return alert("Please fill all fields.");
            if (!/^\d{10}$/.test(ph)) return alert("❌ Phone number must be exactly 10 digits.");
            // FIX: duplicate username check
            if (users.find(x => x.username === u)) return alert("❌ Username already exists. Please choose a different one.");
            if (p.length < 4) return alert("❌ Password must be at least 4 characters.");
            let newUser = { username: u, phone: ph, password: p, role: r };
            users.push(newUser);
            document.getElementById('nuName').value = ''; document.getElementById('nuPhone').value = ''; document.getElementById('nuPass').value = '';
            renderStaff();
            await apiPost('/users', newUser);
        }

        async function delUser(username) {
            users = users.filter(u => u.username !== username);
            renderStaff();
            await apiDelete('/users', { username });
        }

        function renderChart(timeframe) {
            document.querySelectorAll('.chart-controls .chart-tab').forEach(el => el.classList.remove('active'));
            const activeTabBtn = document.getElementById('btn-chart-' + timeframe); if (activeTabBtn) activeTabBtn.classList.add('active');
            const ctxCompare = document.getElementById('compareChart'), ctxSales = document.getElementById('salesChart'), ctxProfit = document.getElementById('profitChart');
            if (!ctxCompare || !ctxSales || !ctxProfit) return;
            if (compareChartInstance) compareChartInstance.destroy();
            if (salesChartInstance) salesChartInstance.destroy();
            if (profitChartInstance) profitChartInstance.destroy();
            let labels = [], currentLabel = '', prevLabel = '';
            if (timeframe === 'day')   { labels = ['9AM','11AM','1PM','3PM','5PM','7PM+']; currentLabel="Today"; prevLabel="Yesterday"; }
            else if (timeframe === 'week')  { labels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']; currentLabel="This Week"; prevLabel="Last Week"; }
            else if (timeframe === 'month') { labels = ['Week 1','Week 2','Week 3','Week 4']; currentLabel="This Month"; prevLabel="Last Month"; }
            else if (timeframe === 'year')  { labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; currentLabel="This Year"; prevLabel="Last Year"; }
            let currentSales = Array(labels.length).fill(0), prevSales = Array(labels.length).fill(0), profitData = Array(labels.length).fill(0);
            const now = new Date(); let yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
            transactions.forEach(t => {
                let tDate = new Date(t.date), tSale = 0, tCost = 0;
                t.items.forEach(i => { const p = products.find(x => x.productId == i.id || x.id === i.id) || { price:0, cost:0 }; if (i.type==='buy') { tSale += p.price*i.qty; tCost += p.cost*i.qty; } else { tSale -= p.price*i.qty; tCost -= p.cost*i.qty; } });
                let tProfit = tSale - tCost;
                if (timeframe==='day') { if (tDate.toDateString()===now.toDateString()) { let h=tDate.getHours(); let idx=h<11?0:h<13?1:h<15?2:h<17?3:h<19?4:5; currentSales[idx]+=tSale; profitData[idx]+=tProfit; } if (tDate.toDateString()===yesterday.toDateString()) { let h=tDate.getHours(); let idx=h<11?0:h<13?1:h<15?2:h<17?3:h<19?4:5; prevSales[idx]+=tSale; } }
                else if (timeframe==='week')  { let day=tDate.getDay(); currentSales[day]+=tSale; profitData[day]+=tProfit; }
                else if (timeframe==='month') { let d=tDate.getDate(); let idx=d<=7?0:d<=14?1:d<=21?2:3; currentSales[idx]+=tSale; profitData[idx]+=tProfit; }
                else if (timeframe==='year')  { let m=tDate.getMonth(); currentSales[m]+=tSale; profitData[m]+=tProfit; }
            });
            document.getElementById('statCurrentLabel').innerText = currentLabel+"'s Sales"; document.getElementById('statPrevLabel').innerText = prevLabel+"'s Sales";
            document.getElementById('statCurrentVal').innerText = '₹'+currentSales.reduce((a,b)=>a+b,0).toFixed(2); document.getElementById('statPrevVal').innerText = '₹'+prevSales.reduce((a,b)=>a+b,0).toFixed(2);
            compareChartInstance = new Chart(ctxCompare.getContext('2d'), { type:'line', data:{labels, datasets:[{label:currentLabel+' (₹)',data:currentSales,borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,0.1)',fill:true,tension:0.3},{label:prevLabel+' (₹)',data:prevSales,borderColor:'#94a3b8',borderDash:[5,5],fill:false,tension:0.3}]}, options:{responsive:true,maintainAspectRatio:false,plugins:{title:{display:true,text:'SALES COMPARISON',font:{size:16}}}} });
            salesChartInstance  = new Chart(ctxSales.getContext('2d'),   { type:'bar',  data:{labels, datasets:[{label:'Total Gross Sales (₹)',data:currentSales,backgroundColor:'#f97316',borderRadius:4}]}, options:{responsive:true,maintainAspectRatio:false,plugins:{title:{display:true,text:'GROSS SALES',font:{size:16}}}} });
            profitChartInstance = new Chart(ctxProfit.getContext('2d'),  { type:'bar',  data:{labels, datasets:[{label:'Net Profit (₹)',data:profitData,backgroundColor:'#22c55e',borderRadius:4}]}, options:{responsive:true,maintainAspectRatio:false,plugins:{title:{display:true,text:'NET PROFIT',font:{size:16}}}} });
        }

        // --- UTILS ---
        function switchMode(mode) {
            currentMode = mode;
            document.getElementById('productGridView').style.display   = (mode==='admin'||mode==='delivery') ? 'none' : 'block';
            document.getElementById('adminView').style.display         = mode==='admin' ? 'block' : 'none';
            document.getElementById('deliveryDashboard').style.display = mode==='delivery' ? 'block' : 'none';
            document.getElementById('returnBanner').style.display      = mode==='return' ? 'flex' : 'none';
            document.getElementById('shopBanner').style.display        = mode==='retailer' ? 'flex' : 'none';
            ['Retailer','Return','Admin','Delivery'].forEach(m => {
                const btn = document.getElementById('btn'+m);
                if (btn) { btn.classList.remove('active-retailer','active-return','active-admin','active-delivery'); if (mode===m.toLowerCase()) btn.classList.add('active-'+m.toLowerCase()); }
            });
            if (mode==='admin') { switchAdminTab('inventory'); renderAdmin(); }
            else if (mode==='delivery') { renderDeliveryDashboard(); }
            else { setCat('All'); renderGrid(); renderCartSide(); }
        }

        function toggleSidebar() { document.getElementById('sidebar').classList.toggle('active'); document.getElementById('overlay').classList.toggle('active'); }
        function toggleCart()    { document.getElementById('cartSidebar').classList.toggle('open'); document.getElementById('overlay').classList.toggle('active'); }
        function closeAll()      { document.getElementById('sidebar').classList.remove('active'); document.getElementById('cartSidebar').classList.remove('open'); document.getElementById('overlay').classList.remove('active'); document.getElementById('notifDropdown').style.display='none'; closeModal(); closeCustomerHistoryModal(); closeCameraModal(); closeDeliveryModal(); }
        function closeModal()    { document.getElementById('receiptModal').style.display='none'; document.getElementById('overlay').style.zIndex='200'; }

        function updateTotalGSTUI() {
            const ci = document.getElementById('setCGST'), si = document.getElementById('setSGST'), ti = document.getElementById('setTotalGST');
            if (!ci || !si || !ti) return;
            const cgst = parseFloat(ci.value)||0, sgst = parseFloat(si.value)||0;
            ti.value = `${(cgst+sgst).toFixed(1)}%`;
            storeSettings.cgstRate = cgst; storeSettings.sgstRate = sgst;
            renderCartSide();
        }

        async function saveStoreSettings() {
            const confirmInput = document.getElementById('settingsConfirm');
            if (!confirmInput || confirmInput.value.trim().toLowerCase() !== 'confirm') { alert('Type "confirm" to save store settings.'); return; }
            const nameInput = document.getElementById('setStoreName'), phoneInput = document.getElementById('setStorePhone');
            const addressInput = document.getElementById('setStoreAddress'), cgstInput = document.getElementById('setCGST'), sgstInput = document.getElementById('setSGST');
            const nameVal = nameInput.value.trim() || storeSettings.name;
            const phoneVal = phoneInput.value.trim() || storeSettings.phone;
            const addressVal = addressInput.value.trim() || storeSettings.address;
            // FIX: validate phone
            if (phoneVal && !/^\d{10}$/.test(phoneVal)) { alert('❌ Store phone number must be exactly 10 digits.'); return; }
            storeSettings.name = nameVal; storeSettings.phone = phoneVal; storeSettings.address = addressVal;
            storeSettings.cgstRate = parseFloat(cgstInput.value) || storeSettings.cgstRate;
            storeSettings.sgstRate = parseFloat(sgstInput.value) || storeSettings.sgstRate;
            if (storeSettings.address && storeSettings.address.trim() !== '') {
                try { const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(storeSettings.address)}&countrycodes=in`); const data = await res.json(); if (data && data.length > 0) { storeSettings.lat = parseFloat(data[0].lat); storeSettings.lng = parseFloat(data[0].lon); } else { storeSettings.lat=28.6139; storeSettings.lng=77.2090; } } catch(e) { storeSettings.lat=28.6139; storeSettings.lng=77.2090; }
            } else { storeSettings.lat=28.6139; storeSettings.lng=77.2090; }
            document.getElementById('customerStoreName').innerText = storeSettings.name;
            document.getElementById('customerCall').href = `tel:${storeSettings.phone}`;
            updateTotalGSTUI(); alert('Store settings saved.'); confirmInput.value = '';
            await apiPost('/settings', storeSettings);
            if (deliveryMap && storeMarker) { storeMarker.setLatLng([storeSettings.lat, storeSettings.lng]); deliveryMap.setView([storeSettings.lat, storeSettings.lng]); }
        }

        function viewPastBill(billId) {
            const tx = transactions.find(t => t.id === billId);
            if (!tx) { alert("Bill not found."); return; }
            openReceiptModal(tx);
        }

        function saveStoreSettingsOnLoad() {
            const n = document.getElementById('setStoreName'), ph = document.getElementById('setStorePhone'), a = document.getElementById('setStoreAddress');
            if (n) n.value = storeSettings.name || ''; if (ph) ph.value = storeSettings.phone || ''; if (a) a.value = storeSettings.address || '';
            updateTotalGSTUI();
        }

        // --- DELIVERY MAP & LOGIC ---
        async function openDeliveryModal() {
            if (cart.length === 0) return alert("Add items to cart before initiating delivery.");
            const btn = document.getElementById('addDeliveryBtn'), oldText = btn ? btn.innerHTML : '';
            if (btn) btn.innerHTML = 'Locating branch...';
            if (!storeSettings.lat || !storeSettings.lng || (storeSettings.lat===28.6139 && storeSettings.lng===77.2090)) {
                if (storeSettings.address && storeSettings.address.trim() !== '' && storeSettings.address !== '123 Main St') {
                    try { const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(storeSettings.address)}&countrycodes=in`); const data = await res.json(); if (data && data.length > 0) { storeSettings.lat = parseFloat(data[0].lat); storeSettings.lng = parseFloat(data[0].lon); } else { storeSettings.lat=28.6139; storeSettings.lng=77.2090; } } catch(e) { storeSettings.lat=28.6139; storeSettings.lng=77.2090; }
                } else { storeSettings.lat=28.6139; storeSettings.lng=77.2090; }
            }
            if (btn) btn.innerHTML = oldText;
            deliveryRequired = true;
            document.getElementById('deliveryModal').style.display = 'flex';
            document.getElementById('overlay').style.zIndex = '500';
            document.getElementById('overlay').classList.add('active');
            setTimeout(() => {
                if (!deliveryMap) {
                    document.getElementById('current-branch-name').innerText = storeSettings.name;
                    document.getElementById('current-branch-address').innerText = storeSettings.address || "Address not provided in settings";
                    deliveryMap = L.map('deliveryMap').setView([storeSettings.lat, storeSettings.lng], 12);
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(deliveryMap);
                    const sIcon = L.divIcon({ html: `<div style="background:var(--primary);color:white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:2px solid white;font-size:18px;">🏪</div>`, className: '' });
                    storeMarker = L.marker([storeSettings.lat, storeSettings.lng], {icon: sIcon}).addTo(deliveryMap);
                    const cIcon = L.divIcon({ html: `<div style="background:var(--danger);color:white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:2px solid white;font-size:18px;">📍</div>`, className: '' });
                    customerMarker = L.marker([storeSettings.lat+0.01, storeSettings.lng+0.01], { icon: cIcon, draggable: true }).addTo(deliveryMap);
                    customerMarker.on('dragend', (e) => validateAndRoute(e.target.getLatLng()));
                    deliveryMap.on('click', (e) => { customerMarker.setLatLng(e.latlng); validateAndRoute(e.latlng); });
                }
                deliveryMap.invalidateSize(); renderVehicles(); validateAndRoute(customerMarker.getLatLng());
            }, 50);
        }

        function closeDeliveryModal() {
            document.getElementById('deliveryModal').style.display = 'none';
            document.getElementById('overlay').style.zIndex = '200';
            if (document.getElementById('receiptModal').style.display === 'none') document.getElementById('overlay').classList.remove('active');
        }

        function removeDelivery() { deliveryRequired=false; deliveryFee=0; tripDist=0; deliveryAddress=""; renderCartSide(); closeDeliveryModal(); }

        function confirmDelivery() {
            // FIX: cast tripDist to float properly
            deliveryFee = parseFloat((parseFloat(tripDist) * vehicles[selectedVehicle].price).toFixed(2));
            deliveryAddress = document.getElementById('delAddress').value.trim() || "Map Pin Location";
            renderCartSide(); closeDeliveryModal(); openReceiptModal();
        }

        async function searchDeliveryLocation() {
            const q = document.getElementById('delAddress').value.trim();
            if (!q) return alert("Enter address to search");
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=in`);
                const data = await res.json();
                if (data.length > 0) { const pos = L.latLng(data[0].lat, data[0].lon); customerMarker.setLatLng(pos); validateAndRoute(pos); }
                else { alert("Address not found in India. Please try a more specific address."); }
            } catch(e) { alert("Could not search for address. Check your internet connection."); }
        }

        async function validateAndRoute(dest) {
            const loader = document.getElementById('map-loader'), statusMsg = document.getElementById('del-status-msg');
            loader.style.display = 'flex'; statusMsg.style.display = 'none';
            try {
                const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${dest.lat}&lon=${dest.lng}`);
                const geoData = await geoRes.json();
                if (!geoData.address || geoData.address.country !== "India") { showDeliveryError("Delivery is only available within India."); tripDist=0; updateDeliveryUI(); loader.style.display='none'; return; }
                if (!document.getElementById('delAddress').value && geoData.display_name) document.getElementById('delAddress').value = geoData.display_name;
                const routeRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${storeSettings.lng},${storeSettings.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`);
                const routeData = await routeRes.json();
                if (routeData.code === 'Ok') {
                    const route = routeData.routes[0]; tripDist = (route.distance/1000).toFixed(2); tripTime = route.duration;
                    if (routeLine) deliveryMap.removeLayer(routeLine);
                    routeLine = L.geoJSON(route.geometry, { style:{color:'#8b5cf6',weight:6,opacity:0.8} }).addTo(deliveryMap);
                    deliveryMap.fitBounds(routeLine.getBounds(), { padding:[50,50] });
                } else { showDeliveryError("No valid road route found."); tripDist=0; }
            } catch(e) { showDeliveryError("System error checking route."); tripDist=0; }
            loader.style.display = 'none'; updateDeliveryUI();
        }

        function showDeliveryError(msg) { const el=document.getElementById('del-status-msg'); el.innerHTML=`⚠️ <b>Restriction:</b> ${msg}`; el.style.display='block'; }

        function renderVehicles() {
            const list = document.getElementById('vehicle-list'); list.innerHTML = '';
            Object.keys(vehicles).forEach(k => { const v=vehicles[k]; list.innerHTML += `<div class="v-card ${k===selectedVehicle?'active':''}" onclick="selectVehicle('${k}')"><span style="font-size:24px; display:block;">${v.icon}</span><span style="font-weight:700; font-size:12px;">${v.name}</span><small style="font-size:10px; color:#64748b;">${v.maxKm?v.maxKm+'km':'No Limit'}</small></div>`; });
        }

        function selectVehicle(k) { selectedVehicle=k; renderVehicles(); updateDeliveryUI(); }

        function updateDeliveryUI() {
            const v=vehicles[selectedVehicle], dist=parseFloat(tripDist), btn=document.getElementById('del-confirm-btn');
            document.getElementById('dist-text').innerText = `${dist} km`;
            const h=Math.floor(tripTime/3600), m=Math.floor((tripTime%3600)/60);
            document.getElementById('time-text').innerText = h>0?`${h}h ${m}m`:`${m} mins`;
            if (dist<=0) { document.getElementById('total-del-price').innerText="₹0"; btn.disabled=true; }
            else if (v.maxKm && dist>v.maxKm) { showDeliveryError(`The ${v.name} is limited to ${v.maxKm}km. Current distance is ${dist}km.`); document.getElementById('total-del-price').innerText="N/A"; btn.disabled=true; }
            else { document.getElementById('total-del-price').innerText=`₹${Number((dist*v.price).toFixed(2)).toLocaleString('en-IN')}`; btn.disabled=false; }
        }

        // --- DELIVERY DASHBOARD ---
        function renderDeliveryDashboard() {
            const tbody = document.getElementById('delDashboardBody');
            const delTxs = transactions.filter(t => t.deliveryRequired === true);
            if (delTxs.length === 0) { tbody.innerHTML=`<tr><td colspan="6" style="text-align:center; padding:20px; color:#999;">No deliveries found.</td></tr>`; return; }
            const tableHeaders = document.querySelector('#deliveryDashboard thead tr');
            if (tableHeaders) tableHeaders.innerHTML = `<th>Bill ID / Date</th><th>Customer & Phone</th><th>Address (Distance)</th><th>Bill</th><th>Status</th><th>Update</th>`;
            const sortedDel = [...delTxs].sort((a,b) => new Date(b.date)-new Date(a.date));
            tbody.innerHTML = sortedDel.map(t => {
                const d = new Date(t.date).toLocaleString();
                const statColors = {'processing':'#f59e0b','on way':'#3b82f6','delivered':'#10b981'};
                const curColor = statColors[t.deliveryStatus]||'#f59e0b';
                let opts = '';
                if (t.deliveryStatus==='processing') opts=`<option value="processing" selected>Processing</option><option value="on way">On Way (Out)</option><option value="delivered">Delivered</option>`;
                else if (t.deliveryStatus==='on way') opts=`<option value="on way" selected>On Way (Out)</option><option value="delivered">Delivered</option>`;
                else if (t.deliveryStatus==='delivered') opts=`<option value="delivered" selected>Delivered</option>`;
                else opts=`<option value="processing" selected>Processing</option><option value="on way">On Way (Out)</option><option value="delivered">Delivered</option>`;
                return `<tr><td><b>${t.id}</b><br><small>${d}</small></td><td><b>${t.customerName}</b><br>${t.customerPhone}</td><td><div style="max-width:200px; white-space:normal; font-size:0.9rem;">${t.deliveryAddress}</div><small style="color:var(--delivery); font-weight:bold;">Dist: ${t.deliveryDistance} km</small></td><td><button class="action-btn btn-buy" style="padding:4px 8px; width:auto; font-size:0.85rem;" onclick="viewPastBill('${t.id}')">View Bill</button></td><td><span style="background:${curColor}; color:white; padding:4px 8px; border-radius:4px; font-size:0.85rem; font-weight:bold; text-transform:uppercase;">${t.deliveryStatus}</span></td><td><select onchange="updateDeliveryStatus('${t.id}', this.value)" style="padding:6px; border-radius:4px; border:1px solid #ccc;">${opts}</select></td></tr>`;
            }).join('');
        }

        async function updateDeliveryStatus(billId, newStatus) {
            const tx = transactions.find(t => t.id === billId);
            if (!tx) return;
            tx.deliveryStatus = newStatus;
            if (AWS_CONFIG.useCloud) await apiPost('/bills', tx);
            if ((newStatus==='on way'||newStatus==='delivered') && tx.customerPhone && tx.customerPhone!=='N/A') sendWhatsAppDeliveryUpdate(tx, newStatus);
            renderDeliveryDashboard();
        }

        function sendWhatsAppDeliveryUpdate(tx, status) {
            try {
                const store = storeSettings.name||"HardwarePro";
                let msgText = status==='on way' ? `*${store} Delivery Update*%0A%0AHi ${tx.customerName}, your order (Bill: ${tx.id}) is *Out for Delivery*!` : `*${store} Delivery Update*%0A%0AHi ${tx.customerName}, your order (Bill: ${tx.id}) has been *Delivered* successfully. Thank you!`;
                // FIX: prevent double 91 prefix
                let phone = tx.customerPhone.replace(/\D/g, "");
                if (!phone.startsWith("91") || phone.length === 10) phone = "91" + phone.replace(/^91/, '');
                window.open(`https://wa.me/${phone}?text=${msgText}`, "_blank");
            } catch(e) { console.warn("WhatsApp update error", e); }
        }

        // --- INIT ---
        window.onload = async () => {
            const loader = document.getElementById('appLoader');
            if (loader) loader.style.display = 'flex';

            const seedDefaults = () => {
                if (users.length === 0) {
                    users.push({ username: 'admin',    phone: '9999999999', password: 'password', role: 'admin' });
                    users.push({ username: 'staff',    phone: '8888888888', password: 'staff123', role: 'staff' });
                    users.push({ username: 'customer', phone: '7777777777', password: '123',      role: 'customer' });
                }
                if (!storeSettings.name) storeSettings = { name: 'HardwarePro', phone: '9876543210', address: '123 Main St', cgstRate: 9, sgstRate: 9, lat: 28.6139, lng: 77.2090 };
                if (products.length === 0) {
                    products.push({ productId:'P1001', id:'P1001', name:'Sample Drill',   category:'Power Tools', cost:1200, price:1500, stock:15, barcode:'8901', image:'' });
                    products.push({ productId:'P1002', id:'P1002', name:'Hammer',          category:'Hand Tools',  cost:200,  price:350,  stock:40, barcode:'8902', image:'' });
                    products.push({ productId:'P1003', id:'P1003', name:'Measuring Tape',  category:'Hand Tools',  cost:80,   price:150,  stock:60, barcode:'8903', image:'' });
                    products.push({ productId:'P1004', id:'P1004', name:'PVC Pipe 1inch',  category:'Plumbing',    cost:45,   price:90,   stock:100,barcode:'8904', image:'' });
                    products.push({ productId:'P1005', id:'P1005', name:'Wall Paint 1L',   category:'Paints',      cost:300,  price:480,  stock:25, barcode:'8905', image:'' });
                }
            };

            try {
                if (AWS_CONFIG.useCloud) {
                    const [dbProducts, dbUsers, dbBills, dbSettings] = await Promise.all([
                        apiGet('/products'), apiGet('/users'), apiGet('/bills'), apiGet('/settings')
                    ]);
                    if (dbProducts && dbProducts.length > 0) products = dbProducts.map(p => ({...p, id: p.id||p.productId, productId: p.productId||p.id}));
                    if (dbUsers    && dbUsers.length > 0)    users = dbUsers;
                    if (dbBills    && dbBills.length > 0)    transactions = dbBills;
                    if (dbSettings && dbSettings.name)       storeSettings = dbSettings;
                    seedDefaults();
                    if (!dbUsers    || dbUsers.length === 0)    for (const u of users)    await apiPost('/users',    u);
                    if (!dbSettings || !dbSettings.name)        await apiPost('/settings', storeSettings);
                    if (!dbProducts || dbProducts.length === 0) for (const p of products) await apiPost('/products', p);
                } else {
                    seedDefaults();
                }
            } catch(e) {
                console.error("DB load failed, using local defaults:", e);
                seedDefaults();
            } finally {
                if (loader) loader.style.display = 'none';
            }

            saveStoreSettingsOnLoad();
            renderCategories();
            renderGrid();
            renderCartSide();
            updateNotifications();
        };