// Application Logic for Hardware Shop Accounting & Inventory PWA

class HardwareShopApp {
    constructor() {
        this.db = null;
        this.currentView = 'home';
        this.cart = [];
        this.lastDeletedItem = null;
        this.lastAction = null;
        this.settings = {
            theme: 'light',
            currency: 'ج.م',
            digits: 'western', // 'western' or 'arabic'
            pin: null
        };
        this.initStorageRequest();
        this.initDB();
    }

    async initStorageRequest() {
        if (navigator.storage && navigator.storage.persist) {
            const isPersisted = await navigator.storage.persisted();
            if (!isPersisted) {
                await navigator.storage.persist();
            }
        }
    }

    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('HardwareShopDB', 1);

            request.onerror = (event) => {
                console.error('IndexedDB error:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.loadSettings();
                this.loadInitialData();
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains('items')) {
                    const itemsStore = db.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
                    itemsStore.createIndex('name', 'name', { unique: false });
                    itemsStore.createIndex('barcode', 'barcode', { unique: false });
                }

                if (!db.objectStoreNames.contains('persons')) {
                    const personsStore = db.createObjectStore('persons', { keyPath: 'id', autoIncrement: true });
                    personsStore.createIndex('name', 'name', { unique: false });
                    personsStore.createIndex('type', 'type', { unique: false }); // 'customer' or 'supplier'
                }

                if (!db.objectStoreNames.contains('invoices')) {
                    const invoicesStore = db.createObjectStore('invoices', { keyPath: 'id', autoIncrement: true });
                    invoicesStore.createIndex('date', 'date', { unique: false });
                    invoicesStore.createIndex('type', 'type', { unique: false }); // 'sale', 'purchase', 'return'
                }

                if (!db.objectStoreNames.contains('expenses')) {
                    db.createObjectStore('expenses', { keyPath: 'id', autoIncrement: true });
                }

                if (!db.objectStoreNames.contains('daily_closes')) {
                    db.createObjectStore('daily_closes', { keyPath: 'id', autoIncrement: true });
                }

                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    async loadSettings() {
        const tx = this.db.transaction('settings', 'readonly');
        const store = tx.objectStore('settings');
        const req = store.get('app_settings');
        req.onsuccess = () => {
            if (req.result) {
                this.settings = req.result.value;
                this.applyTheme();
            }
        };
    }

    async saveSettings() {
        const tx = this.db.transaction('settings', 'readwrite');
        const store = tx.objectStore('settings');
        store.put({ key: 'app_settings', value: this.settings });
    }

    applyTheme() {
        document.body.setAttribute('data-theme', this.settings.theme);
        const toggleBtn = document.getElementById('theme-toggle');
        if (toggleBtn) {
            toggleBtn.textContent = this.settings.theme === 'dark' ? '☀️' : '🌙';
        }
    }

    toggleTheme() {
        this.settings.theme = this.settings.theme === 'light' ? 'dark' : 'light';
        this.applyTheme();
        this.saveSettings();
    }

    async loadInitialData() {
        // Check if items exist, if not seed sample data
        const tx = this.db.transaction('items', 'readonly');
        const store = tx.objectStore('items');
        const countReq = store.count();

        countReq.onsuccess = async () => {
            if (countReq.result === 0) {
                await this.seedSampleData();
            }
            this.refreshCurrentView();
        };
    }

    async seedSampleData() {
        const sampleItems = [
            { name: 'مسامير صلب 5سم', category: 'مسامير', unit: 'كيلو', buyPrice: 35, sellPrice: 45, qty: 50, minQty: 10, barcode: '1001', notes: 'ممتازة' },
            { name: 'مفتاح ربط إنجليزي', category: 'عدد يدوية', unit: 'قطعة', buyPrice: 120, sellPrice: 150, qty: 15, minQty: 3, barcode: '1002', notes: 'أصلي' },
            { name: 'شريط قياس 5 متر', category: 'عدد يدوية', unit: 'قطعة', buyPrice: 40, sellPrice: 60, qty: 25, minQty: 5, barcode: '1003', notes: '' },
            { name: 'سلك نحاس 2 ملي', category: 'كهرباء', unit: 'لفة', buyPrice: 200, sellPrice: 240, qty: 8, minQty: 2, barcode: '1004', notes: 'لفة 100م' },
            { name: 'صارخ قطع حديد', category: 'صواريخ وتقطيع', unit: 'قطعة', buyPrice: 650, sellPrice: 800, qty: 4, minQty: 1, barcode: '1005', notes: 'ضمان سنة' }
        ];

        const samplePersons = [
            { name: 'محمد أحمد (عميل)', type: 'customer', phone: '01012345678', address: 'شارع الهرم' },
            { name: 'شركة التوحيد للحديد (مورد)', type: 'supplier', phone: '01198765432', address: 'المنطقة الصناعية' }
        ];

        const tx = this.db.transaction(['items', 'persons'], 'readwrite');
        const itemStore = tx.objectStore('items');
        sampleItems.forEach(item => itemStore.add(item));

        const personStore = tx.objectStore('persons');
        samplePersons.forEach(p => personStore.add(p));
    }

    switchView(viewName) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

        const targetView = document.getElementById(`view-${viewName}`);
        if (targetView) targetView.classList.add('active');

        // Find and activate corresponding nav item
        const navMap = { home: 0, sell: 1, items: 2, accounts: 3, reports: 4 };
        const navItems = document.querySelectorAll('.nav-item');
        if (navItems[navMap[viewName]]) {
            navItems[navMap[viewName]].classList.add('active');
        }

        this.currentView = viewName;
        this.refreshCurrentView();
    }

