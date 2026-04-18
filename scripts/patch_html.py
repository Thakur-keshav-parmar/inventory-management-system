"""3 quick UI fixes in index.html"""

f = r'C:\Users\DRAGOO\OneDrive\Desktop\DEMO\index.html'
with open(f, 'r', encoding='utf-8') as fh:
    html = fh.read()

LE = '\r\n' if '\r\n' in html else '\n'
print(f"File size: {len(html)}, LE: {repr(LE)}")

# ── Fix 1: Hide custDetailsSection when printing ──────────────────────────────
# Add rule to existing @media print block
old_print_css = '        @media print {'
new_print_css = (
    '        @media print {' + LE +
    '            #custDetailsSection { display: none !important; }'
)
if old_print_css in html:
    html = html.replace(old_print_css, new_print_css, 1)
    print("[OK] Added @media print rule to hide custDetailsSection")
else:
    print("[FAIL] @media print block not found")

# ── Fix 2: Hide zero-stock products in the shop grid ─────────────────────────
# In renderGrid(), change the filter so stock==0 products are hidden
old_filter = (
    '            const filtered = currentCat === \'All\' ? products : products.filter(p => p.category === currentCat);'
)
new_filter = (
    '            // Hide zero-stock products in shop/return mode\n'
    '            const visibleProducts = products.filter(p => p.stock > 0);\n'
    '            const filtered = currentCat === \'All\' ? visibleProducts : visibleProducts.filter(p => p.category === currentCat);'
)
old_filter_norm = old_filter.replace('\n', LE)
new_filter_norm = new_filter.replace('\n', LE)
if old_filter_norm in html:
    html = html.replace(old_filter_norm, new_filter_norm, 1)
    print("[OK] renderGrid: zero-stock products hidden from shop view")
elif old_filter in html:
    html = html.replace(old_filter, new_filter, 1)
    print("[OK] renderGrid: zero-stock products hidden (LF match)")
else:
    print("[FAIL] renderGrid filter line not found")
    import re
    m = re.search(r'const filtered = currentCat.*products', html)
    if m:
        print(f"  Found at {m.start()}: {repr(html[m.start():m.start()+120])}")

# ── Fix 3: Sort transactions newest-first in logs ─────────────────────────────
# In renderLogsAndCustomers(), sort before building rows
old_logs_render = (
    '            else {\n'
    '                logsTbody.innerHTML = transactions.map(t => {'
)
new_logs_render = (
    '            else {\n'
    '                const sortedTx = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));\n'
    '                logsTbody.innerHTML = sortedTx.map(t => {'
)
old_logs_norm = old_logs_render.replace('\n', LE)
new_logs_norm = new_logs_render.replace('\n', LE)
if old_logs_norm in html:
    html = html.replace(old_logs_norm, new_logs_norm, 1)
    print("[OK] Transaction logs sorted newest-first")
elif old_logs_render in html:
    html = html.replace(old_logs_render, new_logs_render, 1)
    print("[OK] Transaction logs sorted newest-first (LF match)")
else:
    print("[FAIL] logs render block not found")
    idx = html.find('logsTbody.innerHTML = transactions.map')
    print(f"  'logsTbody.innerHTML' at: {idx}")
    if idx > 0:
        print(repr(html[idx-60:idx+80]))

print(f"\nFinal size: {len(html)}")
with open(f, 'w', encoding='utf-8') as fh:
    fh.write(html)
print("File saved.")
