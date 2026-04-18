"""
Inject DynamoDB API integration into HardwarePro index.html
"""
import re
import os

input_path = r"C:\Users\DRAGOO\OneDrive\Desktop\DEMO\index.html"

with open(input_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add API Helpers and Loader State
api_helpers = """
        // ─── API INTEGRATION ──────────────────────────────────────────────────
        const API_BASE = window.AWS_CONFIG ? window.AWS_CONFIG.apiEndpoint : 'YOUR_API_GATEWAY_URL';
        
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
"""

# Insert helpers right after <script> tag
content = content.replace("<script>\n", "<script>\n" + api_helpers)

# 2. Add full screen loader UI to HTML
loader_ui = """
    <!-- FULL SCREEN LOADER -->
    <div id="appLoader" style="position:fixed; top:0; left:0; width:100%; height:100%; background:var(--bg); z-index:9999; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--dark);">
        <div style="font-size:3rem; margin-bottom:20px;">&#x1F6E0;&#xFE0F;</div>
        <h2 style="margin:0;">HardwarePro POS</h2>
        <p style="margin-top:10px; color:#64748b;">Connecting to Database...</p>
        <div style="width: 40px; height: 40px; border: 4px solid #cbd5e1; border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; margin-top:20px;"></div>
        <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    </div>
"""
# Insert after <body>
content = content.replace("<body>\n", "<body>\n" + loader_ui)

# 3. Modify variable initialization
content = re.sub(r'let users = \[[\s\S]*?\];', 'let users = [];', content)
content = re.sub(r'let products = \[[\s\S]*?\];', 'let products = [];', content)
content = content.replace("let transactions = []", "let transactions = []")
content = re.sub(r'let storeSettings = \{[\s\S]*?\};', 'let storeSettings = {};', content)

# 4. Modify window.onload to wait for data fetching
onload_replacement = """
        window.onload = async () => {
            // Load all data from AWS
            document.getElementById('appLoader').style.display = 'flex';
            
            try {
                const [dbProducts, dbUsers, dbBills, dbSettings] = await Promise.all([
                    apiGet('/products'),
                    apiGet('/users'),
                    apiGet('/bills'),
                    apiGet('/settings')
                ]);
                
                if(dbProducts) products = dbProducts;
                if(dbUsers) users = dbUsers;
                if(dbBills) transactions = dbBills;
                if(dbSettings) storeSettings = dbSettings;
                
                // Seed admin user if none exists
                if(users.length === 0) {
                    const defaultAdmin = {username:'admin', phone:'9999999999', password:'password', role:'admin'};
                    await apiPost('/users', defaultAdmin);
                    users.push(defaultAdmin);
                }
                
                // Seed hardware settings if empty
                if(!storeSettings.name) {
                    storeSettings = { name: 'HardwarePro', phone: '9876543210', address: '123 Main St', gstRate: 18 };
                    await apiPost('/settings', storeSettings);
                }
                
                // Seed a demo product if completely empty (just for demo purposes)
                if(products.length === 0) {
                    const p1 = {productId:'P1001', name:'Drill Machine 500W', cat:'Power Tools', cost: 1200, price: 1500, stock: 15, barcode: '8901234567890', img:''};
                    await apiPost('/products', p1);
                    products.push(p1);
                }
                
            } catch(e) {
                console.error("Failed to load initial data", e);
                alert("Database connection failed. App may not function correctly.");
            } finally {
                document.getElementById('appLoader').style.display = 'none';
            }

            renderAll();
"""
content = content.replace("window.onload = () => {", onload_replacement)

# 5. Overhaul addItem (saving products)
add_item_orig = """function addItem() {
            const n = document.getElementById('npName').value, c = document.getElementById('npCat').value, s = document.getElementById('npCost').value, p = document.getElementById('npPrice').value, bc = document.getElementById('npBarcode').value, stk = document.getElementById('npStock').value, img = document.getElementById('npImg');
            if (!n || !p) return alert('Name & Price needed');
            const bEl = document.getElementById('btnSubmitProduct');
            if (bEl.innerText === 'Update Product') {
                const id = bEl.getAttribute('data-edit-id');
                const pObj = products.find(x => x.id == id);
                if (pObj) {
                    pObj.name = n; pObj.cat = c; pObj.cost = parseFloat(s) || 0; pObj.price = parseFloat(p) || 0; pObj.barcode = bc; pObj.stock = parseInt(stk) || 0;
                    if (img.files[0]) {
                        const r = new FileReader(); r.onload = e => { pObj.img = e.target.result; renderAll(); }; r.readAsDataURL(img.files[0]);
                    } else renderAll();
                }
                bEl.innerText = 'Add Product'; bEl.removeAttribute('data-edit-id');
            } else {
                const pObj = { id: 'P' + (Date.now() % 10000), name: n, cat: c, cost: parseFloat(s) || 0, price: parseFloat(p) || 0, barcode: bc, stock: parseInt(stk) || 0, img: '' };
                if (img.files[0]) {
                    const r = new FileReader(); r.onload = e => { pObj.img = e.target.result; products.push(pObj); renderAll(); }; r.readAsDataURL(img.files[0]);
                } else { products.push(pObj); renderAll(); }
            }
            document.getElementById('npName').value = document.getElementById('npCat').value = document.getElementById('npCost').value = document.getElementById('npPrice').value = document.getElementById('npBarcode').value = document.getElementById('npStock').value = '';
            document.getElementById('npImg').value = '';
        }"""

add_item_new = """async function addItem() {
            const n = document.getElementById('npName').value, c = document.getElementById('npCat').value, s = document.getElementById('npCost').value, p = document.getElementById('npPrice').value, bc = document.getElementById('npBarcode').value, stk = document.getElementById('npStock').value, img = document.getElementById('npImg');
            if (!n || !p) return alert('Name & Price needed');
            const bEl = document.getElementById('btnSubmitProduct');
            
            bEl.innerText = 'Saving...';
            bEl.disabled = true;

            let imgB64 = '';
            if (img.files[0]) {
                imgB64 = await new Promise(r => { 
                    const reader = new FileReader(); 
                    reader.onload = e => r(e.target.result); 
                    reader.readAsDataURL(img.files[0]); 
                });
                imgB64 = await compressImage(imgB64);
            }

            if (bEl.getAttribute('data-edit-id')) {
                const id = bEl.getAttribute('data-edit-id');
                const pObj = products.find(x => x.productId == id || x.id == id);
                if (pObj) {
                    pObj.name = n; pObj.cat = c; pObj.cost = parseFloat(s) || 0; pObj.price = parseFloat(p) || 0; pObj.barcode = bc; pObj.stock = parseInt(stk) || 0;
                    if (imgB64) pObj.img = imgB64;
                    // Ensure DynamoDB PK is named productId
                    pObj.productId = pObj.productId || pObj.id;
                    await apiPost('/products', pObj);
                }
                bEl.removeAttribute('data-edit-id');
            } else {
                const id = 'P' + (Date.now() % 10000);
                const pObj = { productId: id, id: id, name: n, cat: c, cost: parseFloat(s) || 0, price: parseFloat(p) || 0, barcode: bc, stock: parseInt(stk) || 0, img: imgB64 };
                products.push(pObj);
                await apiPost('/products', pObj);
            }
            
            bEl.innerText = 'Add Product';
            bEl.disabled = false;
            document.getElementById('npName').value = document.getElementById('npCat').value = document.getElementById('npCost').value = document.getElementById('npPrice').value = document.getElementById('npBarcode').value = document.getElementById('npStock').value = '';
            document.getElementById('npImg').value = '';
            renderAll();
        }"""

# 6. Change deleteItem (products)
delete_item_orig = """function deleteItem(id) { if (confirm('Delete?')) { products = products.filter(x => x.id != id); renderAll(); } }"""
delete_item_new = """async function deleteItem(id) { 
    if (confirm('Delete?')) { 
        products = products.filter(x => x.id != id && x.productId != id); 
        renderAll(); 
        await apiDelete('/products', {productId: id.toString()});
    } 
}"""

# 7. Add users
add_user_orig = """function addUser() {
            const u = document.getElementById('nuName').value, ph = document.getElementById('nuPhone').value, p = document.getElementById('nuPass').value, r = document.getElementById('nuRole').value;
            if (u && ph && p) { users.push({ username: u, phone: ph, password: p, role: r }); document.getElementById('nuName').value = ''; document.getElementById('nuPhone').value = ''; document.getElementById('nuPass').value = ''; renderAdminTabs(); }
        }"""
add_user_new = """async function addUser() {
            const u = document.getElementById('nuName').value, ph = document.getElementById('nuPhone').value, p = document.getElementById('nuPass').value, r = document.getElementById('nuRole').value;
            if (u && ph && p) { 
                const newUser = { username: u, phone: ph, password: p, role: r };
                users.push(newUser); 
                document.getElementById('nuName').value = ''; document.getElementById('nuPhone').value = ''; document.getElementById('nuPass').value = ''; 
                renderAdminTabs(); 
                await apiPost('/users', newUser);
            }
        }"""

# 8. Delete users
del_user_orig = """function deleteUser(u) { if (confirm('Delete user?')) { users = users.filter(x => x.username !== u); renderAdminTabs(); } }"""
del_user_new = """async function deleteUser(u) { if (confirm('Delete user?')) { users = users.filter(x => x.username !== u); renderAdminTabs(); await apiDelete('/users', {username: u}); } }"""

# 9. Stock out (bulk save)
stock_out_replacement = """        async function applyStockOutSale() {
            const els = document.querySelectorAll('.admin-checkbox:checked');
            if (els.length === 0) return alert('Select items first.');
            if (!confirm('Stock out selected?')) return;
            const updates = [];
            els.forEach(el => {
                const id = el.getAttribute('data-id');
                const p = products.find(x => x.id == id || x.productId == id);
                if (p && p.stock > 0) { p.stock--; updates.push(p); }
            });
            renderAll();
            // Fire API calls in background
            Promise.all(updates.map(p => { p.productId = p.productId||p.id; return apiPost('/products', p); }));
        }"""

# 10. Bulk margin (bulk save)
bulk_markup_orig = """function applyBulkMarkup() {
            const m = parseFloat(document.getElementById('bulkMargin').value);
            if (isNaN(m)) return alert('Enter valid margin %');
            if (!confirm('Apply ' + m + '% profit to ALL products?')) return;
            products.forEach(p => { if (p.cost > 0) p.price = Math.round(p.cost + (p.cost * m / 100)); });
            renderAll();
        }"""
bulk_markup_new = """async function applyBulkMarkup() {
            const m = parseFloat(document.getElementById('bulkMargin').value);
            if (isNaN(m)) return alert('Enter valid margin %');
            if (!confirm('Apply ' + m + '% profit to ALL products?')) return;
            products.forEach(p => { if (p.cost > 0) p.price = Math.round(p.cost + (p.cost * m / 100)); });
            renderAll();
            // Background API save
            Promise.all(products.map(p => { p.productId = p.productId||p.id; return apiPost('/products', p); }));
        }"""

# 11. Finalize transactions
fin_txn_orig = """function finalizeTransaction(paymentMethod) {
            const tot = currentMode === 'retailer' ? cart.reduce((s, i) => s + (i.price * i.qty), 0) : returnCart.reduce((s, i) => s + (i.price * i.qty), 0);
            const netAmount = currentMode === 'retailer' ? tot + (tot * storeSettings.gstRate / 100) : -(tot - (tot * 0.02));

            const bill = {
                id: 'B' + Date.now(),
                date: new Date().toLocaleString(),
                customer: document.getElementById('recCustName') ? document.getElementById('recCustName').value : 'Walk-in',
                phone: document.getElementById('recCustPhone') ? document.getElementById('recCustPhone').value : '',
                items: currentMode === 'retailer' ? [...cart] : [...returnCart],
                total: netAmount,
                type: currentMode,
                method: paymentMethod || 'Cash',
                billedBy: currentUser ? currentUser.username : 'Unknown'
            };
            transactions.push(bill);

            // modify stock
            bill.items.forEach(i => {
                const p = products.find(x => x.id == i.id);
                if (p) {
                    if (currentMode === 'retailer') p.stock -= i.qty;
                    else p.stock += i.qty;
                }
            });

            closeModal();
            if (currentMode === 'retailer') { cart = []; activeSearchId = null; }
            else returnCart = [];
            billHoldItems = [];

            alert(currentMode === 'retailer' ? 'Payment Successful!' : 'Return Processed!');
            renderAll();
        }"""
        
fin_txn_new = """async function finalizeTransaction(paymentMethod) {
            const tot = currentMode === 'retailer' ? cart.reduce((s, i) => s + (i.price * i.qty), 0) : returnCart.reduce((s, i) => s + (i.price * i.qty), 0);
            const netAmount = currentMode === 'retailer' ? tot + (tot * storeSettings.gstRate / 100) : -(tot - (tot * 0.02));

            const bill = {
                billId: 'B' + Date.now(),
                id: 'B' + Date.now(), // duplicate for legacy frontend compat
                date: new Date().toLocaleString(),
                customer: document.getElementById('recCustName') ? document.getElementById('recCustName').value : 'Walk-in',
                phone: document.getElementById('recCustPhone') ? document.getElementById('recCustPhone').value : '',
                items: currentMode === 'retailer' ? [...cart] : [...returnCart],
                total: netAmount,
                type: currentMode,
                method: paymentMethod || 'Cash',
                billedBy: currentUser ? currentUser.username : 'Unknown'
            };
            transactions.push(bill);

            // modify stock in DB and memory
            const stockUpdates = [];
            bill.items.forEach(i => {
                const p = products.find(x => x.id == i.id || x.productId == i.id);
                if (p) {
                    if (currentMode === 'retailer') p.stock -= i.qty;
                    else p.stock += i.qty;
                    p.productId = p.productId || p.id;
                    stockUpdates.push(p);
                }
            });

            closeModal();
            if (currentMode === 'retailer') { cart = []; activeSearchId = null; }
            else returnCart = [];
            billHoldItems = [];

            alert(currentMode === 'retailer' ? 'Payment Successful!' : 'Return Processed!');
            renderAll();
            
            // Save bill and updated stock to DynamoDB
            await apiPost('/bills', bill);
            for(const item of stockUpdates) {
                await apiPost('/products', item);
            }
        }"""

# 12. Save Settings
save_settings_orig = """function saveStoreSettings() {
            storeSettings.name = document.getElementById('setStoreName').value || 'Store Name';
            storeSettings.phone = document.getElementById('setStorePhone').value || '';
            storeSettings.address = document.getElementById('setStoreAddress').value || '';
            storeSettings.gstRate = parseFloat(document.getElementById('setGstRate').value) || 0;
            alert('Settings Saved');
            renderAll();
        }"""
save_settings_new = """async function saveStoreSettings() {
            storeSettings.name = document.getElementById('setStoreName').value || 'Store Name';
            storeSettings.phone = document.getElementById('setStorePhone').value || '';
            storeSettings.address = document.getElementById('setStoreAddress').value || '';
            storeSettings.gstRate = parseFloat(document.getElementById('setGstRate').value) || 0;
            alert('Settings Saved');
            renderAll();
            await apiPost('/settings', storeSettings);
        }"""
        
# Fix any x.id references in templates since Dynamo uses productId or billId
content = content.replace("x => x.id", "x => x.productId == id || x.id")

# Execute replacements
content = content.replace(add_item_orig, add_item_new)
content = content.replace(delete_item_orig, delete_item_new)
content = content.replace(add_user_orig, add_user_new)
content = content.replace(del_user_orig, del_user_new)
content = content.replace(bulk_markup_orig, bulk_markup_new)
content = content.replace(fin_txn_orig, fin_txn_new)
content = content.replace(save_settings_orig, save_settings_new)

# Sub stockout with regex because of formatting changes
content = re.sub(r'function applyStockOutSale\(\) \{[\s\S]*?renderAll\(\);\s*\}', stock_out_replacement, content)

with open(input_path, "w", encoding="utf-8") as f:
    f.write(content)

print("index.html rewritten successfully with DynamoDB integration logic.")