    refreshCurrentView() {
        if (this.currentView === 'home') {
            this.renderHome();
        } else if (this.currentView === 'sell') {
            this.renderPosGrid();
            this.loadCustomersDropdown();
        } else if (this.currentView === 'items') {
            this.renderItemsList();
        } else if (this.currentView === 'accounts') {
            this.renderAccountsList();
        } else if (this.currentView === 'reports') {
            this.loadReport('daily');
        }
    }

    // --- HOME & ALERTS ---
    renderHome() {
        // Calculate today's sales & profit
        const today = new Date().toISOString().split('T')[0];
        const tx = this.db.transaction(['invoices', 'items'], 'readonly');
        const invoiceStore = tx.objectStore('invoices');
        const req = invoiceStore.getAll();

        req.onsuccess = () => {
            const invoices = req.result;
            let todaySales = 0;
            let todayProfit = 0;
            let lowStockItems = [];
            let outOfStockItems = [];

            invoices.forEach(inv => {
                if (inv.date.startsWith(today) && inv.type === 'sale') {
                    todaySales += inv.grandTotal;
                    todayProfit += (inv.totalProfit || 0);
                }
            });

            document.getElementById('home-today-sales').textContent = this.formatNumber(todaySales) + ' ' + this.settings.currency;
            document.getElementById('home-today-profit').textContent = this.formatNumber(todayProfit) + ' ' + this.settings.currency;

            // Check low stock & alerts
            const itemTx = this.db.transaction('items', 'readonly');
            const itemStore = itemTx.objectStore('items');
            const itemReq = itemStore.getAll();

            itemReq.onsuccess = () => {
                const items = itemReq.result;
                let alertsHtml = '';

                items.forEach(item => {
                    if (item.qty <= 0) {
                        alertsHtml += `<div class="badge badge-danger" style="display: block; margin-bottom: 6px; padding: 8px;">❌ نفد من المخزن: ${item.name}</div>`;
                    } else if (item.qty <= (item.minQty || 5)) {
                        alertsHtml += `<div class="badge badge-warning" style="display: block; margin-bottom: 6px; padding: 8px;">⚠️ مخزن منخفض: ${item.name} (المتبقي: ${item.qty} ${item.unit})</div>`;
                    }
                });

                if (alertsHtml === '') {
                    alertsHtml = '<p style="color: var(--text-muted); font-size: 0.9rem;">لا توجد تنبيهات حالياً. المخزن بحالة ممتاز! 👍</p>';
                }

                document.getElementById('alerts-list').innerHTML = alertsHtml;
            };
        };
    }

    // --- POS / SELL SCREEN ---
    renderPosGrid(filter = '') {
        const tx = this.db.transaction('items', 'readonly');
        const store = tx.objectStore('items');
        const req = store.getAll();

        req.onsuccess = () => {
            const items = req.result;
            const grid = document.getElementById('pos-grid');
            grid.innerHTML = '';

            const filtered = items.filter(item =>
                item.name.toLowerCase().includes(filter.toLowerCase()) ||
                (item.barcode && item.barcode.includes(filter)) ||
                (item.category && item.category.toLowerCase().includes(filter.toLowerCase()))
            );

            if (filtered.length === 0) {
                grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">لا توجد أصناف تطابق البحث</p>';
                return;
            }

            filtered.forEach(item => {
                const div = document.createElement('div');
                div.className = 'pos-item-card';
                div.innerHTML = `
                    <div class="item-name">${item.name}</div>
                    <div class="item-price">${item.sellPrice} ${this.settings.currency}</div>
                    <div class="item-stock">متوفر: ${item.qty} ${item.unit}</div>
                `;
                div.onclick = () => this.addToCart(item);
                grid.appendChild(div);
            });
        };
    }

    filterPosItems(val) {
        this.renderPosGrid(val);
    }

    addToCart(item) {
        const existing = this.cart.find(i => i.id === item.id);
        if (existing) {
            existing.qty += 1;
        } else {
            this.cart.push({
                id: item.id,
                name: item.name,
                sellPrice: item.sellPrice,
                buyPrice: item.buyPrice,
                qty: 1,
                maxQty: item.qty,
                unit: item.unit
            });
        }
        this.renderCart();
    }

    renderCart() {
        const tbody = document.getElementById('cart-items-body');
        tbody.innerHTML = '';

        if (this.cart.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">السلة فارغة</td></tr>';
            this.updateCartTotals();
            return;
        }

        this.cart.forEach((item, index) => {
            const total = item.sellPrice * item.qty;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.name}</td>
                <td>${item.sellPrice}</td>
                <td>
                    <button onclick="app.changeCartQty(${index}, -1)" style="padding: 2px 6px;">-</button>
                    <span style="margin: 0 4px; font-weight: 700;">${item.qty}</span>
                    <button onclick="app.changeCartQty(${index}, 1)" style="padding: 2px 6px;">+</button>
                </td>
                <td>${total}</td>
                <td><button onclick="app.removeFromCart(${index})" style="background: none; border: none; color: var(--danger); cursor: pointer;">❌</button></td>
            `;
            tbody.appendChild(tr);
        });

        this.updateCartTotals();
    }

    changeCartQty(index, delta) {
        this.cart[index].qty += delta;
        if (this.cart[index].qty <= 0) {
            this.cart.splice(index, 1);
        }
        this.renderCart();
    }

    removeFromCart(index) {
        this.cart.splice(index, 1);
        this.renderCart();
    }

    toggleInvoiceType() {
        const type = document.getElementById('invoice-type').value;
        const custContainer = document.getElementById('customer-select-container');
        custContainer.style.display = type === 'credit' ? 'block' : 'none';
    }

    loadCustomersDropdown() {
        const tx = this.db.transaction('persons', 'readonly');
        const store = tx.objectStore('persons');
        const req = store.getAll();

        req.onsuccess = () => {
            const persons = req.result.filter(p => p.type === 'customer');
            const select = document.getElementById('invoice-customer-id');
            select.innerHTML = '<option value="">-- اختر العميل --</option>';
            persons.forEach(p => {
                select.innerHTML += `<option value="${p.id}">${p.name} (${p.phone || 'بدون هاتف'})</option>`;
            });
        };
    }

    updateCartTotals() {
        let subtotal = this.cart.reduce((sum, item) => sum + (item.sellPrice * item.qty), 0);

        const discountInput = document.getElementById('invoice-discount').value.trim();
        let discount = 0;
        if (discountInput.endsWith('%')) {
            const percent = parseFloat(discountInput) || 0;
            discount = (subtotal * percent) / 100;
        } else {
            discount = parseFloat(discountInput) || 0;
        }

        const grandTotal = Math.max(0, subtotal - discount);
        const paidInput = document.getElementById('invoice-paid');

        // If cash, paid equals grandTotal by default if not set
        const type = document.getElementById('invoice-type').value;
        if (type === 'cash' && (paidInput.value == 0 || paidInput.dataset.manual !== 'true')) {
            paidInput.value = grandTotal;
        }

        const paid = parseFloat(paidInput.value) || 0;
        const remainder = Math.max(0, grandTotal - paid);

        document.getElementById('cart-grand-total').textContent = this.formatNumber(grandTotal) + ' ' + this.settings.currency;
        document.getElementById('cart-remainder').textContent = this.formatNumber(remainder) + ' ' + this.settings.currency;
    }

    completeSale() {
        if (this.cart.length === 0) {
            Swal.fire('تنبيه', 'السلة فارغة!', 'warning');
            return;
        }

        const type = document.getElementById('invoice-type').value;
        const customerId = document.getElementById('invoice-customer-id').value;

        if (type === 'credit' && !customerId) {
            Swal.fire('تنبيه', 'يرجى اختيار العميل لفاتورة الأجل', 'warning');
            return;
        }

        let subtotal = this.cart.reduce((sum, item) => sum + (item.sellPrice * item.qty), 0);
        const discountInput = document.getElementById('invoice-discount').value.trim();
        let discount = 0;
        if (discountInput.endsWith('%')) {
            discount = (subtotal * (parseFloat(discountInput) || 0)) / 100;
        } else {
            discount = parseFloat(discountInput) || 0;
        }
        const grandTotal = Math.max(0, subtotal - discount);
        const paid = parseFloat(document.getElementById('invoice-paid').value) || 0;
        const remainder = Math.max(0, grandTotal - paid);

        // Calculate total profit
        let totalProfit = this.cart.reduce((sum, item) => sum + ((item.sellPrice - item.buyPrice) * item.qty), 0) - discount;

        const invoice = {
            date: new Date().toISOString(),
            type: 'sale',
            invoiceType: type, // cash or credit
            customerId: customerId ? parseInt(customerId) : null,
            items: [...this.cart],
            subtotal,
            discount,
            grandTotal,
            paid,
            remainder,
            totalProfit
        };

        const tx = this.db.transaction(['invoices', 'items', 'persons'], 'readwrite');

        // 1. Save invoice
        const invStore = tx.objectStore('invoices');
        const addReq = invStore.add(invoice);

        // 2. Update stock & check low stock warnings
        const itemStore = tx.objectStore('items');
        this.cart.forEach(cartItem => {
            itemStore.get(cartItem.id).onsuccess = (e) => {
                let dbItem = e.target.result;
                if (dbItem) {
                    dbItem.qty -= cartItem.qty;
                    itemStore.put(dbItem);
                }
            };
        });

        // 3. Update customer debt if credit or partial payment remainder
        if (remainder > 0 && customerId) {
            const personStore = tx.objectStore('persons');
            personStore.get(parseInt(customerId)).onsuccess = (e) => {
                let customer = e.target.result;
                if (customer) {
                    customer.balance = (customer.balance || 0) + remainder;
                    personStore.put(customer);
                }
            };
        }

        tx.oncomplete = () => {
            this.lastAction = { type: 'sale', invoice };
            this.cart = [];
            this.renderCart();
            document.getElementById('invoice-discount').value = '0';
            document.getElementById('invoice-paid').value = '0';
            this.showToast('✅ تم إتمام الفاتورة بنجاح', true);
            this.renderHome();
        };

        tx.onerror = (e) => {
            Swal.fire('خطأ', 'حدث خطأ أثناء حفظ الفاتورة', 'error');
        };
    }

    // --- ITEMS MANAGEMENT ---
    renderItemsList(filter = '') {
        const tx = this.db.transaction('items', 'readonly');
        const store = tx.objectStore('items');
        const req = store.getAll();

        req.onsuccess = () => {
            const items = req.result;
            const container = document.getElementById('items-list');
            container.innerHTML = '';

            const filtered = items.filter(item =>
                item.name.toLowerCase().includes(filter.toLowerCase()) ||
                (item.barcode && item.barcode.includes(filter)) ||
                (item.category && item.category.toLowerCase().includes(filter.toLowerCase()))
            );

            if (filtered.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">لا توجد أصناف</p>';
                return;
            }

            filtered.forEach(item => {
                const div = document.createElement('div');
                div.className = 'card';
                div.style.marginBottom = '8px';
                div.style.padding = '12px';
                div.innerHTML = `
                    <div class="flex-between">
                        <strong>${item.name}</strong>
                        <span class="badge ${item.qty <= (item.minQty || 5) ? 'badge-danger' : 'badge-success'}">المخزن: ${item.qty} ${item.unit}</span>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">
                        التصنيف: ${item.category || 'عام'} | شراء: ${item.buyPrice} | بيع: ${item.sellPrice} ${this.settings.currency}
                    </div>
                    <div style="margin-top: 8px; display: flex; gap: 6px;">
                        <button class="btn" style="padding: 4px 8px; font-size: 0.8rem;" onclick="app.openItemModal(${item.id})">✏️ تعديل</button>
                        <button class="btn btn-danger" style="padding: 4px 8px; font-size: 0.8rem;" onclick="app.deleteItem(${item.id})">🗑️ حذف</button>
                    </div>
                `;
                container.appendChild(div);
            });
        };
    }

    async openItemModal(itemId = null) {
        let item = { name: '', category: 'عام', unit: 'قطعة', buyPrice: 0, sellPrice: 0, qty: 0, minQty: 5, barcode: '', notes: '' };
        if (itemId) {
            const tx = this.db.transaction('items', 'readonly');
            const store = tx.objectStore('items');
            const req = store.get(itemId);
            await new Promise(resolve => {
                req.onsuccess = () => { item = req.result; resolve(); };
            });
        }

        const { value: formValues } = await Swal.fire({
            title: itemId ? 'تعديل صنف' : 'إضافة صنف جديد',
            html: `
                <input id="swal-name" class="swal2-input" placeholder="اسم الصنف" value="${item.name}">
                <input id="swal-category" class="swal2-input" placeholder="التصنيف (مثال: مسامير، كهرباء)" value="${item.category}">
                <div style="display: flex; gap: 8px;">
                    <input id="swal-buy" type="number" class="swal2-input" placeholder="سعر الشراء" value="${item.buyPrice}">
                    <input id="swal-sell" type="number" class="swal2-input" placeholder="سعر البيع" value="${item.sellPrice}">
                </div>
                <div style="display: flex; gap: 8px;">
                    <input id="swal-qty" type="number" class="swal2-input" placeholder="الكمية الحالية" value="${item.qty}">
                    <input id="swal-minqty" type="number" class="swal2-input" placeholder="حد التنبيه" value="${item.minQty}">
                </div>
                <input id="swal-unit" class="swal2-input" placeholder="الوحدة (قطعة، كيلو، لفة)" value="${item.unit}">
                <input id="swal-barcode" class="swal2-input" placeholder="الباركود (اختياري)" value="${item.barcode || ''}">
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'حفظ',
            cancelButtonText: 'إلغاء',
            preConfirm: () => {
                return {
                    name: document.getElementById('swal-name').value,
                    category: document.getElementById('swal-category').value || 'عام',
                    buyPrice: parseFloat(document.getElementById('swal-buy').value) || 0,
                    sellPrice: parseFloat(document.getElementById('swal-sell').value) || 0,
                    qty: parseFloat(document.getElementById('swal-qty').value) || 0,
                    minQty: parseFloat(document.getElementById('swal-minqty').value) || 5,
                    unit: document.getElementById('swal-unit').value || 'قطعة',
                    barcode: document.getElementById('swal-barcode').value,
                }
            }
        });

        if (formValues) {
            if (!formValues.name) {
                Swal.fire('خطأ', 'يرجى إدخال اسم الصنف', 'error');
                return;
            }

            const tx = this.db.transaction('items', 'readwrite');
            const store = tx.objectStore('items');
            if (itemId) {
                formValues.id = itemId;
                store.put(formValues);
            } else {
                store.add(formValues);
            }

            tx.oncomplete = () => {
                this.showToast('✅ تم حفظ الصنف بنجاح');
                this.refreshCurrentView();
            };
        }
    }

    async openInlineItemModal() {
        const { value: formValues } = await Swal.fire({
            title: 'إضافة صنف سريع أثناء البيع',
            html: `
                <input id="swal-inline-name" class="swal2-input" placeholder="اسم الصنف">
                <input id="swal-inline-sell" type="number" class="swal2-input" placeholder="سعر البيع">
                <input id="swal-inline-buy" type="number" class="swal2-input" placeholder="سعر الشراء">
                <input id="swal-inline-qty" type="number" class="swal2-input" placeholder="الكمية المتوفرة" value="10">
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'إضافة وسد للسلة',
            cancelButtonText: 'إلغاء',
            preConfirm: () => {
                return {
                    name: document.getElementById('swal-inline-name').value,
                    category: 'عام',
                    buyPrice: parseFloat(document.getElementById('swal-inline-buy').value) || 0,
                    sellPrice: parseFloat(document.getElementById('swal-inline-sell').value) || 0,
                    qty: parseFloat(document.getElementById('swal-inline-qty').value) || 10,
                    unit: 'قطعة',
                    minQty: 3
                }
            }
        });

        if (formValues && formValues.name) {
            const tx = this.db.transaction('items', 'readwrite');
            const store = tx.objectStore('items');
            const req = store.add(formValues);
            req.onsuccess = (e) => {
                formValues.id = e.target.result;
                this.addToCart(formValues);
                this.showToast('✅ تم إضافة الصنف ووضعه بالسلة');
            };
        }
    }

    deleteItem(id) {
        Swal.fire({
            title: 'هل أنت متأكد من الحذف؟',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'نعم، احذف',
            cancelButtonText: 'إلغاء'
        }).then((result) => {
            if (result.isConfirmed) {
                const tx = this.db.transaction('items', 'readwrite');
                const store = tx.objectStore('items');
                store.get(id).onsuccess = (e) => {
                    const item = e.target.result;
                    store.delete(id);
                    tx.oncomplete = () => {
                        this.lastDeletedItem = item;
                        this.showToast('🗑️ تم حذف الصنف', true);
                        this.refreshCurrentView();
                    };
                };
            }
        });
    }

    // --- ACCOUNTS / CUSTOMERS / SUPPLIERS ---
    setPersonFilter(type) {
        ['all', 'customers', 'suppliers'].forEach(t => {
            const btn = document.getElementById(`filter-${t}`);
            if (btn) {
                btn.className = t === type ? 'btn' : 'btn btn-secondary';
            }
        });
        this.renderAccountsList('', type);
    }

    renderAccountsList(filter = '', typeFilter = 'all') {
        const tx = this.db.transaction('persons', 'readonly');
        const store = tx.objectStore('persons');
        const req = store.getAll();

        req.onsuccess = () => {
            let persons = req.result;
            if (typeFilter === 'customer') persons = persons.filter(p => p.type === 'customer');
            if (typeFilter === 'supplier') persons = persons.filter(p => p.type === 'supplier');

            const container = document.getElementById('accounts-list');
            container.innerHTML = '';

            const filtered = persons.filter(p =>
                p.name.toLowerCase().includes(filter.toLowerCase()) ||
                (p.phone && p.phone.includes(filter))
            );

            if (filtered.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">لا توجد حسابات</p>';
                return;
            }

            filtered.forEach(person => {
                const balance = person.balance || 0;
                const div = document.createElement('div');
                div.className = 'card';
                div.style.marginBottom = '8px';
                div.style.padding = '12px';
                div.innerHTML = `
                    <div class="flex-between">
                        <strong>${person.name}</strong>
                        <span class="badge ${person.type === 'customer' ? 'badge-warning' : 'badge-danger'}">${person.type === 'customer' ? 'عميل' : 'مورد'}</span>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">
                        الهاتف: ${person.phone || 'غير مسجل'} | الرصيد: <strong style="color: ${balance > 0 ? 'var(--danger)' : 'var(--success)'};">${balance} ${this.settings.currency}</strong>
                    </div>
                    <div style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
                        <button class="btn" style="padding: 4px 8px; font-size: 0.8rem;" onclick="app.openPersonStatement(${person.id})">📋 كشف حساب</button>
                        ${person.phone ? `<button class="btn btn-success" style="padding: 4px 8px; font-size: 0.8rem;" onclick="app.sendWhatsAppReminder(${person.id})">💬 واتساب</button>` : ''}
                        <button class="btn btn-warning" style="padding: 4px 8px; font-size: 0.8rem;" onclick="app.openPaymentModal(${person.id})">💰 تسجيل دفعة</button>
                    </div>
                `;
                container.appendChild(div);
            });
        };
    }

    async openPersonModal() {
        const { value: formValues } = await Swal.fire({
            title: 'إضافة عميل أو مورد جديد',
            html: `
                <input id="swal-p-name" class="swal2-input" placeholder="اسم العميل أو المورد">
                <select id="swal-p-type" class="swal2-input">
                    <option value="customer">عميل (له ديون / مبيعات)</option>
                    <option value="supplier">مورد (له مستحقات / مشريات)</option>
                </select>
                <input id="swal-p-phone" class="swal2-input" placeholder="رقم الهاتف (لل واتساب)">
                <input id="swal-p-address" class="swal2-input" placeholder="العنوان (اختياري)">
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'حفظ',
            cancelButtonText: 'إلغاء',
            preConfirm: () => {
                return {
                    name: document.getElementById('swal-p-name').value,
                    type: document.getElementById('swal-p-type').value,
                    phone: document.getElementById('swal-p-phone').value,
                    address: document.getElementById('swal-p-address').value,
                    balance: 0
                }
            }
        });

        if (formValues && formValues.name) {
            const tx = this.db.transaction('persons', 'readwrite');
            const store = tx.objectStore('persons');
            store.add(formValues);
            tx.oncomplete = () => {
                this.showToast('✅ تم إضافة الحساب بنجاح');
                this.refreshCurrentView();
            };
        }
    }

    async openPaymentModal(personId) {
        const tx = this.db.transaction('persons', 'readonly');
        const store = tx.objectStore('persons');
        const req = store.get(personId);

        req.onsuccess = async () => {
            const person = req.result;
            const { value: amount } = await Swal.fire({
                title: `تسجيل دفعة لـ: ${person.name}`,
                text: `الرصيد الحالي: ${person.balance || 0} ${this.settings.currency}`,
                input: 'number',
                inputPlaceholder: 'أدخل مبلغ الدفعة المسددة',
                showCancelButton: true,
                confirmButtonText: 'تسجيل',
                cancelButtonText: 'إلغاء'
            });

            if (amount) {
                const paidAmount = parseFloat(amount) || 0;
                person.balance = Math.max(0, (person.balance || 0) - paidAmount);

                const updateTx = this.db.transaction('persons', 'readwrite');
                updateTx.objectStore('persons').put(person);
                updateTx.oncomplete = () => {
                    this.showToast('✅ تم تسجيل الدفعة وتحديث الرصيد');
                    this.refreshCurrentView();
                };
            }
        };
    }

    sendWhatsAppReminder(personId) {
        const tx = this.db.transaction('persons', 'readonly');
        const store = tx.objectStore('persons');
        store.get(personId).onsuccess = (e) => {
            const person = e.target.result;
            if (!person || !person.phone) return;

            const msg = `مرحباً ${person.name}، نذكركم بأن إجمالي المبالغ المستحقة عليكم لصالح المحل هو: ${person.balance || 0} ${this.settings.currency}. شكراً لكم!`;
            const cleanPhone = person.phone.replace(/\D/g, '');
            window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
        };
    }

    openPersonStatement(personId) {
        const tx = this.db.transaction(['persons', 'invoices'], 'readonly');
        const pStore = tx.objectStore('persons');
        pStore.get(personId).onsuccess = (e) => {
            const person = e.target.result;
            const invStore = tx.objectStore('invoices');
            invStore.getAll().onsuccess = (ev) => {
                const invoices = ev.result.filter(inv => inv.customerId === personId || inv.supplierId === personId);

                let html = `<div style="text-align: right; max-height: 300px; overflow-y: auto;">`;
                html += `<p><strong>الرصيد الحالي:</strong> ${person.balance || 0} ${this.settings.currency}</p><hr style="margin: 8px 0;">`;

                if (invoices.length === 0) {
                    html += `<p>لا توجد فواتير مسجلة لهذا الحساب.</p>`;
                } else {
                    invoices.forEach(inv => {
                        html += `<div style="background: var(--card-bg); border: 1px solid var(--border); padding: 8px; border-radius: 6px; margin-bottom: 6px;">
                            <div class="flex-between"><span>تاريخ: ${new Date(inv.date).toLocaleDateString('ar-EG')}</span> <span>المجموع: ${inv.grandTotal}</span></div>
                            <div>المدفوع: ${inv.paid} | المتبقي (دين): ${inv.remainder}</div>
                        </div>`;
                    });
                }
                html += `</div>`;

                Swal.fire({
                    title: `كشف حساب: ${person.name}`,
                    html: html,
                    confirmButtonText: 'إغلاق',
                    showDenyButton: true,
                    denyButtonText: '💬 إرسال واتساب'
                }).then((result) => {
                    if (result.isDenied) {
                        this.sendWhatsAppReminder(personId);
                    }
                });
            };
        };
    }

    // --- REPORTS ---
    loadReport(period) {
        ['daily', 'weekly', 'monthly'].forEach(p => {
            // style buttons
        });

        const tx = this.db.transaction(['invoices', 'expenses'], 'readonly');
        const invStore = tx.objectStore('invoices');
        const expStore = tx.objectStore('expenses');

        invStore.getAll().onsuccess = (e) => {
            const invoices = e.target.result;
            expStore.getAll().onsuccess = (ev) => {
                const expenses = ev.target.result;

                const now = new Date();
                let filteredInvoices = invoices.filter(inv => {
                    const invDate = new Date(inv.date);
                    if (period === 'daily') {
                        return invDate.toDateString() === now.toDateString();
                    } else if (period === 'weekly') {
                        const diffTime = Math.abs(now - invDate);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        return diffDays <= 7;
                    } else if (period === 'monthly') {
                        return invDate.getMonth() === now.getMonth() && invDate.getFullYear() === now.getFullYear();
                    }
                    return true;
                });

                let totalSales = 0;
                let totalProfit = 0;
                let cashIn = 0;
                let totalPurchases = 0;
                let totalExpenses = 0;

                filteredInvoices.forEach(inv => {
                    if (inv.type === 'sale') {
                        totalSales += inv.grandTotal;
                        totalProfit += (inv.totalProfit || 0);
                        cashIn += (inv.paid || 0);
                    } else if (inv.type === 'purchase') {
                        totalPurchases += inv.grandTotal;
                    }
                });

                expenses.forEach(exp => {
                    const expDate = new Date(exp.date);
                    if (period === 'daily' && expDate.toDateString() === now.toDateString()) totalExpenses += exp.amount;
                    if (period === 'monthly' && expDate.getMonth() === now.getMonth()) totalExpenses += exp.amount;
                });

                const netProfit = totalProfit - totalExpenses;

                const html = `
                    <div style="display: grid; gap: 8px;">
                        <div class="flex-between" style="background: rgba(2, 132, 199, 0.1); padding: 10px; border-radius: 8px;">
                            <span>إجمالي المبيعات:</span>
                            <strong>${this.formatNumber(totalSales)} ${this.settings.currency}</strong>
                        </div>
                        <div class="flex-between" style="background: rgba(22, 163, 74, 0.1); padding: 10px; border-radius: 8px;">
                            <span>إجمالي الأرباح (إجمالي):</span>
                            <strong style="color: var(--success);">${this.formatNumber(totalProfit)} ${this.settings.currency}</strong>
                        </div>
                        <div class="flex-between" style="background: rgba(202, 138, 4, 0.1); padding: 10px; border-radius: 8px;">
                            <span>النقدية الداخلة (كاش):</span>
                            <strong>${this.formatNumber(cashIn)} ${this.settings.currency}</strong>
                        </div>
                        <div class="flex-between" style="background: rgba(220, 38, 38, 0.1); padding: 10px; border-radius: 8px;">
                            <span>المصاريف المسجلة:</span>
                            <strong style="color: var(--danger);">${this.formatNumber(totalExpenses)} ${this.settings.currency}</strong>
                        </div>
                        <div class="flex-between" style="background: rgba(2, 132, 199, 0.15); padding: 10px; border-radius: 8px; font-size: 1.1rem;">
                            <span>صافي الربح (بعد المصاريف):</span>
                            <strong style="color: var(--primary);">${this.formatNumber(netProfit)} ${this.settings.currency}</strong>
                        </div>
                    </div>
                `;

                document.getElementById('report-content').innerHTML = html;
            };
        };
    }

    exportReportExcel() {
        // Export CSV format for Excel
        const tx = this.db.transaction('invoices', 'readonly');
        tx.objectStore('invoices').getAll().onsuccess = (e) => {
            const invoices = e.target.result;
            let csv = 'ID,Date,Type,GrandTotal,Paid,Remainder\n';
            invoices.forEach(inv => {
                csv += `${inv.id},${inv.date},${inv.type},${inv.grandTotal},${inv.paid},${inv.remainder}\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `hardware_shop_report_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
        };
    }

    // --- EXPENSES & DAILY CLOSE ---
    async openExpensesModal() {
        const { value: formValues } = await Swal.fire({
            title: 'تسجيل مصروف جديد',
            html: `
                <select id="swal-exp-cat" class="swal2-input">
                    <option value="إيجار">إيجار</option>
                    <option value="كهرباء ومياه">كهرباء ومياه</option>
                    <option value="رواتب">رواتب</option>
                    <option value="أخرى">أخرى</option>
                </select>
                <input id="swal-exp-amount" type="number" class="swal2-input" placeholder="المبلغ">
                <input id="swal-exp-notes" class="swal2-input" placeholder="ملاحظات / بيان">
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'حفظ المصروف',
            cancelButtonText: 'إلغاء',
            preConfirm: () => {
                return {
                    category: document.getElementById('swal-exp-cat').value,
                    amount: parseFloat(document.getElementById('swal-exp-amount').value) || 0,
                    notes: document.getElementById('swal-exp-notes').value,
                    date: new Date().toISOString()
                }
            }
        });

        if (formValues && formValues.amount > 0) {
            const tx = this.db.transaction('expenses', 'readwrite');
            tx.objectStore('expenses').add(formValues);
            tx.oncomplete = () => {
                this.showToast('✅ تم تسجيل المصروف بنجاح');
            };
        }
    }

    async openDailyCloseModal() {
        const { value: countedCash } = await Swal.fire({
            title: 'إقفال اليوم (حساب النقدية)',
            input: 'number',
            inputPlaceholder: 'أدخل النقدية الفعلية الموجودة بالدرج',
            showCancelButton: true,
            confirmButtonText: 'إتمام الإقفال',
            cancelButtonText: 'إلغاء'
        });

        if (countedCash !== undefined) {
            const counted = parseFloat(countedCash) || 0;
            // Calculate expected cash today
            const today = new Date().toISOString().split('T')[0];
            const tx = this.db.transaction('invoices', 'readonly');
            tx.objectStore('invoices').getAll().onsuccess = (e) => {
                const invoices = e.target.result;
                let expectedCash = 0;
                invoices.forEach(inv => {
                    if (inv.date.startsWith(today) && inv.type === 'sale') {
                        expectedCash += (inv.paid || 0);
                    }
                });

                const diff = counted - expectedCash;
                Swal.fire({
                    title: 'نتيجة الإقفال',
                    html: `
                        <p>النقدية المتوقعة: <strong>${expectedCash}</strong></p>
                        <p>النقدية الفعلية بالدرج: <strong>${counted}</strong></p>
                        <p>الفارق: <strong style="color: ${diff === 0 ? 'var(--success)' : 'var(--danger)'};">${diff}</strong></p>
                    `,
                    icon: diff === 0 ? 'success' : 'warning'
                });
            };
        }
    }

    // --- BACKUP & RESTORE ---
    exportDataJSON() {
        const stores = ['items', 'persons', 'invoices', 'expenses', 'daily_closes', 'settings'];
        const exportData = {};
        let completed = 0;

        stores.forEach(storeName => {
            const tx = this.db.transaction(storeName, 'readonly');
            tx.objectStore(storeName).getAll().onsuccess = (e) => {
                exportData[storeName] = e.target.result;
                completed++;
                if (completed === stores.length) {
                    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `hardware_shop_backup_${new Date().toISOString().split('T')[0]}.json`;
                    a.click();
                    this.showToast('💾 تم تصدير النسخة الاحتياطية بنجاح');
                }
            };
        });
    }

    triggerImportJSON() {
        document.getElementById('import-file-input').click();
    }

    importDataJSON(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const stores = Object.keys(data);

                stores.forEach(storeName => {
                    if (this.db.objectStoreNames.contains(storeName)) {
                        const tx = this.db.transaction(storeName, 'readwrite');
                        const store = tx.objectStore(storeName);
                        store.clear();
                        data[storeName].forEach(item => store.add(item));
                    }
                });

                Swal.fire('نجاح', 'تم استعادة البيانات بنجاح!', 'success').then(() => {
                    location.reload();
                });
            } catch (err) {
                Swal.fire('خطأ', 'ملف النسخة الاحتياطية غير صالح', 'error');
            }
        };
        reader.readAsText(file);
    }

    // --- UTILS & TOAST ---
    showToast(message, canUndo = false) {
        const toast = document.getElementById('toast');
        document.getElementById('toast-msg').textContent = message;
        const undoBtn = document.getElementById('toast-undo');
        undoBtn.style.display = canUndo ? 'inline-block' : 'none';

        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 4000);
    }

    undoLastAction() {
        if (!this.lastAction) return;

        if (this.lastAction.type === 'sale') {
            const inv = this.lastAction.invoice;
            // Revert stock and invoices
            const tx = this.db.transaction(['invoices', 'items'], 'readwrite');
            // Remove invoice or mark reverted
            tx.objectStore('invoices').delete(inv.id);

            inv.items.forEach(cartItem => {
                tx.objectStore('items').get(cartItem.id).onsuccess = (e) => {
                    let dbItem = e.target.result;
                    if (dbItem) {
                        dbItem.qty += cartItem.qty;
                        tx.objectStore('items').put(dbItem);
                    }
                };
            });

            tx.oncomplete = () => {
                this.lastAction = null;
                this.showToast('↩️ تم التراجع عن الفاتورة واستعادة المخزن');
                this.refreshCurrentView();
            };
        }
    }

    formatNumber(num) {
        return Number(num || 0).toLocaleString('en-US');
    }

    promptPin() {
        Swal.fire({
            title: 'إعداد قفل الأمان (PIN)',
            input: 'password',
            inputPlaceholder: 'أدخل رقم سرّي (اختياري)',
            showCancelButton: true,
            confirmButtonText: 'حفظ القفل',
            cancelButtonText: 'إلغاء'
        }).then((res) => {
            if (res.value !== undefined) {
                this.settings.pin = res.value;
                this.saveSettings();
                this.showToast('🔒 تم تحديث قفل الأمان');
            }
        });
    }
}

const app = new HardwareShopApp();
